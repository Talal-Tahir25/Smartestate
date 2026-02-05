/**
 * EstatoAI - Authentication Service
 * Handles user signup, login, logout, and persistent session state.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Checks the current authentication state and calls a callback with the user object.
 */
export const checkAuthState = (callback) => {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
};

/**
 * Signs the current user out of the application.
 */
export const logout = async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Logout error:", error);
    }
};

export { auth, db };
export default auth;
