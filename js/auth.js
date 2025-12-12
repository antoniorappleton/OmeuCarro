// public/js/auth.js

// Garante que firebase, auth e db já existem (criadas em firebase-config.js)
if (!window.firebase || !window.auth) {
  console.error("Firebase não foi corretamente inicializado.");
}

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const isAuthPage = body.dataset.page === "auth";

  // =================================================
  // GUARD GLOBAL DE AUTENTICAÇÃO
  // =================================================
  auth.onAuthStateChanged((user) => {
    if (isAuthPage) {
      // Não redirecionar automaticamente aqui
      // (importante para PWA + UX)
      return;
    }

    // Qualquer página privada requer utilizador autenticado
    if (!user) {
      window.location.href = "./index.html";
    }
  });

  // =================================================
  // LOGOUT (GLOBAL – HEADER)
  // =================================================
const logoutBtn = document.getElementById("btn-logout");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("[auth] logout click");

    try {
      await auth.signOut();
      console.log("[auth] signed out");

      // força reload “limpo”
      window.location.replace("./index.html");
    } catch (err) {
      console.error("[auth] erro no logout:", err);
      alert(err?.message || "Erro ao sair da aplicação.");
    }
  });
}


  // =================================================
  // A PARTIR DAQUI → SÓ PÁGINA AUTH (LOGIN / SIGNUP)
  // =================================================
  if (!isAuthPage) return;

  // ======== ELEMENTOS ========
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  const loginMessage = document.getElementById("login-message");
  const signupMessage = document.getElementById("signup-message");

  const resetBtn = document.getElementById("btn-password-reset");

  // ======== HELPERS ========
  function showLoginMessage(text, type) {
    if (!loginMessage) return;
    loginMessage.textContent = text || "";
    loginMessage.className = "form-message";
    if (type === "error") loginMessage.classList.add("form-message--error");
    if (type === "success") loginMessage.classList.add("form-message--success");
  }

  function showSignupMessage(text, type) {
    if (!signupMessage) return;
    signupMessage.textContent = text || "";
    signupMessage.className = "form-message";
    if (type === "error") signupMessage.classList.add("form-message--error");
    if (type === "success")
      signupMessage.classList.add("form-message--success");
  }

  function switchToLogin() {
    tabLogin?.classList.add("auth-tab--active");
    tabSignup?.classList.remove("auth-tab--active");
    loginForm?.classList.remove("auth-form--hidden");
    signupForm?.classList.add("auth-form--hidden");
    showLoginMessage("", null);
    showSignupMessage("", null);
  }

  function switchToSignup() {
    tabSignup?.classList.add("auth-tab--active");
    tabLogin?.classList.remove("auth-tab--active");
    signupForm?.classList.remove("auth-form--hidden");
    loginForm?.classList.add("auth-form--hidden");
    showLoginMessage("", null);
    showSignupMessage("", null);
  }

  // Tabs
  tabLogin?.addEventListener("click", switchToLogin);
  tabSignup?.addEventListener("click", switchToSignup);

  // =================================================
  // LOGIN
  // =================================================
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showLoginMessage("", null);

      const email = document.getElementById("login-email")?.value.trim();
      const password = document.getElementById("login-password")?.value;

      try {
        if (!email || !password) {
          throw new Error("Preencha email e password.");
        }

        // Persistência LOCAL (PWA / browser)
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        await auth.signInWithEmailAndPassword(email, password);

        showLoginMessage("Login efetuado com sucesso! ✅", "success");
        window.location.href = "./dashboard.html";
      } catch (err) {
        console.error(err);
        showLoginMessage(err.message || "Erro ao entrar.", "error");
      }
    });
  }

  // =================================================
  // SIGNUP
  // =================================================
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showSignupMessage("", null);

      const nome = document.getElementById("signup-nome")?.value.trim();
      const email = document.getElementById("signup-email")?.value.trim();
      const password = document.getElementById("signup-password")?.value;

      try {
        if (!nome || !email || !password) {
          throw new Error("Preencha todos os campos.");
        }

        if (password.length < 6) {
          throw new Error("A password deve ter pelo menos 6 caracteres.");
        }

        // Persistência LOCAL
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        const cred = await auth.createUserWithEmailAndPassword(email, password);

        await cred.user.updateProfile({ displayName: nome });

        if (typeof saveUserProfile === "function") {
          await saveUserProfile(cred.user, {
            nome,
            idioma: "pt",
            moeda: "EUR",
            unidadeConsumo: "L/100km",
          });
        }

        showSignupMessage("Conta criada com sucesso! ✅", "success");
        window.location.href = "./dashboard.html";
      } catch (err) {
        console.error(err);
        showSignupMessage(err.message || "Erro ao criar conta.", "error");
      }
    });
  }

  // =================================================
  // RESET PASSWORD
  // =================================================
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const email = document.getElementById("login-email")?.value.trim();

      if (!email) {
        showLoginMessage(
          "Introduza o email para recuperar a password.",
          "error"
        );
        return;
      }

      try {
        await auth.sendPasswordResetEmail(email);
        showLoginMessage(
          "Email de recuperação enviado. Verifique a sua caixa de entrada.",
          "success"
        );
      } catch (err) {
        console.error(err);
        showLoginMessage(
          err.message || "Erro ao enviar email de recuperação.",
          "error"
        );
      }
    });
  }
});
