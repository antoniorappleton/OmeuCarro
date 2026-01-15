// ================================================
//   veiculos.js – Lógica da página "veiculos.html"
// ================================================

// REFERÊNCIAS DOS ELEMENTOS
const listEl = document.getElementById("vehicles-list");
const emptyEl = document.getElementById("vehicles-empty");
const btnAddVehicle = document.getElementById("btn-add-vehicle");
const btnAddFirstVehicle = document.getElementById("btn-add-first-vehicle");

const modalOverlay = document.getElementById("vehicle-modal-overlay");
const modalForm = document.getElementById("vehicle-modal-form");
const modalTitle = document.getElementById("vehicle-modal-title");

const inputName = document.getElementById("vehicle-name");
const inputBrand = document.getElementById("vehicle-brand");
const inputModel = document.getElementById("vehicle-model");
const inputPlate = document.getElementById("vehicle-plate");
const inputFuel = document.getElementById("vehicle-fuel");
const inputOdometer = document.getElementById("vehicle-odometer");
const modalMsg = document.getElementById("vehicle-modal-message");

let editingVehicleId = null; // null → criar; id → editar

// ================ MODAL ================
function openModal(editing = false, data = null) {
  modalOverlay.classList.add("is-open");
  document.body.classList.add("modal-open");

  modalMsg.textContent = "";

  if (!editing) {
    modalTitle.textContent = "Adicionar veículo";
    modalForm.reset();
    editingVehicleId = null;
    return;
  }

  modalTitle.textContent = "Editar veículo";
  editingVehicleId = data.id;

  // ===== CAMPOS EXISTENTES =====
  inputName.value = data.nome || "";
  inputBrand.value = data.marca || "";
  inputModel.value = data.modelo || "";
  inputPlate.value = data.matricula || "";
  inputFuel.value = data.combustivelPadrao || "";
  inputOdometer.value = data.odometroInicial || "";

  // ===== NOVOS CAMPOS TÉCNICOS =====
  document.getElementById("vehicle-year").value = data.ano ?? "";

  document.getElementById("vehicle-vin").value = data.vin ?? "";

  document.getElementById("vehicle-engine").value = data.cilindradaCc ?? "";

  document.getElementById("vehicle-power").value = data.potenciaCv ?? "";

  document.getElementById("vehicle-tank").value =
    data.capacidadeDepositoLitros ?? "";

  document.getElementById("vehicle-acquisition").value = data.dataAquisicao
    ? data.dataAquisicao.toDate().toISOString().split("T")[0]
    : "";

  // ===== SEGURO =====
  document.getElementById("vehicle-insurer").value =
    data.seguro?.seguradora ?? "";

  document.getElementById("vehicle-policy").value = data.seguro?.apolice ?? "";

  document.getElementById("vehicle-insurance-validity").value = data.seguro
    ?.validade
    ? data.seguro.validade.toDate().toISOString().split("T")[0]
    : "";

  // ===== INSPEÇÃO =====
  document.getElementById("vehicle-inspection-date").value = data.inspecao
    ?.proximaData
    ? data.inspecao.proximaData.toDate().toISOString().split("T")[0]
    : "";

  document.getElementById("vehicle-inspection-center").value =
    data.inspecao?.centro ?? "";

  // ===== IUC =====
  document.getElementById("vehicle-iuc-date").value = data.iuc?.dataLimite
    ? data.iuc.dataLimite.toDate().toISOString().split("T")[0]
    : "";

  document.getElementById("vehicle-iuc-value").value = data.iuc?.valor ?? "";
}

function closeModal() {
  modalOverlay.classList.remove("is-open");
  document.body.classList.remove("modal-open");
}

// botões modal
document.getElementById("btn-close-vehicle-modal").onclick = closeModal;
document.getElementById("btn-cancel-vehicle-modal").onclick = closeModal;

btnAddVehicle.onclick = () => openModal(false);
if (btnAddFirstVehicle) {
  btnAddFirstVehicle.onclick = () => openModal(false);
}

