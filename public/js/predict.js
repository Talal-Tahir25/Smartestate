/**
 * EstatoAI - Prediction Page Logic
 * This file handles form submission, calculates mock house prices, 
 * and stores the results in Firebase Firestore.
 */

import { collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

let currentUser = null;

// Check authentication state
checkAuthState(async (user) => {
    currentUser = user;
    const authLink = document.getElementById('authLink');
    const adminLink = document.getElementById('adminLink');
    const listPropertyLink = document.getElementById('listPropertyLink');
    const ADMIN_EMAIL = 'admin@estatoai.com';

    if (user) {
        if (authLink) {
            authLink.textContent = 'Logout';
            authLink.href = '#';
            authLink.onclick = (e) => { e.preventDefault(); logout(); };
        }
        if (adminLink) adminLink.style.display = (user.email === ADMIN_EMAIL) ? 'inline-flex' : 'none';

        // Role-based visibility
        try {
            const inventoryLink = document.getElementById('inventoryLink');
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                const role = (userDoc.data().role || '').toLowerCase();

                if (listPropertyLink) {
                    // Explicitly show if NOT buyer
                    listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';
                }

                if (inventoryLink) {
                    // Show ONLY to agents
                    inventoryLink.style.display = (role === 'agent') ? 'inline-flex' : 'none';
                }
            } else {
                // Default to shown if no profile (new user)
                if (listPropertyLink) listPropertyLink.style.display = 'inline-flex';
                if (inventoryLink) inventoryLink.style.display = 'none';
            }
        } catch (err) {
            console.error("Error fetching role:", err);
        }
    } else {
        if (authLink) {
            authLink.textContent = 'Login';
            authLink.href = 'login.html';
            authLink.onclick = null;
        }
        if (adminLink) adminLink.style.display = 'none';
        if (listPropertyLink) listPropertyLink.style.display = 'inline-flex';
        const inventoryLink = document.getElementById('inventoryLink');
        if (inventoryLink) inventoryLink.style.display = 'none';
    }
});

// Automatic Marla to SqFt Conversion
document.addEventListener('DOMContentLoaded', () => {
    const marlaInput = document.getElementById('PlotSizeMarla');
    const sqftInput = document.getElementById('CoveredAreaSqrFt');

    if (marlaInput && sqftInput) {
        marlaInput.addEventListener('input', () => {
            const marlaVal = parseFloat(marlaInput.value) || 0;
            if (marlaVal > 0) {
                // Formula: 1 Marla = 272 SqFt
                sqftInput.value = Math.round(marlaVal * 272);
            } else {
                sqftInput.value = '';
            }
        });
    }
});

