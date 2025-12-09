// public/js/modal-abastecimento.js

document.addEventListener("DOMContentLoaded", async () => {
  const openBtn = document.getElementById("btn-open-fuel-modal");
  const overlay = document.getElementById("fuel-modal-overlay");
  const closeBtn = document.getElementById("btn-close-fuel-modal");
  const cancelBtn = document.getElementById("btn-cancel-fuel-modal");
  const form = document.getElementById("fuel-modal-form");

  if (!openBtn || !overlay || !form) {
    console.warn("[modal-abastecimento] Elementos não encontrados no DOM.");
    return;
  }

  // Campos
  const dateInput = document.getElementById("fuel-date");
  const typeSelect = document.getElementById("fuel-type");
  const litersInput = document.getElementById("fuel-liters");
  const priceInput = document.getElementById("fuel-price");
  const odometerInput = document.getElementById("fuel-odometer");
  const stationInput = document.getElementById("fuel-station");
  const notesInput = document.getElementById("fuel-notes");
  const messageEl = document.getElementById("fuel-message");

  // NOVOS CAMPOS
  const veiculoSelect = document.getElementById("fuel-vehicle");
  const completoCheckbox = document.getElementById("fuel-full");

  function showMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.className = "form-message";
    if (type === "error") messageEl.classList.add("form-message--error");
    if (type === "success") messageEl.classList.add("form-message--success");
  }

  function openModal() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    showMessage("", null);
    form.reset();
  }

  // 🔥 Carregar veículos ao abrir modal
  async function loadVeiculos() {
    veiculoSelect.innerHTML = "<option value=''>A carregar...</option>";

    const veiculos = await getVeiculosDoUtilizador();

    if (veiculos.length === 0) {
      veiculoSelect.innerHTML = "<option value=''>Nenhum veículo disponível</option>";
      return;
    }

    veiculoSelect.innerHTML = "<option value=''>Selecione o veículo</option>";
    veiculos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.nome} (${v.marca} ${v.modelo})`;
      veiculoSelect.appendChild(opt);
    });
  }

  openBtn.addEventListener("click", async () => {
    await loadVeiculos();
    openModal();
  });

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) {
      closeModal();
    }
  });

  // 🔥 SUBMISSÃO DO FORMULÁRIO COM VALIDAÇÕES
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", null);

    try {
      // Validações base
      if (!veiculoSelect.value)
        throw "Selecione um veículo.";

      if (!dateInput.value ||
          !typeSelect.value ||
          !litersInput.value ||
          !priceInput.value ||
          !odometerInput.value)
        throw "Preencha todos os campos obrigatórios (*).";

      const litros = parseFloat(litersInput.value.replace(",", "."));
      const preco = parseFloat(priceInput.value.replace(",", "."));
      const odometro = parseInt(odometerInput.value, 10);

      if (isNaN(litros) || litros <= 0)
        throw "Litros inválidos.";

      if (isNaN(preco) || preco <= 0)
        throw "Preço por litro inválido.";

      if (isNaN(odometro))
        throw "Odómetro inválido.";

      // 🔥 Validação avançada: verificar odómetro ≥ último abastecimento
      const abastecimentos = await getAbastecimentosDoUtilizador({
        veiculoId: veiculoSelect.value,
        limite: 1
      });

      if (abastecimentos.length > 0) {
        const ultimo = abastecimentos[0];
        if (odometro < ultimo.odometro)
          throw `O odómetro (${odometro}) não pode ser inferior ao último registo (${ultimo.odometro}).`;
      }

      // Criar registo
      const record = {
        veiculoId: veiculoSelect.value,
        data: dateInput.value,
        tipoCombustivel: typeSelect.value,
        litros,
        precoPorLitro: preco,
        odometro,
        posto: stationInput.value || "",
        observacoes: notesInput.value || "",
        completo: completoCheckbox.checked
      };

      await createAbastecimento(record);

      showMessage("Abastecimento registado com sucesso! ✅", "success");

      setTimeout(closeModal, 600);

    } catch (err) {
      console.error(err);
      showMessage(err.toString(), "error");
    }
  });
});
