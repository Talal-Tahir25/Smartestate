import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from './firebase-config.js';
import { checkAuthState, logout } from './auth.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    const authLink = document.getElementById('authLink');

    // Update UI based on auth state
    checkAuthState(async (user) => {
        const adminLink = document.getElementById('adminLink');
        const listPropertyLink = document.getElementById('listPropertyLink');
        const ADMIN_EMAIL = 'admin@estatoai.com';

        if (user) {
            if (authLink) {
                authLink.textContent = 'Logout';
                authLink.href = '#';
                authLink.onclick = (e) => { e.preventDefault(); logout(); };
            }

            // Admin Link visibility
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
                    // Default for new users
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

    // Fetch and display metrics
    fetchMetrics();

    // Render the Accuracy Chart
    renderAccuracyChart();

    // Initialize Map
    initMap();
});

/**
 * Renders the "Predicted vs Actual" comparison chart using Chart.js
 */
/**
 * Renders "Average Price by Sector" using real Firestore data
 */
/**
 * Renders "Sector-wise High/Low" Logic
 */
async function renderAccuracyChart() {
    const ctx = document.getElementById('accuracyChart');
    if (!ctx) return;

    try {
        const sectorData = await getSectorStats();

        const sectors = Object.keys(sectorData).sort();

        if (sectors.length === 0) {
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['No Data'],
                    datasets: [{ label: 'Waiting for Predictions...', data: [0], backgroundColor: 'rgba(255,255,255,0.1)' }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
            return;
        }

        const maxPrices = sectors.map(s => sectorData[s].max.price);
        const minPrices = sectors.map(s => sectorData[s].min.price);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sectors.map(s => `Sector ${s}`),
                datasets: [
                    {
                        label: 'Max Predicted Price',
                        data: maxPrices,
                        backgroundColor: 'rgba(34, 211, 238, 0.7)', // Cyan
                        hoverBackgroundColor: 'rgba(34, 211, 238, 1)',
                        borderColor: '#22d3ee',
                        borderWidth: 1,
                        borderRadius: 6,
                        barPercentage: 0.6,
                        categoryPercentage: 0.8
                    },
                    {
                        label: 'Min Predicted Price',
                        data: minPrices,
                        backgroundColor: 'rgba(99, 102, 241, 0.7)', // Indigo
                        hoverBackgroundColor: 'rgba(99, 102, 241, 1)',
                        borderColor: '#6366f1',
                        borderWidth: 1,
                        borderRadius: 6,
                        barPercentage: 0.6,
                        categoryPercentage: 0.8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const datasetIndex = elements[0].datasetIndex;
                        const sector = sectors[index];

                        // datasetIndex 0 = Max, 1 = Min
                        const record = datasetIndex === 0 ? sectorData[sector].max.data : sectorData[sector].min.data;
                        showPredictionDetails(record);
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1' },
                        display: true
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8', callback: function (value) { return (value / 1000000) + 'M'; } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#ffffff', font: { weight: 'bold' } }
                    }
                }
            }
        });

    } catch (err) {
        console.error("Chart Error:", err);
    }
}

