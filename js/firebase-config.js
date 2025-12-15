// firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyAiKOykeoazkqCXMhy-mpX2Ho8liuUas-E",
  authDomain: "omeucarro-d3889.firebaseapp.com",
  projectId: "omeucarro-d3889",
  storageBucket: "omeucarro-d3889.firebasestorage.app",
  messagingSenderId: "387296122464",
  appId: "1:387296122464:web:1c3c3c390dc26050f99505",
};


if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

window.auth = auth;
window.db = db;