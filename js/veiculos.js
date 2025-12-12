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
      <div class="vehicle-card-top">
        <div class="vehicle-left">
          <div class="vehicle-avatar">
            <svg class="icon" aria-hidden="true">
              <use href="assets/icons.svg#icon-car"></use>
            </svg>
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
                    <use href="assets/icons.svg#icon-calendar"></use>
                  </svg>
                  ${ano}
                </span>`
                  : ""
              }
            </div>
          </div>
        </div>

        <div class="vehicle-actions">
          <button class="icon-btn-sm" type="button" data-edit="${
            v.id
          }" aria-label="Editar veículo">
            <svg class="icon" aria-hidden="true">
              <use href="assets/icons-extra.svg#icon-edit"></use>
            </svg>
          </button>
          <button class="icon-btn-sm danger" type="button" data-del="${
            v.id
          }" aria-label="Eliminar veículo">
            <svg class="icon" aria-hidden="true">
              <use href="assets/icons-extra.svg#icon-trash"></use>
            </svg>
          </button>

          <span class="vehicle-arrow" aria-hidden="true">
            <svg class="icon icon-chevron">
              <use href="assets/icons.svg#icon-chevron-right"></use>
            </svg>
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
});


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