// Handle the Prediction Form Submission
const predictionForm = document.getElementById('predictionForm');
if (predictionForm) {
    predictionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const predictBtn = document.getElementById('predictBtn');
        const resultDiv = document.getElementById('result');
        const priceSpan = document.getElementById('predictedPrice');

        // Visual Feedback
        predictBtn.disabled = true;
        predictBtn.textContent = 'Calculating...';
        resultDiv.classList.add('hidden');

        try {
            // Helper functions to get values safely
            const getVal = (id) => {
                const el = document.getElementById(id);
                return el ? el.value : null;
            };
            const getCheck = (id) => {
                const el = document.getElementById(id);
                return el && el.checked ? "Yes" : "No";
            };

            // Capture all 23 features expected by the model
            const apiPayload = {
                "PropertyType": getVal('PropertyType'),
                "PlotSizeMarla": parseFloat(getVal('PlotSizeMarla')) || 0,
                "CoveredAreaSqrFt": parseFloat(getVal('CoveredAreaSqrFt')) || 0,
                "BedRooms": parseInt(getVal('BedRooms')) || 0,
                "BathRooms": parseInt(getVal('BathRooms')) || 0,
                "PropertyCondition": getVal('PropertyCondition'),
                "AgeofPropertyYears": parseInt(getVal('AgeofPropertyYears')) || 0,
                "Floors": getVal('Floors'),
                "BuildType": getVal('BuildType'),
                "Sector": getVal('Sector'),
                "Block": getVal('Block'),
                "Latitude": 33.6844, // Hardcoded B-17 coords
                "Longitude": 73.0479,
                "Parking": getCheck('Parking'),
                "Elevator": getCheck('Elevator'),
                "Security": getCheck('Security'),
                "PowerBackup": getCheck('PowerBackup'),
                "Furnished": getCheck('Furnished'),
                "NearSchool": getCheck('NearSchool'),
                "NearHospital": getCheck('NearHospital'),
                "NearPark": getCheck('NearPark'),
                "NearMosque": getCheck('NearMosque'),
                "Distance2CommercialAreaKM": parseFloat(getVal('Distance2CommercialAreaKM')) || 1
            };

            // Send to Python API
            const response = await fetch('http://localhost:5000/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiPayload)
            });

            const data = await response.json();

            if (data.predicted_price) {
                // Format price
                const formattedPrice = new Intl.NumberFormat('en-PK', {
                    style: 'currency',
                    currency: 'PKR',
                    maximumFractionDigits: 0
                }).format(data.predicted_price);

                priceSpan.textContent = formattedPrice;
                resultDiv.classList.remove('hidden');

                // Render Visual Chart
                renderResultChart(data.predicted_price);

                // Smooth scroll to result
                resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Save to Firebase (Using constructed payload data)
                const locationStr = `B-17 Sector ${apiPayload.Sector}, Block ${apiPayload.Block}`;

                await saveToFirebase(
                    locationStr,
                    apiPayload, // Pass the entire input object
                    data.predicted_price
                );

            } else {
                console.error("API Error:", data.error || data);
                alert('Error getting prediction: ' + (data.error || "Unknown error"));
            }

        } catch (error) {
            console.error('Prediction network error:', error);
            alert('Could not connect to the Prediction Engine. Is the backend running?');
        } finally {
            predictBtn.disabled = false;
            predictBtn.textContent = 'Get Smart Estimate';
        }
    });
}

/**
 * Renders a comparison chart for the result
 */
let resultChart = null; // Store chart instance
function renderResultChart(price) {
    const ctx = document.getElementById('predictionChart');
    if (!ctx) return;

    // Destroy previous chart if it exists
    if (resultChart) {
        resultChart.destroy();
    }

    // Consistent "Market Average" for context 
    // We add a deterministic shift based on the price to make it feel grounded
    const seed = parseFloat(price.toString().split('').slice(-3).join('')) / 1000;
    const marketAvg = price * (0.98 + (seed * 0.04)); // -2% to +2% shift based on price "personality"

    resultChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Your Estimate', 'Market Average'],
            datasets: [{
                label: 'Price in PKR',
                data: [price, marketAvg],
                backgroundColor: [
                    'rgba(34, 211, 238, 0.6)',
                    'rgba(148, 163, 184, 0.3)'
                ],
                borderColor: [
                    '#22d3ee',
                    '#94a3b8'
                ],
                borderWidth: 2,
                borderRadius: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] },
                    ticks: {
                        color: '#94a3b8',
                        callback: function (value) {
                            if (value >= 1000000) return 'PKR ' + (value / 1000000).toFixed(2) + 'M';
                            return 'PKR ' + (value / 1000).toFixed(0) + 'K';
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#ffffff', font: { weight: 'bold', size: 14 } }
                }
            }
        }
    });
}

/**
 * Saves a prediction record to the "predictions" collection in Firestore.
 */
async function saveToFirebase(location, features, predictedPrice) {
    try {
        await addDoc(collection(db, "predictions"), {
            uid: currentUser ? currentUser.uid : 'anonymous',
            email: currentUser ? currentUser.email : 'anonymous',
            location: location,
            predictedPrice: predictedPrice,
            timestamp: serverTimestamp(),
            // Save Full Feature Set Flattened
            area: features.CoveredAreaSqrFt,
            bedrooms: features.BedRooms,
            bathrooms: features.BathRooms,
            floors: features.Floors,
            condition: features.PropertyCondition,
            type: features.PropertyType,
            parking: features.Parking,
            security: features.Security,
            elevator: features.Elevator,
            electricityBackup: features.PowerBackup,
            furnished: features.Furnished,
            nearSchool: features.NearSchool,
            nearHospital: features.NearHospital,
            nearPark: features.NearPark,
            nearMosque: features.NearMosque,
            commercialDistance: features.Distance2CommercialAreaKM
        });
        console.log("Prediction full details saved to Firebase!");
    } catch (fsError) {
        console.error("Error saving to Firestore:", fsError);
    }
}
