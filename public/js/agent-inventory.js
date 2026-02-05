/**
 * SmartEstate - Agent Inventory Logic
 * Specialized inventory view with advanced granular filters.
 */

import { collection, query, orderBy, where, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

// UI Elements
const inventoryGrid = document.getElementById('inventoryGrid');
const loader = document.getElementById('inventoryLoader');
const noResults = document.getElementById('noResults');
const totalCountEl = document.getElementById('totalCount');
const matchCountEl = document.getElementById('matchCount');

// Filters
const sectorFilter = document.getElementById('sectorFilter');
const blockFilter = document.getElementById('blockFilter');
const typeFilter = document.getElementById('typeFilter');
const priceFilter = document.getElementById('priceFilter');

const btnGlobal = document.getElementById('viewGlobal');
const btnPersonal = document.getElementById('viewPersonal');

let allListings = [];
let currentView = 'Global'; // 'Global' or 'Personal'
let currentAgentUid = null;
const ADMIN_EMAIL = 'admin@estatoai.com';

// Auth Guard & Nav
checkAuthState(async (user) => {
    const listPropertyLink = document.getElementById('listPropertyLink');
    const adminLink = document.getElementById('adminLink');
    const inventoryLink = document.getElementById('inventoryLink');

    if (user) {
        currentAgentUid = user.uid;
        if (adminLink) adminLink.style.display = (user.email === ADMIN_EMAIL) ? 'inline-flex' : 'none';

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const role = (userDoc.data().role || '').toLowerCase();

                // SHOW Inventory link if Agent
                if (inventoryLink) inventoryLink.style.display = (role === 'agent') ? 'inline-flex' : 'none';
                if (listPropertyLink) listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';

                // ACCESS DENIAL if not Agent (and not Admin)
                if (role !== 'agent' && user.email !== ADMIN_EMAIL) {
                    alert("Access Denied: This portal is reserved for Real Estate Agents.");
                    window.location.href = 'index.html';
                    return;
                }
            } else {
                window.location.href = 'profile.html';
                return;
            }
        } catch (err) {
            console.error("Auth check failed:", err);
        }

        fetchInventory();
    } else {
        window.location.href = 'login.html';
    }
});

// View Toggle Logic
btnGlobal.addEventListener('click', () => switchView('Global'));
btnPersonal.addEventListener('click', () => switchView('Personal'));

function switchView(view) {
    currentView = view;
    // Update UI
    if (view === 'Global') {
        btnGlobal.className = "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-cyan-600 text-white shadow-lg";
        btnPersonal.className = "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-white";
    } else {
        btnPersonal.className = "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-cyan-600 text-white shadow-lg";
        btnGlobal.className = "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-white";
    }
    applyFilters();
}

// Real-time Inventory Stream
function fetchInventory() {
    if (!currentAgentUid) return;

    // We must split the query because Security Rules will block "Fetch All" 
    // if there are private docs causing a permission denied.

    // 1. Fetch ALL Public Listings
    const qPublic = query(collection(db, "listings"), where("visibility", "==", "Public"));

    // 2. Fetch MY Listings (Public OR Private)
    const qPersonal = query(collection(db, "listings"), where("uid", "==", currentAgentUid));

    // Combine listeners
    let publicListings = [];
    let personalListings = [];

    const updateAll = () => {
        // Merge arrays and deduplicate by ID
        const combined = [...publicListings];
        personalListings.forEach(pItem => {
            if (!combined.find(c => c.id === pItem.id)) {
                combined.push(pItem);
            }
        });

        // Sort in memory (descending timestamp)
        allListings = combined.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        applyFilters();
    };

    onSnapshot(qPublic, (snap) => {
        publicListings = [];
        snap.forEach(d => publicListings.push({ id: d.id, ...d.data() }));
        updateAll();
    }, err => console.error("Public fetch err:", err));

    onSnapshot(qPersonal, (snap) => {
        personalListings = [];
        snap.forEach(d => personalListings.push({ id: d.id, ...d.data() }));
        updateAll();
    }, err => console.error("Personal fetch err:", err));
}

// Filter Event Listeners
[sectorFilter, blockFilter, typeFilter, priceFilter].forEach(el => {
    el.addEventListener('change', applyFilters);
});

