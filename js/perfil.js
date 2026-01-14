// js/perfil.js

const profileForm = document.getElementById("profile-form");
const nameInput = document.getElementById("profile-name");
const emailInput = document.getElementById("profile-email");
const currencyInput = document.getElementById("profile-currency");
const unitInput = document.getElementById("profile-unit");
const msgEl = document.getElementById("profile-message");

// ===================================
// CARREGAR DADOS
// ===================================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Preencher email (auth)
  emailInput.value = user.email;

  // Carregar do Firestore
  try {
    const profile = await getCurrentUserProfile();
    if (profile) {
      nameInput.value = profile.nome || user.displayName || "";
      currencyInput.value = profile.moeda || "EUR";
      unitInput.value = profile.unidadeConsumo || "L/100km";
    }
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
  }
});

// ===================================
// GUARDAR DADOS
// ===================================
if (profileForm) {
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.textContent = "A guardar...";
    msgEl.className = "form-message";

    const user = auth.currentUser;
    if (!user) return;

    try {
      const payload = {
        nome: nameInput.value.trim(),
        moeda: currencyInput.value,
        unidadeConsumo: unitInput.value,
      };

      // 1. Atualizar Firestore
      await saveUserProfile(user, payload);

      // 2. Atualizar Auth Profile (Display Name)
      if (user.displayName !== payload.nome) {
        await user.updateProfile({ displayName: payload.nome });
      }

      msgEl.textContent = "Perfil atualizado com sucesso! ✅";
      msgEl.classList.add("form-message--success");

      // Opcional: Recarregar após 1s para atualizar UI global se necessário
      // setTimeout(() => location.reload(), 1000);

    } catch (err) {
      console.error(err);
      msgEl.textContent = "Erro ao guardar alterações.";
      msgEl.classList.add("form-message--error");
    }
  });
}