// ================ LISTAR VEÍCULOS ================
async function carregarVeiculos() {
  const veiculos = await getVeiculosDoUtilizador();

  listEl.innerHTML = "";

  if (!veiculos || veiculos.length === 0) {
    listEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  listEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  // 🔹 carregar TODOS os abastecimentos (subcoleções)
  const abastecimentos = await getTodosAbastecimentosDoUtilizador(500);

  // 🔹 mapear estatísticas por veículo
  const statsPorVeiculo = {};

  abastecimentos.forEach((abs) => {
    const vid = abs.veiculoId;
    if (!vid) return;

    const litros = Number(abs.litros) || 0;
    const preco = Number(abs.precoPorLitro) || 0;
    const custo = litros * preco;

    if (!statsPorVeiculo[vid]) {
      statsPorVeiculo[vid] = { count: 0, total: 0 };
    }

    statsPorVeiculo[vid].count += 1;
    statsPorVeiculo[vid].total += custo;
  });

  // 🔹 agora sim: criar cartões
  veiculos.forEach((v) => {
    const stats = statsPorVeiculo[v.id] || { count: 0, total: 0 };
    const card = document.createElement("article");
    card.className = "vehicle-card vehicle-card-modern";
    card.dataset.veiculoId = v.id;
    const matricula = v.matricula || "Sem matrícula";
    const combustivel = v.combustivelPadrao || "—";

    // Se tiveres ano no documento (ex: v.ano), mostramos. Se não, não aparece.
    const ano = v.ano || "";

    // 🔹 Calcular estados (Seguro, IPO, IUC)
    const now = new Date();
    // Helper para badge
    function getStatusBadge(label, dateObj) {
      if (!dateObj) return ""; // Não tem data

      // Converter Timestamp para Date se necessário
      const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
      if (isNaN(date.getTime())) return "";

      const diffTime = date - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let statusClass = "badge-status-success";
      let icon = "icon-check";
      let text = "Válido";

      if (diffDays < 0) {
        statusClass = "badge-status-danger";
        icon = "icon-alert-circle"; // Assumindo que existe, ou x
        text = "Expirou";
      } else if (diffDays <= 30) {
        statusClass = "badge-status-warning";
        icon = "icon-alert-triangle"; 
        text = `Expira em ${diffDays}d`;
      }

      return `
        <div class="status-item ${statusClass}">
           <div class="status-label">${label}</div>
           <div class="status-value">
             <svg class="badge-icon"><use href="assets/icons-unified.svg#${icon}"></use></svg>
             <span>${text}</span>
           </div>
        </div>
      `;
    }

    const seguroBadge = getStatusBadge("Seguro", v.seguro?.validade);
    const ipoBadge = getStatusBadge("IPO / Inspeção", v.inspecao?.proximaData);
    const iucBadge = getStatusBadge("IUC", v.iuc?.dataLimite);

    card.innerHTML = `
      <div class="vehicle-card-top">
        <div class="vehicle-left">
          <div class="vehicle-avatar">
            ${
              v.fotoUrl 
              ? `<img src="${v.fotoUrl}" alt="${v.nome}">`
              : `<svg class="icon" aria-hidden="true"><use href="assets/icons-unified.svg#icon-car"></use></svg>`
            }
          </div>

          <div class="vehicle-text">
            <h3 class="vehicle-title">${v.nome || "Veículo"}</h3>
            <p class="vehicle-subtitle">${v.marca || ""} ${v.modelo || ""}</p>

            <div class="vehicle-badges">
              <span class="badge badge-outline">${matricula}</span>
              ${
                ano
                  ? `
                <span class="badge badge-year">
                  <svg class="icon icon-badge" aria-hidden="true">
                    <use href="assets/icons-unified.svg#icon-calendar"></use>
                  </svg>
                  ${ano}
                </span>`
                  : ""
              }
            </div>

            <!-- STATUS GRID -->
            ${ (seguroBadge || ipoBadge || iucBadge) 
               ? `<div class="vehicle-status-grid">${seguroBadge}${ipoBadge}${iucBadge}</div>` 
               : "" 
            }

          </div>
        </div>

        <div class="vehicle-actions">
          <button class="icon-btn-sm" type="button" data-edit="${
            v.id
          }" aria-label="Editar veículo">
            <svg class="icon" aria-hidden="true">
              <use href="assets/icons-unified.svg#icon-edit"></use>
            </svg>
          </button>

          <button class="icon-btn-sm danger" type="button" data-del="${
            v.id
          }" aria-label="Eliminar veículo">
            <svg class="icon" aria-hidden="true">
              <use href="assets/icons-unified.svg#icon-trash"></use>
            </svg>
          </button>

          <!-- NOVOS atalhos -->
          <!-- (Moved to compact toolbar) -->

          <span class="vehicle-arrow" aria-hidden="true" style="display:none;">
            <!-- Chevron hidden in compact mode -->
          </span>
        </div>

      </div>

      <div class="vehicle-divider"></div>

      <div class="vehicle-bottom">
        <div class="metric">
          <div class="metric-value">${stats.count}</div>
          <div class="metric-label">Abastecimentos</div>
        </div>

        <div class="metric metric-center">
          <div class="metric-value metric-value-primary">€${stats.total.toFixed(
            0
          )}</div>
          <div class="metric-label">Total Gasto</div>
        </div>

        <span class="fuel-pill">${combustivel}</span>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("button")) return;
      window.location.href = "veiculo.html?id=" + encodeURIComponent(v.id);
    });

    listEl.appendChild(card);
  });
}

// ================ EDITAR / ELIMINAR VEÍCULO ================
listEl.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");

  if (editBtn) {
    e.stopPropagation();
    const id = editBtn.getAttribute("data-edit");
    const veiculos = await getVeiculosDoUtilizador();
    const v = veiculos.find((x) => x.id === id);
    if (v) openModal(true, v);
    return;
  }

  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.getAttribute("data-del");
    if (!confirm("Eliminar este veículo? (isto não apaga abastecimentos)"))
      return;
    await deleteVeiculo(id);
    await carregarVeiculos();
  }

  const fuelBtn = e.target.closest("[data-fuel]");
  const maintBtn = e.target.closest("[data-maint]");
  const docsBtn = e.target.closest("[data-docs]");

  if (fuelBtn) {
    e.stopPropagation();
    const id = fuelBtn.getAttribute("data-fuel");
    window.location.href =
      "veiculo.html?id=" + encodeURIComponent(id) + "#abastecimentos";
    return;
  }

  if (maintBtn) {
    e.stopPropagation();
    const id = maintBtn.getAttribute("data-maint");
    window.location.href =
      "veiculo.html?id=" + encodeURIComponent(id) + "#manutencoes";
    return;
  }

  if (docsBtn) {
    e.stopPropagation();
    const id = docsBtn.getAttribute("data-docs");
    window.location.href =
      "veiculo.html?id=" + encodeURIComponent(id) + "#docs";
    return;
  }
});

// ================ SUBMETER MODAL ================
modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    // EXISTENTES
    nome: inputName.value.trim(),
    marca: inputBrand.value.trim(),
    modelo: inputModel.value.trim(),
    matricula: inputPlate.value.trim(),
    combustivelPadrao: inputFuel.value,
    odometroInicial: Number(inputOdometer.value) || 0,

    // 🔹 NOVOS DADOS TÉCNICOS
    ano: Number(document.getElementById("vehicle-year")?.value) || null,
    vin: document.getElementById("vehicle-vin")?.value.trim() || "",
    tipoCombustivel: inputFuel.value || "",

    cilindradaCc:
      Number(document.getElementById("vehicle-engine")?.value) || null,

    potenciaCv: Number(document.getElementById("vehicle-power")?.value) || null,

    capacidadeDepositoLitros:
      Number(document.getElementById("vehicle-tank")?.value) || null,

    dataAquisicao: document.getElementById("vehicle-acquisition")?.value
      ? new Date(document.getElementById("vehicle-acquisition").value)
      : null,

    // 🔹 SEGURO
    seguro: {
      seguradora:
        document.getElementById("vehicle-insurer")?.value.trim() || "",
      apolice: document.getElementById("vehicle-policy")?.value.trim() || "",
      validade: document.getElementById("vehicle-insurance-validity")?.value
        ? new Date(document.getElementById("vehicle-insurance-validity").value)
        : null,
    },

    // 🔹 INSPEÇÃO
    inspecao: {
      proximaData: document.getElementById("vehicle-inspection-date")?.value
        ? new Date(document.getElementById("vehicle-inspection-date").value)
        : null,
      centro:
        document.getElementById("vehicle-inspection-center")?.value.trim() ||
        "",
    },

    // 🔹 IUC
    iuc: {
      dataLimite: document.getElementById("vehicle-iuc-date")?.value
        ? new Date(document.getElementById("vehicle-iuc-date").value)
        : null,
      valor:
        Number(document.getElementById("vehicle-iuc-value")?.value) || null,
    },
  };

  try {
    if (editingVehicleId) {
      await updateVeiculo(editingVehicleId, data);
    } else {
      await createVeiculo(data);
    }

    closeModal();
    carregarVeiculos();
  } catch (err) {
    modalMsg.textContent = err.message;
    modalMsg.style.color = "red";
  }
});

// ================ BOOTSTRAP ================
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  carregarVeiculos();
});
