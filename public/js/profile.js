/**
 * SmartEstate - Consolidated Dashboard Logic
 * Handles Profile Settings and User-specific Listings Management.
 */

import {
    doc, getDoc, setDoc, serverTimestamp,
    collection, query, where, orderBy, onSnapshot, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

// UI Elements
const profileForm = document.getElementById('profileForm');
const profileMessage = document.getElementById('profileMessage');
const saveBtn = document.getElementById('saveBtn');
const tabSettings = document.getElementById('tabSettings');
const tabListings = document.getElementById('tabListings');
const sectionSettings = document.getElementById('sectionSettings');
const sectionListings = document.getElementById('sectionListings');
const listingsGrid = document.getElementById('listingsGrid');
const loader = document.getElementById('listingsLoader');
const noResults = document.getElementById('noResults');

let currentUser = null;
let userProfile = null;

// --- AUTH & INITIAL LOAD ---

checkAuthState(async (user) => {
    currentUser = user;
    const listPropertyLink = document.getElementById('listPropertyLink'); // Added
    const ADMIN_EMAIL = 'admin@estatoai.com';

    if (user) {
        // Populate standard fields
        document.getElementById('userEmail').value = user.email;
        const adminLink = document.getElementById('adminLink');
        const inventoryLink = document.getElementById('inventoryLink');

        if (adminLink) {
            adminLink.style.display = (user.email === ADMIN_EMAIL) ? 'inline-flex' : 'none';
        }

        // Role-based visibility
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const role = (userDoc.data().role || '').toLowerCase();
                if (listPropertyLink) {
                    listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';
                }
                if (inventoryLink) {
                    inventoryLink.style.display = (role === 'agent') ? 'inline-flex' : 'none';
                }
            } else {
                if (listPropertyLink) listPropertyLink.style.display = 'inline-flex';
                if (inventoryLink) inventoryLink.style.display = 'none';
            }
        } catch (err) {
            console.error("Error fetching role:", err);
        }

        // Fetch profile and then fetch listings
        await fetchUserProfile(user.uid);
        fetchUserListings(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// Setup Auth Link
const authBtn = document.getElementById('authLink');
if (authBtn) {
    authBtn.onclick = (e) => { e.preventDefault(); logout(); };
}

// --- TAB SWITCHING LOGIC ---

tabSettings.addEventListener('click', () => switchTab('settings'));
tabListings.addEventListener('click', () => switchTab('listings'));

function switchTab(tab) {
    if (tab === 'settings') {
        sectionSettings.classList.remove('hidden');
        sectionListings.classList.add('hidden');
        tabSettings.className = "px-6 py-2 rounded-lg text-sm font-bold transition-all bg-cyan-600 text-white shadow-lg";
        tabListings.className = "px-6 py-2 rounded-lg text-sm font-bold transition-all text-slate-400 hover:text-white";
    } else {
        sectionSettings.classList.add('hidden');
        sectionListings.classList.remove('hidden');
        tabListings.className = "px-6 py-2 rounded-lg text-sm font-bold transition-all bg-cyan-600 text-white shadow-lg";
        tabSettings.className = "px-6 py-2 rounded-lg text-sm font-bold transition-all text-slate-400 hover:text-white";
    }
}

// --- PROFILE SETTINGS LOGIC ---

async function fetchUserProfile(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            userProfile = userDoc.data();
            if (userProfile.displayName) document.getElementById('displayName').value = userProfile.displayName;
            if (userProfile.phoneNumber) document.getElementById('phoneNumber').value = userProfile.phoneNumber;
            if (userProfile.role) {
                const roleRadio = document.querySelector(`input[name="role"][value="${userProfile.role}"]`);
                if (roleRadio) roleRadio.checked = true;
            }
        }
    } catch (error) {
        console.error("Error fetching profile:", error);
    }
}

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const displayName = document.getElementById('displayName').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const role = document.querySelector('input[name="role"]:checked')?.value || 'User';

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Changes...';
    hideMessage();

    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            displayName, phoneNumber, role, updatedAt: serverTimestamp()
        }, { merge: true });

        userProfile = { ...userProfile, displayName, phoneNumber, role }; // Update local state
        showMessage('Profile updated successfully!', 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50');
    } catch (error) {
        console.error("Update error:", error);
        showMessage('Error updating profile.', 'bg-rose-500/20 text-rose-400 border border-rose-500/50');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Profile Changes';
    }
});

