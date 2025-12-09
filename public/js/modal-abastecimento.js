// public/js/modal-abastecimento.js

document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("btn-open-fuel-modal");
  const overlay = document.getElementById("fuel-modal-overlay");
  const closeBtn = document.getElementById("btn-close-fuel-modal");
  const cancelBtn = document.getElementById("btn-cancel-fuel-modal");
  const form = document.getElementById("fuel-modal-form");

  if (!openBtn || !overlay || !form) {
    console.warn(
      "[modal-abastecimento] Elementos do modal não encontrados no DOM."
    );
    return;
  }

  const dateInput = document.getElementById("fuel-date");
  const typeSelect = document.getElementById("fuel-type");
  const litersInput = document.getElementById("fuel-liters");
  const priceInput = document.getElementById("fuel-price");
  const odometerInput = document.getElementById("fuel-odometer");
  const stationInput = document.getElementById("fuel-station");
  const notesInput = document.getElementById("fuel-notes");
  const messageEl = document.getElementById("fuel-message");

  function openModal() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    if (messageEl) {
      messageEl.textContent = "";
      messageEl.className = "form-message";
    }
    form.reset();
  }

  function showMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.className = "form-message";

    if (type === "error") {
      messageEl.classList.add("form-message--error");
    } else if (type === "success") {
      messageEl.classList.add("form-message--success");
    }
  }

  function normalizeNumber(value) {
    if (!value) return NaN;
    return parseFloat(String(value).replace(",", "."));
  }

  // Abrir / fechar modal
  openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  // Fechar ao clicar fora
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Fechar com ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) {
      closeModal();
    }
  });

  // Submissão do formulário
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", null);

    if (
      !dateInput.value ||
      !typeSelect.value ||
      !litersInput.value ||
      !priceInput.value ||
      !odometerInput.value
    ) {
      showMessage(
        "Por favor, preencha todos os campos obrigatórios (*).",
        "error"
      );
      return;
    }

    const liters = normalizeNumber(litersInput.value);
    const price = normalizeNumber(priceInput.value);
    const odometer = parseInt(odometerInput.value, 10);

    if (isNaN(liters) || isNaN(price) || isNaN(odometer)) {
      showMessage(
        "Verifique os valores de litros, preço e quilometragem.",
        "error"
      );
      return;
    }

    const totalCost = parseFloat((liters * price).toFixed(2));

    const user = firebase.auth().currentUser;
    if (!user) {
      showMessage(
        "Precisa de estar autenticado para registar abastecimentos.",
        "error"
      );
      return;
    }

    // ... dentro do submit do form

    const record = {
      veiculoId: veiculoSelect.value, // precisa de haver um <select> de veículo
      data: dateInput.value, // "YYYY-MM-DD"
      tipoCombustivel: typeSelect.value,
      litros: liters,
      precoPorLitro: price,
      odometro: odometer,
      posto: stationInput.value || "",
      observacoes: notesInput.value || "",
      completo: completoCheckbox.checked, // se tiveres esse campo
    };

    try {
      await createAbastecimento(record);
      showMessage("Abastecimento registado com sucesso! ✅", "success");
      setTimeout(closeModal, 700);
    } catch (error) {
      console.error(error);
      showMessage("Erro ao guardar o abastecimento.", "error");
    }
  });
});
