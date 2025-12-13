// js/modal-abastecimento.js
// CORRIGIDO PARA SUBCOLEÇÕES:
// veiculos/{veiculoId}/abastecimentos/{abastecimentoId}

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const form = document.getElementById("fuel-form");
  const msgEl = document.getElementById("fuel-message");
  const selectVeiculo = document.getElementById("fuel-vehicle");
  const helperVeiculo = document.getElementById("fuel-vehicle-helper");
  const deleteBtn = document.getElementById("fuel-delete");

  const params = new URLSearchParams(window.location.search);

  // Aceita ambos os formatos: ?veiculoId=...  ou ?id=... (para veículo)
  const veiculoIdFromUrl =
    params.get("veiculoId") || params.get("vehicleId") || params.get("carId") || "";

  // id do abastecimento (modo editar)
  const abastecimentoId = params.get("id") || "";

  let isEditMode = !!abastecimentoId;
  let currentAbastecimento = null;

  // veiculoId efetivo para CRUD (string)
  let currentVeiculoId = veiculoIdFromUrl || "";

 function showMessage(text, type = null) {
    if (!msgEl) return;

    msgEl.textContent = text || "";
    msgEl.className = "form-message";

    if (type === "error") {
      msgEl.classList.add("form-message--error");
    }

    if (type === "success") {
      msgEl.classList.add("form-message--success");
    }
  }

  function setVehicleHelper(text) {
    if (helperVeiculo) helperVeiculo.textContent = text || "";
  }

  function setPageTitle(text) {
    const el = document.querySelector("header .page-title span");
    if (el) el.textContent = text;
  }

  function getInputValue(id) {
    return document.getElementById(id)?.value ?? "";
  }

  // -------------------------------------------------------------------
  // 0) FALLBACK “À PROVA DE BALA”:
  //    Se estivermos em modo edição e não vier veiculoId na URL,
  //    tentamos descobrir em que veículo está o abastecimento.
  // -------------------------------------------------------------------
  async function inferVeiculoIdFromAbastecimentoId(abId) {
    if (!abId) return "";

    // Precisamos de auth e db disponíveis
    if (typeof auth === "undefined" || !auth?.currentUser) return "";

    try {
      const veiculos = await getVeiculosDoUtilizador();
      if (!veiculos.length) return "";

      // Varre veículos e procura o doc na subcoleção
      for (const v of veiculos) {
        const snap = await db
          .collection("veiculos")
          .doc(v.id)
          .collection("abastecimentos")
          .doc(abId)
          .get();

        if (snap.exists) return v.id;
      }
      return "";
    } catch (err) {
      console.error("[modal-abastecimento] inferVeiculoId error:", err);
      return "";
    }
  }

  // -------------------------------------------------------------------
  // 1) CARREGAR VEÍCULOS PARA O SELECT (APÓS AUTH)
  // -------------------------------------------------------------------
  async function carregarVeiculosNoDropdown() {
    if (!selectVeiculo) return;

    selectVeiculo.innerHTML = `<option value="">A carregar...</option>`;
    setVehicleHelper("");

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
      opt.textContent = `${v.nome || "Veículo"} (${v.marca || "Marca"})`;
      selectVeiculo.appendChild(opt);
    });

    // Pré-selecionar se vier da URL (ou se já tivermos currentVeiculoId)
    const pre = currentVeiculoId || veiculoIdFromUrl;
    if (pre && selectVeiculo.querySelector(`option[value="${pre}"]`)) {
      selectVeiculo.value = pre;
    }
  }

  // -------------------------------------------------------------------
  // 2) CARREGAR ABASTECIMENTO EM MODO EDIÇÃO
  // -------------------------------------------------------------------
  async function carregarAbastecimentoParaEdicao() {
    if (!isEditMode) return;

    try {
      // Se não tivermos veiculoId ainda, tenta inferir
      if (!currentVeiculoId) {
        currentVeiculoId = await inferVeiculoIdFromAbastecimentoId(abastecimentoId);
      }

      if (!currentVeiculoId) {
        // Não dá para editar sem saber o veículo pai
        isEditMode = false;
        showMessage(
          "Não foi possível identificar o veículo deste abastecimento. Abra o registo a partir do veículo/detalhe.",
          "error"
        );
        return;
      }

      // Buscar abastecimento (agora precisa do veiculoId)
      const abs = await getAbastecimentoById(currentVeiculoId, abastecimentoId);
      if (!abs) {
        isEditMode = false;
        showMessage("Abastecimento não encontrado.", "error");
        return;
      }

      currentAbastecimento = abs;

      setPageTitle("Editar Abastecimento");

      // preencher form
      document.getElementById("fuel-date").value = abs.data || "";
      document.getElementById("fuel-type").value = abs.tipoCombustivel || "";
      document.getElementById("fuel-liters").value = abs.litros ?? "";
      document.getElementById("fuel-price").value = abs.precoPorLitro ?? "";
      document.getElementById("fuel-odometer").value = abs.odometro ?? "";
      document.getElementById("fuel-station").value = abs.posto || "";
      document.getElementById("fuel-notes").value = abs.observacoes || "";

      // Selecionar veículo e bloquear em modo edição (evita “mover” registo entre veículos)
      if (selectVeiculo) {
        selectVeiculo.value = currentVeiculoId;
        selectVeiculo.disabled = true;
        setVehicleHelper("Veículo bloqueado em modo edição.");
      }

      if (deleteBtn) deleteBtn.classList.remove("hidden");
      const submitSpan = form?.querySelector("button[type='submit'] span");
      if (submitSpan) submitSpan.textContent = "Guardar alterações";
    } catch (err) {
      console.error(err);
      showMessage("Erro ao carregar abastecimento.", "error");
      isEditMode = false;
    }
  }

  // -------------------------------------------------------------------
  // 3) SUBMETER FORMULÁRIO
  // -------------------------------------------------------------------
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage("");

      try {
        // veículo escolhido (ou bloqueado)
        const veiculoId = (selectVeiculo?.value || currentVeiculoId || "").trim();

        // validações base
        if (!veiculoId) throw new Error("Selecione um veículo.");
        if (typeof veiculoId !== "string") throw new Error("veiculoId inválido.");

        const data = {
          data: getInputValue("fuel-date"),
          tipoCombustivel: getInputValue("fuel-type"),
          litros: Number(getInputValue("fuel-liters")),
          precoPorLitro: Number(getInputValue("fuel-price")),
          odometro: Number(getInputValue("fuel-odometer")),
          posto: getInputValue("fuel-station") || "",
          observacoes: getInputValue("fuel-notes") || "",
          completo: true,
        };

        if (!data.data) throw new Error("Indique a data.");
        if (!data.tipoCombustivel) throw new Error("Indique o tipo de combustível.");
        if (!Number.isFinite(data.litros) || data.litros <= 0) throw new Error("Litros inválidos.");
        if (!Number.isFinite(data.precoPorLitro) || data.precoPorLitro <= 0) throw new Error("Preço inválido.");
        if (!Number.isFinite(data.odometro) || data.odometro <= 0) throw new Error("Odómetro inválido.");

        if (isEditMode) {
          if (!abastecimentoId) throw new Error("ID do abastecimento em falta.");
          await updateAbastecimento(veiculoId, abastecimentoId, data);
          showMessage("Abastecimento atualizado com sucesso! ✅", "success");
        } else {
          await createAbastecimento(veiculoId, data);
          showMessage("Abastecimento registado com sucesso! ✅", "success");
          form.reset();

          // se veio veículo por URL, manter seleção para registos seguidos
          if (selectVeiculo && veiculoIdFromUrl) {
            selectVeiculo.value = veiculoIdFromUrl;
          }
        }
      } catch (err) {
        console.error(err);
        showMessage(err?.message || "Erro ao guardar abastecimento.", "error");
      }
    });
  }

  // -------------------------------------------------------------------
  // 4) APAGAR ABASTECIMENTO
  // -------------------------------------------------------------------
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!isEditMode) return;
      if (!confirm("Deseja eliminar este abastecimento?")) return;

      try {
        const veiculoId = (currentVeiculoId || selectVeiculo?.value || "").trim();
        if (!veiculoId) throw new Error("veiculoId em falta.");

        await deleteAbastecimento(veiculoId, abastecimentoId);

        showMessage("Abastecimento eliminado. ✅", "success");

        // voltar para o veículo se possível
        setTimeout(() => {
          window.location.href = veiculoId
            ? `veiculo.html?id=${encodeURIComponent(veiculoId)}`
            : "dashboard.html";
        }, 600);
      } catch (err) {
        console.error(err);
        showMessage(err?.message || "Erro ao eliminar.", "error");
      }
    });
  }

  // -------------------------------------------------------------------
  // 5) ORDEM CORRETA: AUTH → VEÍCULOS → (EDITAR)
  // -------------------------------------------------------------------
  if (typeof auth === "undefined" || !auth?.onAuthStateChanged) {
    console.error("[modal-abastecimento] auth não disponível.");
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) return;

    // carregar veículos primeiro
    await carregarVeiculosNoDropdown();

    // se for edição, garantir veiculoId
    if (isEditMode && !currentVeiculoId) {
      currentVeiculoId = await inferVeiculoIdFromAbastecimentoId(abastecimentoId);
      if (currentVeiculoId && selectVeiculo) {
        selectVeiculo.value = currentVeiculoId;
      }
    }

    // só depois faz sentido carregar para edição
    await carregarAbastecimentoParaEdicao();
  });
});