// --- USER LISTINGS LOGIC ---

function fetchUserListings(uid) {
    const q = query(
        collection(db, "listings"),
        where("uid", "==", uid),
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, (snapshot) => {
        const userListings = [];
        snapshot.forEach((doc) => {
            userListings.push({ id: doc.id, ...doc.data() });
        });
        renderListings(userListings);
    });
}

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
        const mainImage = item.images?.[0] || null;
        const status = item.status || "Available";

        const card = `
            <div class="glass-panel rounded-3xl overflow-hidden property-card transition-all border border-slate-700/50 flex flex-col group">
                <div class="h-48 bg-slate-800/50 relative flex items-center justify-center overflow-hidden">
                    ${mainImage ?
                `<img src="${mainImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${status !== 'Available' ? 'grayscale opacity-40' : ''}">` :
                `<div class="text-slate-700"><svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></div>`
            }
                    <div class="absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.type === 'Sale' ? 'bg-cyan-500 text-white' : 'bg-amber-500 text-white'} shadow-lg ring-1 ring-white/20">
                        ${item.type}
                    </div>
                    ${status !== 'Available' ? `
                        <div class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                            <span class="text-2xl font-black uppercase tracking-[0.2em] text-white border-2 border-white/50 px-4 py-1.5 -rotate-12 shadow-2xl">${status}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="p-6 flex-grow">
                    <div class="text-xl font-black text-cyan-400 mb-1">${priceFormatted} <span class="text-[10px] text-slate-500 uppercase">PKR</span></div>
                    <h3 class="text-sm font-bold text-white truncate mb-4 uppercase tracking-tight">${item.title}</h3>
                    
                    <div class="grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-4 pb-6">
                        <div class="text-center">
                            <span class="block text-[10px] text-slate-500 uppercase font-black tracking-tighter">Beds</span>
                            <span class="text-sm font-bold text-white">${item.bedrooms}</span>
                        </div>
                        <div class="text-center border-x border-white/5">
                            <span class="block text-[10px] text-slate-500 uppercase font-black tracking-tighter">Baths</span>
                            <span class="text-sm font-bold text-white">${item.bathrooms}</span>
                        </div>
                        <div class="text-center">
                            <span class="block text-[10px] text-slate-500 uppercase font-black tracking-tighter">Size</span>
                            <span class="text-sm font-bold text-white">${item.size}M</span>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        ${status === 'Available' ? `
                            <button onclick="window.dashUpdateStatus('${item.id}', '${item.type === 'Sale' ? 'Sold' : 'Rented'}')" 
                                class="flex-1 bg-white/5 hover:bg-emerald-600/20 hover:text-emerald-400 border border-white/5 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all">
                                Mark ${item.type === 'Sale' ? 'Sold' : 'Rented'}
                            </button>
                        ` : `
                            <button onclick="window.dashUpdateStatus('${item.id}', 'Available')" 
                                class="flex-1 bg-white/5 hover:bg-cyan-600/20 hover:text-cyan-400 border border-white/5 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all">
                                Mark Available
                            </button>
                        `}
                        <button onclick="window.dashDeleteListing('${item.id}')" 
                            class="bg-white/5 hover:bg-rose-600/20 hover:text-rose-400 border border-white/5 p-3 rounded-xl transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        listingsGrid.innerHTML += card;
    });
}

// Global functions for inline onclick handlers
window.dashUpdateStatus = async (id, newStatus) => {
    if (!confirm(`Mark this property as ${newStatus}?`)) return;
    try {
        await updateDoc(doc(db, "listings", id), { status: newStatus });
    } catch (error) {
        console.error("Status update error:", error);
    }
};

window.dashDeleteListing = async (id) => {
    if (!confirm("Are you sure you want to delete this listing permanently?")) return;
    try {
        await deleteDoc(doc(db, "listings", id));
    } catch (error) {
        console.error("Delete error:", error);
    }
};

// --- UI HELPERS ---

function showMessage(text, classes) {
    profileMessage.textContent = text;
    profileMessage.className = `p-4 rounded-xl text-sm font-medium text-center ${classes}`;
    profileMessage.classList.remove('hidden');
}

function hideMessage() {
    profileMessage.classList.add('hidden');
}
