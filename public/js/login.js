/**
 * EstatoAI - Login Page Logic
 * Handles user authentication (Login/Signup) using Firebase Auth.
 */

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, checkAuthState, logout } from './auth.js';

const authForm = document.getElementById('authForm');
const authBtn = document.getElementById('authBtn');
const authTitle = document.getElementById('authTitle');
const toggleAuth = document.getElementById('toggleAuth');
const toggleText = document.getElementById('toggleText');
const authMessage = document.getElementById('authMessage');

let isLoginMode = true;

// Toggle between Login and Signup modes
toggleAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;

    if (isLoginMode) {
        authTitle.innerHTML = 'Welcome <span>Back</span>';
        authBtn.textContent = 'Sign In';
        toggleText.textContent = "Don't have an account?";
        toggleAuth.textContent = 'Sign Up';
        document.getElementById('roleField').classList.add('hidden'); // Hide Role
    } else {
        authTitle.innerHTML = 'Create <span>Account</span>';
        authBtn.textContent = 'Join SmarteState';
        toggleText.textContent = "Already have an account?";
        toggleAuth.textContent = 'Sign In';
        document.getElementById('roleField').classList.remove('hidden'); // Show Role
    }

    authMessage.classList.add('hidden');
});

// Handle form submission
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // UI Loading state
    authBtn.disabled = true;
    authBtn.textContent = isLoginMode ? 'Signing In...' : 'Registering...';
    authMessage.classList.add('hidden');

    try {
        if (isLoginMode) {
            // Log in existing user
            await signInWithEmailAndPassword(auth, email, password);
            showMessage('Login successful! Redirecting...', 'var(--secondary)');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        } else {
            // Register new user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            try {
                // Save user data to Firestore
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    email: user.email,
                    createdAt: serverTimestamp(),
                    role: 'user'
                });
                console.log("User profile created in Firestore");
            } catch (dbError) {
                console.error("Database Error (Check Security Rules):", dbError);
                // We don't block the user if auth succeeded but DB write failed, 
                // but we warn them in console.
            }

            showMessage('Registration successful! Welcome.', 'var(--secondary)');
            setTimeout(() => { window.location.href = 'predict.html'; }, 1500);
        }
    } catch (error) {
        console.error("Auth error:", error);
        let errorMsg = "An error occurred. Please try again.";

        if (error.code) {
            switch (error.code) {
                case 'auth/email-already-in-use': errorMsg = "Email already in use."; break;
                case 'auth/invalid-email': errorMsg = "Invalid email address."; break;
                case 'auth/weak-password': errorMsg = "Password is too weak."; break;
                case 'auth/wrong-password':
                case 'auth/user-not-found': errorMsg = "Incorrect email or password."; break;
                case 'auth/network-request-failed': errorMsg = "Network error. Check your connection."; break;
            }
        }

        showMessage(errorMsg, 'var(--accent)');
    } finally {
        authBtn.disabled = false;
        authBtn.textContent = isLoginMode ? 'Sign In' : 'Join SmarteState';
    }
});

/**
 * Displays feedback messages to the user.
 */
function showMessage(text, color) {
    authMessage.textContent = text;
    authMessage.style.color = color;
    authMessage.classList.remove('hidden');
}

// Nav handling for Login page
checkAuthState(async (user) => {
    const listPropertyLink = document.getElementById('listPropertyLink');
    const adminLink = document.getElementById('adminLink');
    const authLink = document.getElementById('authLink');
    const ADMIN_EMAIL = 'admin@estatoai.com';

    if (user) {
        if (authLink) {
            authLink.textContent = 'Logout';
            authLink.href = '#';
            authLink.onclick = (e) => { e.preventDefault(); logout(); };
        }
        if (adminLink) adminLink.style.display = (user.email === ADMIN_EMAIL) ? 'inline-flex' : 'none';

        // Role-based visibility for List Property
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const role = (userDoc.data().role || '').toLowerCase();
                if (listPropertyLink) {
                    listPropertyLink.style.display = (role === 'buyer') ? 'none' : 'inline-flex';
                }
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
    }
});
