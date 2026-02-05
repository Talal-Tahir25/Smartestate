/**
 * SmartEstate - Add Listing Logic
 * Handles property submission to the "listings" collection in Firestore.
 */

import { collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

const listingForm = document.getElementById('listingForm');
const listingMessage = document.getElementById('listingMessage');
const submitBtn = document.getElementById('submitBtn');
const dropZone = document.getElementById('dropZone');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');

let currentUser = null;
let userProfile = null;
let selectedFiles = [];

// Cloudinary Config (Unsigned Upload)
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dskqpcbk1/image/upload";
const UPLOAD_PRESET = "smartestate"; // Updated to match user's custom preset

// Logout handler
const authLogoutBtn = document.getElementById('authLogout');
if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

// Handle Click to Browse
dropZone.addEventListener('click', () => imageInput.click());

// Handle Drag & Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-cyan-500', 'bg-cyan-500/5'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-cyan-500', 'bg-cyan-500/5'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-cyan-500', 'bg-cyan-500/5');
    handleFiles(e.dataTransfer.files);
});

// Handle File Selection
imageInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleFiles(files) {
    const newFiles = Array.from(files);
    if (selectedFiles.length + newFiles.length > 5) {
        alert("Maximum 5 images allowed.");
        return;
    }
    selectedFiles = [...selectedFiles, ...newFiles];
    renderPreviews();
}

function renderPreviews() {
    imagePreview.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'relative group rounded-xl overflow-hidden h-24 bg-slate-800 border border-slate-700';
            div.innerHTML = `
                <img src="${e.target.result}" class="w-full h-full object-cover">
                <button type="button" class="absolute top-1 right-1 bg-rose-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-index="${index}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            `;
            div.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                selectedFiles.splice(index, 1);
                renderPreviews();
            });
            imagePreview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Uploads images to Cloudinary and returns an array of URLs.
 */
async function uploadImages() {
    const uploadPromises = selectedFiles.map(file => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);

        return fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
        }).then(res => res.json());
    });

    const results = await Promise.all(uploadPromises);
    return results.map(res => res.secure_url).filter(url => url);
}

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

        // Explicitly show admin link if admin
        if (adminLink) adminLink.style.display = (user.email === ADMIN_EMAIL) ? 'inline-flex' : 'none';

        // Role-based visibility
        try {
            const inventoryLink = document.getElementById('inventoryLink');
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                userProfile = userDoc.data();
                const role = (userProfile.role || '').toLowerCase();

                if (listPropertyLink) {
                    // Explicitly show if NOT buyer
                    listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';
                }

                if (inventoryLink) {
                    // Show ONLY to agents
                    inventoryLink.style.display = (role === 'agent') ? 'inline-flex' : 'none';
                }

                // If not a seller/agent and not both, then block form
                if (role !== 'seller' && role !== 'both' && role !== 'agent') {
                    showMessage('Access Denied: Only Sellers and Agents can list properties. Your current role is: ' + (userProfile.role || 'User'), 'bg-amber-500/20 text-amber-400 border border-amber-500/50');
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Restricted to Sellers/Agents';
                    if (listingForm) listingForm.classList.add('hidden');
                }
            } else {
                // Default show for new users
                if (listPropertyLink) listPropertyLink.style.display = 'inline-flex';
                if (inventoryLink) inventoryLink.style.display = 'none';
            }
        } catch (err) {
            console.error("Error fetching role:", err);
            if (listPropertyLink) listPropertyLink.style.display = 'none';
            showMessage('Error checking user role. Please try again.', 'bg-rose-500/20 text-rose-400 border border-rose-500/50');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Error Loading Role';
            if (listingForm) listingForm.classList.add('hidden');
        }
    } else {
        window.location.href = 'login.html';
    }
});

if (listingForm) {
    listingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) return;

        // Final Security Check
        const role = (userProfile?.role || '').toLowerCase();
        if (role !== 'seller' && role !== 'both' && role !== 'agent') {
            alert("Security Error: Only Sellers and Agents can post listings.");
            return;
        }

        // UI Loading
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading Images & Listing...';
        hideMessage();

        try {
            // 1. Upload Images to Cloudinary
            const imageUrls = await uploadImages();

            // 2. Capture Form Data
            const title = document.getElementById('title').value;
            const type = document.getElementById('listingType').value;
            const price = parseFloat(document.getElementById('price').value);
            const sector = document.getElementById('sector').value;
            const block = document.getElementById('block').value;
            const size = parseFloat(document.getElementById('size').value);
            const bedrooms = parseInt(document.getElementById('bedrooms').value);
            const bathrooms = parseInt(document.getElementById('bathrooms').value);
            const description = document.getElementById('description').value;
            const visibility = document.querySelector('input[name="visibility"]:checked')?.value || 'Public';

            // 3. Save to Firestore "listings" collection
            await addDoc(collection(db, "listings"), {
                uid: currentUser.uid,
                email: currentUser.email,
                title: title,
                type: type,
                price: price,
                sector: sector,
                block: block,
                size: size,
                bedrooms: bedrooms,
                bathrooms: bathrooms,
                description: description,
                visibility: visibility, // New Field
                images: imageUrls, // Array of Cloudinary URLs
                status: "Available", // Default status
                timestamp: serverTimestamp()
            });

            showMessage('Property listed successfully! Redirecting to Marketplace...', 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50');

            // Redirect after delay
            setTimeout(() => {
                window.location.href = 'listings.html';
            }, 2000);

        } catch (error) {
            console.error("Listing error:", error);
            showMessage('Error listing property. Make sure your Cloudinary preset is set to "Unsigned".', 'bg-rose-500/20 text-rose-400 border border-rose-500/50');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post Property Listing';
        }
    });
}

/**
 * UI Feedback Helpers
 */
function showMessage(text, classes) {
    listingMessage.textContent = text;
    listingMessage.className = `p-4 rounded-xl text-sm font-medium text-center ${classes}`;
    listingMessage.classList.remove('hidden');
}

function hideMessage() {
    listingMessage.classList.add('hidden');
}