function showPredictionDetails(data) {
    const container = document.getElementById('predictionDetails');
    const priceEl = document.getElementById('detailPrice');
    const locEl = document.getElementById('detailLocation');
    const featEl = document.getElementById('detailFeatures');

    container.classList.remove('hidden');

    // Animate scroll
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });

    priceEl.textContent = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(data.predictedPrice);
    locEl.textContent = data.location;

    // Helper for "Yes/No" or "-"
    const getBool = (val) => {
        if (!val || val === '-') return '-';
        return val;
    };

    // Features Grid - Extended
    featEl.innerHTML = `
        <div class="text-center p-3 bg-slate-800 rounded-lg border border-slate-700">
            <span class="block text-xs text-slate-500 uppercase">Area</span>
            <span class="block font-bold text-white text-lg">${data.area || '-'} <span class="text-sm font-normal text-slate-400">sqft</span></span>
        </div>
        <div class="text-center p-3 bg-slate-800 rounded-lg border border-slate-700">
            <span class="block text-xs text-slate-500 uppercase">Beds / Baths</span>
            <span class="block font-bold text-white text-lg">${data.bedrooms || '-'} / ${data.bathrooms || '-'}</span>
        </div>
        <div class="text-center p-3 bg-slate-800 rounded-lg border border-slate-700">
            <span class="block text-xs text-slate-500 uppercase">Floors</span>
            <span class="block font-bold text-white text-lg">${data.floors || '-'}</span>
        </div>
        <div class="text-center p-3 bg-slate-800 rounded-lg border border-slate-700">
            <span class="block text-xs text-slate-500 uppercase">Condition</span>
            <span class="block font-bold text-white text-lg">${data.condition || '-'}</span>
        </div>
        
        <!-- Boolean Features -->
        <div class="text-center p-2 bg-slate-800 rounded-lg flex flex-col items-center justify-center">
            <span class="block text-xs text-slate-500">Parking</span>
            <span class="block font-bold ${data.parking === 'Yes' ? 'text-emerald-400' : 'text-slate-600'}">${getBool(data.parking)}</span>
        </div>
        <div class="text-center p-2 bg-slate-800 rounded-lg flex flex-col items-center justify-center">
            <span class="block text-xs text-slate-500">Security</span>
            <span class="block font-bold ${data.security === 'Yes' ? 'text-emerald-400' : 'text-slate-600'}">${getBool(data.security)}</span>
        </div>
        <div class="text-center p-2 bg-slate-800 rounded-lg flex flex-col items-center justify-center">
            <span class="block text-xs text-slate-500">Backup</span>
            <span class="block font-bold ${data.electricityBackup === 'Yes' ? 'text-emerald-400' : 'text-slate-600'}">${getBool(data.electricityBackup)}</span>
        </div>
        <div class="text-center p-2 bg-slate-800 rounded-lg flex flex-col items-center justify-center">
            <span class="block text-xs text-slate-500">Furnished</span>
            <span class="block font-bold ${data.furnished === 'Yes' ? 'text-emerald-400' : 'text-slate-600'}">${getBool(data.furnished)}</span>
        </div>

        <div class="col-span-2 sm:col-span-4 mt-2 pt-2 border-t border-slate-700 flex justify-between text-xs text-slate-500">
            <span>Date: ${data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
            <span>EstatoAI Model v1.0</span>
        </div>
    `;
}

/**
 * Calculations for real-time market metrics from Firestore
 */
async function fetchMetrics() {
    // ... items ...
    const totalEl = document.getElementById('totalPredictions');
    const avgEl = document.getElementById('avgPrice');
    const locEl = document.getElementById('topLocation');

    try {
        const querySnapshot = await getDocs(collection(db, "predictions"));
        const count = querySnapshot.size;

        if (count === 0) {
            totalEl.textContent = '0';
            avgEl.textContent = '0 PKR';
            locEl.textContent = 'None';
            return;
        }

        let totalPrice = 0;
        const locations = {};

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            totalPrice += data.predictedPrice || 0;
            const loc = data.location ? data.location.split(',')[0].trim() : 'Unknown';
            locations[loc] = (locations[loc] || 0) + 1;
        });

        const topLoc = Object.keys(locations).reduce((a, b) => locations[a] > locations[b] ? a : b);

        totalEl.textContent = count.toLocaleString();
        avgEl.textContent = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(totalPrice / count) + ' PKR';
        locEl.textContent = topLoc;

    } catch (error) {
        console.error("Error fetching metrics:", error);
    }
}

/**
 * Initialize Leaflet Map centered on B-17
 */
/**
 * Helper: Fetch and Calculate Sector Stats (Shared by Chart & Map)
 */
