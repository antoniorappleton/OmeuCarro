// js/abastecimentos.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fuel-form");
  const msgEl = document.getElementById("fuel-message");
  const selectVeiculo = document.getElementById("fuel-vehicle");
  const helperVeiculo = document.getElementById("fuel-vehicle-helper");
  const deleteBtn = document.getElementById("fuel-delete");

  const params = new URLSearchParams(window.location.search);
  const veiculoIdFromUrl = params.get("veiculoId"); // pré-seleção
  const abastecimentoId = params.get("id"); // modo edição
  let isEditMode = !!abastecimentoId;
  let currentAbastecimento = null;

  function showMessage(text, type = null) {
    msgEl.textContent = text;
    msgEl.className = "form-message";
    if (type === "error") msgEl.classList.add("form-message--error");
    if (type === "success") msgEl.classList.add("form-message--success");
  }

  function setVehicleHelper(text) {
    if (helperVeiculo) helperVeiculo.textContent = text;
  }

  /* -------------------------------------------------------------------
      1. CARREGAR VEÍCULOS PARA O SELECT
  ------------------------------------------------------------------- */
  async function loadVeiculos() {
    selectVeiculo.innerHTML = `<option value="">A carregar veículos...</option>`;

    try {
      const veiculos = await getVeiculosDoUtilizador();

      if (!veiculos.length) {
        selectVeiculo.innerHTML = `<option value="">Nenhum veículo registado</option>`;
        selectVeiculo.disabled = true;
        setVehicleHelper("Crie primeiro um veículo em 'Veículos'.");
        return;
      }

      selectVeiculo.disabled = false;
      setVehicleHelper("");
      selectVeiculo.innerHTML = `<option value="">Selecionar veículo</option>`;

      veiculos.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.nome || `${v.marca} ${v.modelo}`;
        selectVeiculo.appendChild(opt);
      });

      // Pré-selecionar veículo se veio do URL
      if (!isEditMode && veiculoIdFromUrl) {
        if (veiculos.some((v) => v.id === veiculoIdFromUrl)) {
          selectVeiculo.value = veiculoIdFromUrl;
        }
      }

      // Se estamos a editar, selecionar o veículo correspondente
      if (isEditMode && currentAbastecimento) {
        selectVeiculo.value = currentAbastecimento.veiculoId;
      }
    } catch (err) {
      console.error(err);
      selectVeiculo.innerHTML = `<option value="">Erro ao carregar veículos</option>`;
      selectVeiculo.disabled = true;
      setVehicleHelper("Erro ao comunicar com a Firebase.");
    }
  }

  /* -------------------------------------------------------------------
      2. CARREGAR ABASTECIMENTO PARA EDIÇÃO
  ------------------------------------------------------------------- */
  async function loadAbastecimentoIfEdit() {
    if (!isEditMode) return;

    try {
      const abs = await getAbastecimentoById(abastecimentoId);
      if (!abs) {
        isEditMode = false;
        return;
      }

      currentAbastecimento = abs;

      document.querySelector("header .page-title span").textContent =
        "Editar Abastecimento";

      document.getElementById("fuel-date").value = abs.data || "";
      document.getElementById("fuel-type").value = abs.tipoCombustivel || "";
      document.getElementById("fuel-liters").value = abs.litros || "";
      document.getElementById("fuel-price").value = abs.precoPorLitro || "";
      document.getElementById("fuel-odometer").value = abs.odometro || "";
      document.getElementById("fuel-station").value = abs.posto || "";
      document.getElementById("fuel-notes").value = abs.observacoes || "";

      // botão eliminar visível
      deleteBtn.classList.remove("hidden");

      // alterar texto do botão
      form.querySelector("button[type='submit'] span").textContent =
        "Guardar alterações";
    } catch (err) {
      console.error(err);
      showMessage("Erro ao carregar abastecimento.", "error");
      isEditMode = false;
    }
  }

  /* -------------------------------------------------------------------
      3. SUBMETER FORMULÁRIO (CRIAR OU EDITAR)
  ------------------------------------------------------------------- */
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage("");

      try {
        const data = {
          veiculoId: selectVeiculo.value,
          data: document.getElementById("fuel-date").value,
          tipoCombustivel: document.getElementById("fuel-type").value,
          litros: Number(document.getElementById("fuel-liters").value),
          precoPorLitro: Number(document.getElementById("fuel-price").value),
          odometro: Number(document.getElementById("fuel-odometer").value),
          posto: document.getElementById("fuel-station").value || "",
          observacoes: document.getElementById("fuel-notes").value || "",
          completo: true,
        };

        if (!data.veiculoId) throw new Error("Selecione um veículo.");
        if (!data.data) throw new Error("Indique a data.");
        if (!data.tipoCombustivel)
          throw new Error("Indique o tipo de combustível.");
        if (data.litros <= 0) throw new Error("Litros inválidos.");
        if (data.precoPorLitro <= 0) throw new Error("Preço inválido.");
        if (data.odometro <= 0) throw new Error("Odómetro inválido.");

        if (isEditMode) {
          await updateAbastecimento(abastecimentoId, data);
          showMessage("Abastecimento atualizado com sucesso!", "success");
        } else {
          await createAbastecimento(data);
          showMessage("Abastecimento registado com sucesso!", "success");
          form.reset();
        }
      } catch (err) {
        console.error(err);
        showMessage(err.message, "error");
      }
    });
  }

  /* -------------------------------------------------------------------
      4. APAGAR ABASTECIMENTO
  ------------------------------------------------------------------- */
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!isEditMode) return;
      const c = confirm("Deseja eliminar este abastecimento?");
      if (!c) return;

      try {
        await deleteAbastecimento(abastecimentoId);
        showMessage("Abastecimento eliminado.", "success");
        setTimeout(() => (window.location.href = "dashboard.html"), 800);
      } catch (err) {
        console.error(err);
        showMessage("Erro ao eliminar.", "error");
      }
    });
  }

  /* -------------------------------------------------------------------
      5. ORDEM CORRETA DE CARREGAMENTO
  ------------------------------------------------------------------- */
  loadAbastecimentoIfEdit().then(loadVeiculos).catch(console.error);
});
