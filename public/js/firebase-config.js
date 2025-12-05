const firebaseConfig = {
  apiKey: "AQUI",
  authDomain: "AQUI",
  projectId: "AQUI",
  storageBucket: "AQUI",
  messagingSenderId: "AQUI",
  appId: "AQUI"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
