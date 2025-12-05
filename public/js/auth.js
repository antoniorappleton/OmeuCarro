function loginUser() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => window.location.href = "dashboard.html")
    .catch(err => alert(err.message));
}

function registerUser() {
  const nome = document.getElementById("reg-nome").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then(cred => {
      db.collection("users").doc(cred.user.uid).set({
        nome, email,
        criadoEm: new Date().toISOString()
      });
      window.location.href = "dashboard.html";
    })
    .catch(err => alert(err.message));
}

function logoutUser() {
  auth.signOut();
}