async function getSectorStats() {
    try {
        const querySnapshot = await getDocs(collection(db, "predictions"));
        let sectorData = {};

        querySnapshot.forEach(doc => {
            const data = doc.data();
            const location = data.location || "";
            const price = data.predictedPrice || 0;

            const match = location.match(/Sector\s+([A-Z0-9\-\.]+)/i);

            if (match && match[1]) {
                const sector = match[1].toUpperCase();

                if (!sectorData[sector]) {
                    sectorData[sector] = {
                        max: { price: -1, data: null },
                        min: { price: Infinity, data: null },
                        total: 0,
                        count: 0
                    };
                }

                // Stats for Avg
                sectorData[sector].total += price;
                sectorData[sector].count += 1;

                // Check Max
                if (price > sectorData[sector].max.price) {
                    sectorData[sector].max = { price: price, data: data };
                }
                // Check Min
                if (price < sectorData[sector].min.price) {
                    sectorData[sector].min = { price: price, data: data };
                }
            }
        });
        return sectorData;
    } catch (error) {
        console.error("Error calculating sector stats:", error);
        return {};
    }
}

/**
 * Initialize Leaflet Map centered on B-17
 */
async function initMap() {
    const mapEl = document.getElementById('communityMap');
    if (!mapEl) return;

    // Fetch live market data first
    const sectorStats = await getSectorStats();

    // Coords for B-17 Multi Gardens
    const b17Coords = [33.69, 72.82];

    const map = L.map('communityMap', {
        center: b17Coords,
        zoom: 14,
        scrollWheelZoom: false, // Prevent page scroll hijack
        zoomControl: true
    });

    // Dark Mode Tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // B-17 Sector Markers
    const sectors = [
        { name: "Sector A", coords: [33.684, 72.820], id: 'A' },
        { name: "Sector B", coords: [33.692, 72.815], id: 'B' },
        { name: "Sector C", coords: [33.698, 72.825], id: 'C' },
        { name: "Sector C-1", coords: [33.705, 72.828], id: 'C-1' },
        { name: "Sector D", coords: [33.710, 72.835], id: 'D' },
        { name: "Sector E", coords: [33.715, 72.840], id: 'E' },
        { name: "Sector F", coords: [33.720, 72.845], id: 'F' },
    ];

    sectors.forEach(sec => {
        // Get Stats for this Sector
        const stats = sectorStats[sec.id];
        let popupContent = `<div style="color:#333; font-family:'Outfit',sans-serif;">
            <b style="font-size:14px;">${sec.name}</b><br>
            <span style="color:#64748b; font-size:12px;">Multi Gardens B-17</span>
        </div>`;

        if (stats && stats.count > 0) {
            const avg = Math.round(stats.total / stats.count);
            const fmtPrice = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(avg);
            popupContent += `<div style="margin-top:8px; border-top:1px solid #e2e8f0; padding-top:6px;">
                <span style="font-size:11px; color:#64748b;">Avg Estimated Price</span><br>
                <b style="color:#0891b2; font-size:14px;">${fmtPrice}</b>
            </div>`;
        } else {
            popupContent += `<div style="margin-top:8px; padding-top:6px;">
                <span style="font-size:11px; color:#94a3b8; font-style:italic;">No recent data</span>
            </div>`;
        }

        // Custom Icon
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style='background-color:${stats ? '#22d3ee' : '#64748b'};width:12px;height:12px;border-radius:50%;box-shadow:0 0 ${stats ? '15px #22d3ee' : '0px'}; border:2px solid white;'></div>`,
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });

        // Add Marker
        L.marker(sec.coords, { icon: icon }).addTo(map)
            .bindPopup(popupContent)
            .bindTooltip(sec.name, { permanent: true, direction: 'right', className: 'bg-transparent border-0 text-cyan-400 font-bold shadow-none' });
    });
}
