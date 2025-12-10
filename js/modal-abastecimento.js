// js/abastecimentos.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fuel-form");
  const msgEl = document.getElementById("fuel-message");
  const selectVeiculo = document.getElementById("fuel-vehicle");
  const helperVeiculo = document.getElementById("fuel-vehicle-helper");
  const deleteBtn = document.getElementById("fuel-delete");

  const urlParams = new URLSearchParams(window.location.search);
  const veiculoIdFromUrl = urlParams.get("veiculoId");
  const abastecimentoIdFromUrl = urlParams.get("id"); // se existir, estamos a editar

  let isEditMode = !!abastecimentoIdFromUrl;
  let currentAbastecimento = null;

  function showMessage(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = "form-message";
    if (type === "error") msgEl.classList.add("form-message--error");
    if (type === "success") msgEl.classList.add("form-message--success");
  }

  function setVehicleHelper(text) {
    if (!helperVeiculo) return;
    helperVeiculo.textContent = text || "";
  }

  async function loadVeiculos() {
    if (!selectVeiculo) return;

    selectVeiculo.innerHTML =
      '<option value="">A carregar veículos...</option>';

    try {
      const veiculos = await getVeiculosDoUtilizador();

      if (!veiculos.length) {
        selectVeiculo.innerHTML =
          '<option value="">Nenhum veículo registado</option>';
        selectVeiculo.disabled = true;
        setVehicleHelper(
          "Crie primeiro um veículo em 'Veículos' para poder registar abastecimentos."
        );
        return;
      }

      selectVeiculo.disabled = false;
      setVehicleHelper("");

      selectVeiculo.innerHTML = '<option value="">Selecionar veículo</option>';

      veiculos.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.nome || `${v.marca || ""} ${v.modelo || ""}`;
        selectVeiculo.appendChild(opt);
      });

      // pré-selecionar veículo vindo da query string, se existir
      if (veiculoIdFromUrl && !isEditMode) {
        const exists = veiculos.some((v) => v.id === veiculoIdFromUrl);
        if (exists) {
          selectVeiculo.value = veiculoIdFromUrl;
        }
      }

      // se estamos a editar, depois de carregar veículos, setar o valor do doc
      if (isEditMode && currentAbastecimento) {
        const exists = veiculos.some(
          (v) => v.id === currentAbastecimento.veiculoId
        );
        if (exists) {
          selectVeiculo.value = currentAbastecimento.veiculoId;
        }
      }
    } catch (err) {
      console.error(err);
      selectVeiculo.innerHTML =
        '<option value="">Erro ao carregar veículos</option>';
      selectVeiculo.disabled = true;
      setVehicleHelper(err.message || "Erro ao carregar veículos.");
    }
  }

  async function loadAbastecimentoIfEdit() {
    if (!isEditMode || !abastecimentoIdFromUrl) return;

    try {
      const abs = await getAbastecimentoById(abastecimentoIdFromUrl);
      if (!abs) {
        isEditMode = false;
        return;
      }
      currentAbastecimento = abs;

      // atualizar header
      const headerTitle = document.querySelector("header .page-title span");
      if (headerTitle) headerTitle.textContent = "Editar Abastecimento";

      // preencher formulário (excepto select, que é preenchido após loadVeiculos)
      document.getElementById("fuel-date").value = abs.data || "";
      document.getElementById("fuel-type").value = abs.tipoCombustivel || "";
      document.getElementById("fuel-liters").value = abs.litros || "";
      document.getElementById("fuel-price").value = abs.precoPorLitro || "";
      document.getElementById("fuel-odometer").value = abs.odometro || "";
      document.getElementById("fuel-station").value = abs.posto || "";
      document.getElementById("fuel-notes").value = abs.observacoes || "";

      // mostrar botão remover
      if (deleteBtn) {
        deleteBtn.classList.remove("hidden");
      }

      // trocar texto do botão principal
      const submitSpan = form.querySelector("button[type='submit'] span");
      if (submitSpan) submitSpan.textContent = "Guardar alterações";
    } catch (err) {
      console.error(err);
      showMessage("Erro ao carregar abastecimento para edição.", "error");
      isEditMode = false;
    }
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage("", null);

      const veiculoId = selectVeiculo ? selectVeiculo.value : "";
      const dataAbastecimento =
        document.getElementById("fuel-date").value || "";
      const tipoCombustivel = document.getElementById("fuel-type").value || "";
      const litros = document.getElementById("fuel-liters").value || "";
      const preco = document.getElementById("fuel-price").value || "";
      const odometro = document.getElementById("fuel-odometer").value || "";
      const posto = document.getElementById("fuel-station").value || "";
      const observacoes = document.getElementById("fuel-notes").value || "";

      try {
        if (!veiculoId) throw new Error("Selecione um veículo.");
        if (!dataAbastecimento) throw new Error("Indique a data.");
        if (!tipoCombustivel) throw new Error("Indique o tipo de combustível.");
        if (!litros || Number(litros) <= 0)
          throw new Error("Litros deve ser maior que zero.");
        if (!preco || Number(preco) <= 0)
          throw new Error("Preço por litro deve ser maior que zero.");
        if (!odometro || Number(odometro) <= 0)
          throw new Error("Indique o odómetro.");

        const payload = {
          veiculoId,
          data: dataAbastecimento,
          tipoCombustivel,
          litros,
          precoPorLitro: preco,
          odometro,
          posto,
          observacoes,
          completo: true,
        };

        if (isEditMode && abastecimentoIdFromUrl) {
          await updateAbastecimento(abastecimentoIdFromUrl, payload);
          showMessage("Abastecimento atualizado com sucesso! ✅", "success");
        } else {
          await createAbastecimento(payload);
          showMessage("Abastecimento registado com sucesso! ✅", "success");
          form.reset();
        }
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Erro ao guardar abastecimento.", "error");
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!isEditMode || !abastecimentoIdFromUrl) return;
      const confirma = confirm(
        "Tem a certeza que pretende eliminar este abastecimento?"
      );
      if (!confirma) return;
      try {
        await deleteAbastecimento(abastecimentoIdFromUrl);
        showMessage("Abastecimento eliminado com sucesso. ✅", "success");
        // opcional: redireccionar de volta à home
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 800);
      } catch (err) {
        console.error(err);
        showMessage("Erro ao eliminar abastecimento.", "error");
      }
    });
  }

  // ordem: se for edição, primeiro carrega o doc, depois os veículos
  loadAbastecimentoIfEdit().then(loadVeiculos).catch(console.error);
});
