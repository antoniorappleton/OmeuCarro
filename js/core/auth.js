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
      if (user) {
        // Se já está logado e abriu a página de login, vai para o dashboard
        window.location.replace("./dashboard.html");
      }
      return;
    }

    // Qualquer página privada requer utilizador autenticado
    if (!user) {
      window.location.href = "./auth.html";
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
      window.location.replace("./auth.html");
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
        console.error("[LOGIN ERROR]", {
          code: err?.code,
          message: err?.message,
          full: err,
        });

        const code = err?.code || "";

        const map = {
          "auth/user-not-found": "Este email não está registado.",
          "auth/wrong-password": "Password incorreta.",
          "auth/invalid-email": "Email inválido.",
          "auth/user-disabled": "Conta desativada.",
          "auth/too-many-requests": "Muitas tentativas. Tenta mais tarde.",
          "auth/network-request-failed":
            "Falha de rede (offline/adblock/proxy).",
          "auth/unauthorized-domain":
            "Domínio não autorizado no Firebase Auth.",
          "auth/invalid-api-key": "Config/API key inválida (firebase-config).",
          "auth/app-not-authorized":
            "App não autorizada (firebase-config/domínio).",
        };

        showLoginMessage(
          map[code] || err?.message || "Erro ao entrar.",
          "error"
        );
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
        console.error("[SIGNUP ERROR]", {
          code: err?.code,
          message: err?.message,
          full: err,
        });

        const code = err?.code || "";
        const map = {
          "auth/email-already-in-use": "Este email já está registado.",
          "auth/invalid-email": "Email inválido.",
          "auth/weak-password": "Password fraca (mín. 6).",
          "auth/unauthorized-domain":
            "Domínio não autorizado no Firebase Auth.",
          "auth/network-request-failed":
            "Falha de rede (offline/adblock/proxy).",
        };

        showSignupMessage(
          map[code] || err?.message || "Erro ao criar conta.",
          "error"
        );
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
