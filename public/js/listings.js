/**
 * SmartEstate - Marketplace Logic
 * Fetches and displays property listings from Firestore.
 */

import { collection, query, orderBy, where, getDocs, doc, getDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

const listingsGrid = document.getElementById('listingsGrid');
const loader = document.getElementById('listingsLoader');
const noResults = document.getElementById('noResults');
const typeFilter = document.getElementById('typeFilter');
const sectorFilter = document.getElementById('sectorFilter');

let allListings = [];
let currentUser = null;

// Track Auth State
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
    fetchListings(); // Fetch with awareness of user
});

// Real-time listener for listings
function fetchListings() {
    // Only fetch Public listings.
    // REMOVED orderBy("timestamp") to avoid "Missing Index" error. Sorting client-side instead.
    const q = query(collection(db, "listings"), where("visibility", "==", "Public"));

    // Use onSnapshot for real-time updates
    onSnapshot(q, (snapshot) => {
        allListings = [];
        snapshot.forEach((doc) => {
            allListings.push({ id: doc.id, ...doc.data() });
        });

        // Client-side Sort: Newest First
        allListings.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        applyFilters();
    }, (error) => {
        console.error("Error fetching listings:", error);
        loader.innerHTML = `<p class="text-rose-400">Error loading properties.</p>`;
    });
}

// Event Listeners for Filters
typeFilter.addEventListener('change', applyFilters);
sectorFilter.addEventListener('change', applyFilters);

/**
 * Filters the listings based on user selection.
 */
function applyFilters() {
    const selectedType = typeFilter.value;
    const selectedSector = sectorFilter.value;

    const filtered = allListings.filter(item => {
        // 1. Privacy Filter: Only show Public listings in the marketplace
        if (item.visibility === 'Private') return false;

        // 2. Search Filters
        const matchesType = selectedType === 'All' || item.type === selectedType;
        const matchesSector = selectedSector === 'All' || item.sector === selectedSector;
        return matchesType && matchesSector;
    });

    renderListings(filtered);
}

/**
 * Renders the property cards into the grid.
 */
function renderListings(listings) {
    loader.classList.add('hidden');
    listingsGrid.innerHTML = '';

    if (listings.length === 0) {
        listingsGrid.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    listingsGrid.classList.remove('hidden');

    listings.forEach(item => {
        const priceFormatted = new Intl.NumberFormat('en-PK').format(item.price);
        const hasImages = item.images && item.images.length > 0;
        const mainImage = hasImages ? item.images[0] : null;
        const isOwner = currentUser && currentUser.uid === item.uid;
        const status = item.status || "Available";

        const card = `
            <div class="glass-panel rounded-3xl overflow-hidden property-card transition-all border border-slate-700/50 flex flex-col group cursor-pointer" onclick="window.location.href='listing-details.html?id=${item.id}'">
                <div class="h-48 bg-slate-800 relative flex items-center justify-center overflow-hidden">
                    ${mainImage ?
                `<img src="${mainImage}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${status !== 'Available' ? 'grayscale opacity-50' : ''}">` :
                `<svg class="w-20 h-20 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                        </svg>`
            }
                    <div class="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${item.type === 'Sale' ? 'bg-cyan-500 text-white' : 'bg-amber-500 text-white'} shadow-lg">
                        For ${item.type}
                    </div>
                    ${status !== 'Available' ? `
                        <div class="absolute inset-0 flex items-center justify-center bg-black/60">
                            <span class="text-3xl font-black uppercase tracking-widest text-white border-4 border-white px-4 py-1 -rotate-12">${status}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="p-6 flex-grow">
                    <div class="text-2xl font-bold text-cyan-400 mb-1">${priceFormatted} PKR</div>
                    <h3 class="text-lg font-bold text-white truncate mb-2">${item.title}</h3>
                    <div class="text-sm text-slate-400 flex items-center gap-2 mb-4">
                        <svg class="w-4 h-4 text-cyan-500" fill="currentColor" viewBox="0 0 20 20"><path d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"/></svg>
                        Sector ${item.sector}, Block ${item.block}
                    </div>
                    
                    <div class="grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-4 pb-4">
                        <div class="text-center">
                            <span class="block text-xs text-slate-500 uppercase tracking-tighter">Beds</span>
                            <span class="font-bold text-white">${item.bedrooms}</span>
                        </div>
                        <div class="text-center border-x border-slate-700/50">
                            <span class="block text-xs text-slate-500 uppercase tracking-tighter">Baths</span>
                            <span class="font-bold text-white">${item.bathrooms}</span>
                        </div>
                        <div class="text-center">
                            <span class="block text-xs text-slate-500 uppercase tracking-tighter">Size</span>
                            <span class="font-bold text-white">${item.size} M</span>
                        </div>
                    </div>

                    <div class="mt-4 flex gap-2">
                        <a href="listing-details.html?id=${item.id}" class="flex-1 bg-white/5 hover:bg-cyan-600/20 hover:text-cyan-400 border border-white/5 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all text-center">
                            View Details
                        </a>
                        ${isOwner ? `
                            <button onclick="event.stopPropagation(); window.deleteListing('${item.id}')" 
                                class="bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-600/30 p-3 rounded-xl transition-all">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        listingsGrid.innerHTML += card;
    });
}

/**
 * Owner Actions: Update Status
 */
window.updateListingStatus = async (id, newStatus) => {
    if (!confirm(`Are you sure you want to mark this as ${newStatus}?`)) return;
    try {
        await updateDoc(doc(db, "listings", id), { status: newStatus });
    } catch (error) {
        console.error("Error updating status:", error);
        alert("Failed to update status.");
    }
};

/**
 * Owner Actions: Delete Listing
 */
window.deleteListing = async (id) => {
    if (!confirm("Are you sure you want to delete this listing permanently?")) return;
    try {
        await deleteDoc(doc(db, "listings", id));
    } catch (error) {
        console.error("Error deleting listing:", error);
        alert("Failed to delete listing.");
    }
};
