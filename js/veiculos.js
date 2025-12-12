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

  inputName.value = data.nome;
  inputBrand.value = data.marca;
  inputModel.value = data.modelo;
  inputPlate.value = data.matricula || "";
  inputFuel.value = data.combustivelPadrao || "";
  inputOdometer.value = data.odometroInicial || "";
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

  // buscar abastecimentos para calcular stats por veículo
  const abastecimentos = await getAbastecimentosDoUtilizador({ limite: 500 });

  const statsPorVeiculo = {};
  abastecimentos.forEach((abs) => {
    const vid = abs.veiculoId;
    const litros = Number(abs.litros) || 0;
    const preco = Number(abs.precoPorLitro) || 0;
    const custoTotal = litros * preco;

    if (!statsPorVeiculo[vid]) statsPorVeiculo[vid] = { count: 0, total: 0 };
    statsPorVeiculo[vid].count += 1;
    statsPorVeiculo[vid].total += custoTotal;
  });

  veiculos.forEach((v) => {
    const stats = statsPorVeiculo[v.id] || { count: 0, total: 0 };

    const card = document.createElement("article");
    card.className = "vehicle-card vehicle-card-modern";
    card.dataset.veiculoId = v.id;

    const matricula = v.matricula || "Sem matrícula";
    const combustivel = v.combustivelPadrao || "—";

    // Se tiveres ano no documento (ex: v.ano), mostramos. Se não, não aparece.
    const ano = v.ano || "";

    card.innerHTML = `
      <div class="vehicle-card-header-modern">
        <div class="vehicle-card-main">
          <div class="vehicle-avatar">
            <svg class="icon" aria-hidden="true">
              <use href="assets/icons.svg#icon-car"></use>
            </svg>
          </div>

          <div class="vehicle-card-text">
            <h3 class="vehicle-title">${v.nome || "Veículo"}</h3>
            <p class="vehicle-subtitle">${v.marca || ""} ${v.modelo || ""}</p>

            <div class="vehicle-badges">
              <span class="badge badge-outline">${matricula}</span>
              ${
                ano
                  ? `<span class="badge badge-year">
                       <svg class="icon icon-badge" aria-hidden="true">
                         <use href="assets/icons.svg#icon-calendar"></use>
                       </svg>
                       ${ano}
                     </span>`
                  : ""
              }
            </div>
          </div>
        </div>
        <div class="vehicle-arrow" aria-hidden="true">
          <svg class="icon icon-chevron">
            <use href="assets/icons.svg#icon-chevron-right"></use>
          </svg>
        </div>
      </div>

      <div class="vehicle-card-bottom-modern">
        <div class="vehicle-metric">
          <div class="vehicle-metric-value">${stats.count}</div>
          <div class="vehicle-metric-label">Abastecimentos</div>
        </div>

        <div class="vehicle-metric vehicle-metric-center">
          <div class="vehicle-metric-value">€${stats.total.toFixed(0)}</div>
          <div class="vehicle-metric-label">Total Gasto</div>
        </div>

        <span class="fuel-pill ${String(combustivel).toLowerCase()}">
          ${combustivel}
        </span>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("button")) return;
      window.location.href = "veiculo.html?id=" + encodeURIComponent(v.id);
    });

    listEl.appendChild(card);
  });
}

// ================ SUBMETER MODAL ================
modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    nome: inputName.value.trim(),
    marca: inputBrand.value.trim(),
    modelo: inputModel.value.trim(),
    matricula: inputPlate.value.trim(),
    combustivelPadrao: inputFuel.value,
    odometroInicial: Number(inputOdometer.value) || 0,
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
