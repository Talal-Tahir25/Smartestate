/**
 * EstatoAI - Admin Dashboard Logic
 * Aggregates platform-wide activity (User Signups, Listings, Predictions)
 * for a comprehensive administrative view.
 */

import { query, collection, orderBy, getDocs, doc, getDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

// Configuration
const ADMIN_EMAIL = 'admin@estatoai.com';

// UI Elements
const tableBody = document.getElementById('activityTableBody');
const loader = document.getElementById('loadingIndicator');

// Stats Elements
const statTotalUsers = document.getElementById('statTotalUsers');
const statBuyers = document.getElementById('statBuyers');
const statSellers = document.getElementById('statSellers');
const statAgents = document.getElementById('statAgents');

const statTotalListings = document.getElementById('statTotalListings');
const statPublicListings = document.getElementById('statPublicListings');
const statPrivateListings = document.getElementById('statPrivateListings');

const statTotalPredictions = document.getElementById('statTotalPredictions');

// --- Auth & Init ---

checkAuthState(async (user) => {
    // Nav Visibility Logic (Shared)
    const adminLink = document.getElementById('adminLink');
    const listPropertyLink = document.getElementById('listPropertyLink');
    const inventoryLink = document.getElementById('inventoryLink');
    const authLink = document.getElementById('authLink');

    if (user) {
        if (authLink) {
            authLink.textContent = 'Logout';
            authLink.href = '#';
            authLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
        }

        if (adminLink) adminLink.style.display = (user.email === ADMIN_EMAIL) ? 'inline-flex' : 'none';

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const role = (userDoc.data().role || '').toLowerCase();
                if (listPropertyLink) listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';
                if (inventoryLink) inventoryLink.style.display = (role === 'agent') ? 'inline-flex' : 'none';
            }
        } catch (e) { console.error(e); }
    }

    // Admin Access Check
    if (!user) {
        window.location.href = 'login.html';
    } else if (user.email !== ADMIN_EMAIL) {
        alert("Access Denied: Administrator privileges required.");
        window.location.href = 'index.html';
    } else {
        // Init Dashboard
        loadDashboardData();
    }
});

// Logout Listener
const authLogoutBtn = document.getElementById('authLogout');
if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

// --- Main Dashboard Logic ---

async function loadDashboardData() {
    try {
        // Parallel Data Fetching - Removed orderBy to prevent "Missing Index" errors
        // We are sorting in memory in aggregateActivities() anyway.
        const [usersSnap, listingsSnap, predictionsSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "listings")),
            getDocs(collection(db, "predictions"))
        ]);

        // 1. Process Stats
        updateUserStats(usersSnap);
        updateListingStats(listingsSnap);
        updatePredictionStats(predictionsSnap);

        // 2. Aggregate & Normalize Activity Feed
        const activities = aggregateActivities(usersSnap, listingsSnap, predictionsSnap);

        // 3. Render Table
        renderActivityTable(activities);

    } catch (error) {
        console.error("Dashboard Load Error:", error);
        if (loader) {
            loader.innerHTML = `
                <div class="text-center px-4">
                    <p class="text-rose-500 font-bold uppercase tracking-widest mb-2">Error Loading Data</p>
                    <p class="text-slate-400 text-xs font-mono bg-black/20 p-2 rounded">${error.message}</p>
                </div>
            `;
        }
    }
}

function updateUserStats(snapshot) {
    let total = 0, buyers = 0, sellers = 0, agents = 0;

    snapshot.forEach(doc => {
        total++;
        const role = (doc.data().role || '').toLowerCase();
        if (role === 'buyer') buyers++;
        else if (role === 'seller' || role === 'both') sellers++; // Sellers commonly listed as both or seller
        else if (role === 'agent') agents++;
    });

    statTotalUsers.textContent = total;
    statBuyers.textContent = buyers;
    statSellers.textContent = sellers;
    statAgents.textContent = agents;
}

function updateListingStats(snapshot) {
    let total = 0, pub = 0, priv = 0;

    snapshot.forEach(doc => {
        total++;
        const visibility = doc.data().visibility || 'Public';
        if (visibility === 'Private') priv++;
        else pub++;
    });

    statTotalListings.textContent = total;
    statPublicListings.textContent = pub;
    statPrivateListings.textContent = priv;
}

function updatePredictionStats(snapshot) {
    statTotalPredictions.textContent = snapshot.size;
}

// --- Activity Aggregation ---

let cachedActivities = []; // Store activities globally for filtering

window.filterActivity = function (type) {
    // Update Tab Styles
    ['ALL', 'SIGNUP', 'LISTING', 'PREDICTION'].forEach(t => {
        const btn = document.getElementById(`tab${t === 'ALL' ? 'All' : t + 's'}`);
        if (btn) {
            if (t === type) {
                btn.className = "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white bg-slate-700 shadow-sm transition-all";
            } else {
                btn.className = "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-all";
            }
        }
    });

    // Filter Data
    if (type === 'ALL') {
        renderActivityTable(cachedActivities);
    } else {
        const filtered = cachedActivities.filter(item => item.type === type);
        renderActivityTable(filtered);
    }
}

function aggregateActivities(users, listings, predictions) {
    let allEvents = [];

    // Norm: Users (New Signups)
    users.forEach(doc => {
        const data = doc.data();
        allEvents.push({
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(0),
            type: 'SIGNUP',
            user: data.email || 'Unknown',
            role: data.role || 'User',
            action: 'New User Registration',
            details: `Joined as ${data.role}`,
            rawDate: data.timestamp
        });
    });

    // Norm: Listings (New Property)
    listings.forEach(doc => {
        const data = doc.data();
        allEvents.push({
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(0),
            type: 'LISTING',
            user: data.email || 'Unknown',
            role: 'Seller/Agent', // Inferred
            action: `Listed Property (${data.visibility || 'Public'})`,
            details: `${data.sector || ''} Block ${data.block || ''} - ${data.type}`,
            rawDate: data.timestamp
        });
    });

    // Norm: Predictions (AI Usage)
    predictions.forEach(doc => {
        const data = doc.data();
        const price = (data.predictedPrice / 1000000).toFixed(2) + 'M';
        allEvents.push({
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(0),
            type: 'PREDICTION',
            user: 'Anonymous/User', // Often predictions are anon or just logged by ID
            role: 'User',
            action: 'AI Price Prediction',
            details: `${data.location} (${price} PKR)`,
            rawDate: data.timestamp
        });
    });

    // Sort Descending by Time
    cachedActivities = allEvents.sort((a, b) => b.timestamp - a.timestamp);
    return cachedActivities;
}

function renderActivityTable(activities) {
    if (loader) loader.classList.add('hidden');
    tableBody.innerHTML = '';

    if (activities.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-500">No recent activity found.</td></tr>`;
        return;
    }

    activities.forEach(item => {
        const timeStr = item.timestamp.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Color coding by type
        let typeBadgeClass = 'bg-slate-700 text-slate-300';
        if (item.type === 'SIGNUP') typeBadgeClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        if (item.type === 'LISTING') typeBadgeClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        if (item.type === 'PREDICTION') typeBadgeClass = 'bg-purple-500/20 text-purple-400 border border-purple-500/30';

        const row = `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 last:border-0">
                <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-mono">${timeStr}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-white">${item.user.split('@')[0]}</span>
                        <span class="text-[10px] text-slate-500 uppercase tracking-wide">${item.role}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${typeBadgeClass}">
                        ${item.action}
                    </span>
                </td>
                <td class="px-6 py-4 text-xs text-slate-300 font-medium">
                    ${item.details}
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}
