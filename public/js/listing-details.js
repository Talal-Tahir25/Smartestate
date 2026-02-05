/**
 * SmartEstate - Property Details Logic
 * Extracts ID from URL, fetches listing from Firestore, and renders details.
 */

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

// UI Elements
const loader = document.getElementById('detailsLoader');
const errorMsg = document.getElementById('errorMessage');
const content = document.getElementById('detailsContent');

// Data Elements
const mainImage = document.getElementById('mainImage');
const title = document.getElementById('propertyTitle');
const location = document.getElementById('propertyLocation');
const price = document.getElementById('propertyPrice');
const type = document.getElementById('propertyType');
const statusBadge = document.getElementById('propertyStatus');
const beds = document.getElementById('numBeds');
const baths = document.getElementById('numBaths');
const size = document.getElementById('areaSize');
const date = document.getElementById('postDate');
const description = document.getElementById('propertyDescription');
const sellerName = document.getElementById('sellerName');
const propertyIdText = document.getElementById('propertyIdText');
const contactBtn = document.getElementById('contactBtn');
const whatsappBtn = document.getElementById('whatsappBtn');

const ADMIN_EMAIL = 'admin@estatoai.com';

// Auth & Nav State
checkAuthState(async (user) => {
    const listPropertyLink = document.getElementById('listPropertyLink');
    const adminLink = document.getElementById('adminLink');
    const authLink = document.getElementById('authLink');

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
                    listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';
                }
                if (inventoryLink) {
                    inventoryLink.style.display = (role === 'agent') ? 'inline-flex' : 'none';
                }
            } else {
                // Default
                if (listPropertyLink) listPropertyLink.style.display = 'inline-flex';
                if (inventoryLink) inventoryLink.style.display = 'none';
            }
        } catch (err) {
            console.error("Error checking role:", err);
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

// Initialize Page
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const listingId = urlParams.get('id');

    if (!listingId) {
        showError();
        return;
    }

    try {
        const docRef = doc(db, "listings", listingId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            renderListing(docSnap.id, docSnap.data());
        } else {
            showError();
        }
    } catch (error) {
        console.error("Error fetching listing:", error);
        showError();
    }
}

function renderListing(id, data) {
    loader.classList.add('hidden');
    content.classList.remove('hidden');

    // Basic Info
    title.textContent = data.title;
    location.innerHTML = `
        <svg class="w-5 h-5 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        ${data.location}, ${data.area || ''}
    `;

    const priceFormatted = new Intl.NumberFormat('en-PK').format(data.price);
    price.innerHTML = `${priceFormatted} <span class="text-sm text-slate-500">PKR</span>`;

    type.textContent = data.type;
    type.className = `px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${data.type === 'Sale' ? 'bg-cyan-600' : 'bg-amber-600'} text-white shadow-xl`;

    const status = data.status || "Available";
    statusBadge.textContent = status;
    statusBadge.className = `px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${status === 'Available' ? 'bg-emerald-600' : 'bg-rose-600'} text-white shadow-xl`;

    // Visuals
    mainImage.src = data.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80';

    // Specs
    beds.textContent = data.bedrooms;
    baths.textContent = data.bathrooms;
    size.textContent = `${data.size} M`;

    if (data.timestamp) {
        date.textContent = data.timestamp.toDate().toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    }

    description.textContent = data.description || "No description provided for this property.";
    sellerName.textContent = data.sellerName || "Anonymous Seller";
    propertyIdText.textContent = id;

    // Contact Logic
    contactBtn.onclick = () => {
        if (data.phone) window.location.href = `tel:${data.phone}`;
        else alert("Seller's phone number is not available.");
    };

    whatsappBtn.onclick = () => {
        if (data.phone) {
            const text = encodeURIComponent(`Hi, I'm interested in your property: ${data.title} (ID: ${id}) on SmartEstate.`);
            window.open(`https://wa.me/${data.phone}?text=${text}`, '_blank');
        } else {
            alert("Seller's WhatsApp is not available.");
        }
    };
}

function showError() {
    loader.classList.add('hidden');
    errorMsg.classList.remove('hidden');
}

// Start
init();