function applyFilters() {
    const sectorValue = sectorFilter.value;
    const blockValue = blockFilter.value;
    const typeValue = typeFilter.value;
    const priceRange = priceFilter.value;

    const filtered = allListings.filter(item => {
        // 1. View Filter (Global vs Personal)
        if (currentView === 'Global') {
            // Global view shows everyone's Public listings
            if (item.visibility === 'Private' && item.uid !== currentAgentUid) return false;
        } else {
            // Personal view shows ONLY current agent's listings (all of them)
            if (item.uid !== currentAgentUid) return false;
        }

        // 2. Search Filters
        const matchesSector = sectorValue === 'All' || item.sector === sectorValue;
        const matchesBlock = blockValue === 'All' || item.block === blockValue;
        const matchesType = typeValue === 'All' || item.type === typeValue;

        let matchesPrice = true;
        const priceM = item.price / 1000000;
        if (priceRange === '0-10') matchesPrice = priceM <= 10;
        else if (priceRange === '10-30') matchesPrice = priceM > 10 && priceM <= 30;
        else if (priceRange === '30-60') matchesPrice = priceM > 30 && priceM <= 60;
        else if (priceRange === '60+') matchesPrice = priceM > 60;

        return matchesSector && matchesBlock && matchesType && matchesPrice;
    });

    totalCountEl.textContent = allListings.length;
    matchCountEl.textContent = filtered.length;
    renderInventory(filtered);
}

function renderInventory(listings) {
    loader.classList.add('hidden');
    inventoryGrid.innerHTML = '';

    if (listings.length === 0) {
        inventoryGrid.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    inventoryGrid.classList.remove('hidden');

    listings.forEach(item => {
        const priceMillions = (item.price / 1000000).toFixed(1);
        const mainImage = item.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
        const status = item.status || "Available";

        const card = `
            <div class="glass-panel rounded-[2.5rem] overflow-hidden inventory-card border border-white/5 flex flex-col group cursor-pointer hover:shadow-cyan-500/10 shadow-2xl transition-all duration-500" onclick="window.location.href='listing-details.html?id=${item.id}'">
                <!-- Image Header -->
                <div class="relative h-56 overflow-hidden">
                    <img src="${mainImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${status !== 'Available' ? 'grayscale opacity-40' : ''}">
                    <!-- Overlays -->
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-60"></div>
                    
                    <div class="absolute top-5 left-5 flex flex-col gap-2">
                        <span class="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${item.type === 'Sale' ? 'bg-cyan-500' : 'bg-orange-500'} text-white shadow-2xl backdrop-blur-md">
                            ${item.type}
                        </span>
                        <span class="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${status === 'Available' ? 'bg-emerald-500/80' : 'bg-rose-500/80'} text-white shadow-2xl backdrop-blur-md">
                            ${status}
                        </span>
                    </div>

                    <div class="absolute bottom-5 left-5 right-5 flex justify-between items-end">
                        <div class="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2">
                            <span class="text-[10px] text-white/60 font-medium block leading-none mb-1">Price</span>
                            <span class="text-xl font-black text-white italic leading-none">${priceMillions}M <span class="text-[10px] font-bold not-italic text-cyan-400">PKR</span></span>
                        </div>
                    </div>
                </div>

                <!-- Content Body -->
                <div class="p-7 flex flex-col flex-grow">
                    <div class="mb-6">
                        <h3 class="text-white font-bold text-lg leading-tight group-hover:text-cyan-400 transition-colors uppercase tracking-tight line-clamp-1 mb-1">${item.title}</h3>
                        <div class="flex items-center gap-2 text-slate-500">
                             <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                             <span class="text-[10px] font-bold uppercase tracking-widest">${item.sector || 'N/A'} - Block ${item.block || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-3 gap-3 mb-8">
                        <div class="bg-white/5 rounded-2xl p-3 border border-white/5 text-center">
                            <span class="block text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1 leading-none">Beds</span>
                            <span class="text-xs font-bold text-white">${item.bedrooms}</span>
                        </div>
                        <div class="bg-white/5 rounded-2xl p-3 border border-white/5 text-center">
                            <span class="block text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1 leading-none">Baths</span>
                            <span class="text-xs font-bold text-white">${item.bathrooms}</span>
                        </div>
                        <div class="bg-white/5 rounded-2xl p-3 border border-white/5 text-center">
                            <span class="block text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1 leading-none">Marla</span>
                            <span class="text-xs font-bold text-white">${item.size}</span>
                        </div>
                    </div>

                    <div class="mt-auto flex items-center justify-between gap-4">
                        <button class="flex-grow bg-white/5 hover:bg-cyan-600 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 hover:text-white py-4 rounded-2xl transition-all duration-300 border border-cyan-500/20 hover:border-cyan-500 hover:shadow-lg hover:shadow-cyan-500/20">
                            View Full Details
                        </button>
                    </div>
                </div>
            </div>
        `;
        inventoryGrid.innerHTML += card;
    });
}

// Logout handler
const authLogoutBtn = document.getElementById('authLogout');
if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}
