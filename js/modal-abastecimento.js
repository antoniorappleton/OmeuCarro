// js/abastecimentos.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fuel-form");
  const msgEl = document.getElementById("fuel-message");
  const selectVeiculo = document.getElementById("fuel-vehicle");
  const helperVeiculo = document.getElementById("fuel-vehicle-helper");

  const urlParams = new URLSearchParams(window.location.search);
  const veiculoIdFromUrl = urlParams.get("veiculoId");

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
      // só veículos do utilizador autenticado
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

      // pré-selecionar veículo passado por query string (?veiculoId=...)
      if (veiculoIdFromUrl) {
        const exists = veiculos.some((v) => v.id === veiculoIdFromUrl);
        if (exists) {
          selectVeiculo.value = veiculoIdFromUrl;
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

        // grava abastecimento associado ao utilizador (via firestore.js) e ao veículo
        await createAbastecimento({
          veiculoId,
          data: dataAbastecimento,
          tipoCombustivel,
          litros,
          precoPorLitro: preco,
          odometro,
          posto,
          observacoes,
          completo: true,
        });

        showMessage("Abastecimento registado com sucesso! ✅", "success");
        form.reset();
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Erro ao guardar abastecimento.", "error");
      }
    });
  }

  loadVeiculos();
});
