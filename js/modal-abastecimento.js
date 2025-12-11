// js/modal-abastecimento.js
// TOTALMENTE LIMPO E CORRIGIDO
// ---------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fuel-form");
  const msgEl = document.getElementById("fuel-message");
  const selectVeiculo = document.getElementById("fuel-vehicle");
  const helperVeiculo = document.getElementById("fuel-vehicle-helper");
  const deleteBtn = document.getElementById("fuel-delete");

  const params = new URLSearchParams(window.location.search);
  const veiculoIdFromUrl = params.get("veiculoId");
  const abastecimentoId = params.get("id");
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

  // -------------------------------------------------------------------
  // 1. CARREGAR VEÍCULOS PARA O SELECT (APÓS AUTH)
  // -------------------------------------------------------------------
  async function carregarVeiculosNoDropdown() {
    selectVeiculo.innerHTML = `<option value="">A carregar...</option>`;

    const veiculos = await getVeiculosDoUtilizador();

    if (!veiculos.length) {
      selectVeiculo.innerHTML = `<option value="">Nenhum veículo registado</option>`;
      setVehicleHelper("Crie um veículo antes de abastecer.");
      return;
    }

    selectVeiculo.innerHTML = `<option value="">Selecionar...</option>`;
    veiculos.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.nome} (${v.marca})`;
      selectVeiculo.appendChild(opt);
    });

    // pré-selecionar se vier da URL
    if (
      veiculoIdFromUrl &&
      selectVeiculo.querySelector(`option[value="${veiculoIdFromUrl}"]`)
    ) {
      selectVeiculo.value = veiculoIdFromUrl;
    }
  }

  // -------------------------------------------------------------------
  // 2. CARREGAR ABASTECIMENTO EM MODO EDIÇÃO
  // -------------------------------------------------------------------
  async function carregarAbastecimentoParaEdicao() {
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

      // veículo selecionado automaticamente
      selectVeiculo.value = abs.veiculoId;

      deleteBtn.classList.remove("hidden");
      form.querySelector("button[type='submit'] span").textContent =
        "Guardar alterações";
    } catch (err) {
      console.error(err);
      showMessage("Erro ao carregar abastecimento.", "error");
      isEditMode = false;
    }
  }

  // -------------------------------------------------------------------
  // 3. SUBMETER FORMULÁRIO
  // -------------------------------------------------------------------
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

        // validações
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

  // -------------------------------------------------------------------
  // 4. APAGAR ABASTECIMENTO
  // -------------------------------------------------------------------
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!isEditMode) return;
      if (!confirm("Deseja eliminar este abastecimento?")) return;

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

  // -------------------------------------------------------------------
  // 5. ORDEM CORRETA: AUTENTICAÇÃO → VEÍCULOS → (EDITAR)
  // -------------------------------------------------------------------
  auth.onAuthStateChanged(async (user) => {
    if (!user) return;

    await carregarVeiculosNoDropdown();

    // só depois dos veículos estarem carregados é que faz sentido editar
    await carregarAbastecimentoParaEdicao();
  });
});
