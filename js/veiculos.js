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

veiculos.forEach((v) => {
  const card = document.createElement("article");
  card.className = "vehicle-card";

  card.innerHTML = `
    <div class="vehicle-card-header">
      <div>
        <h3 class="vehicle-card-title">${v.nome}</h3>
        <p class="vehicle-card-subtitle">${v.marca} ${v.modelo}</p>
      </div>

      <div class="vehicle-card-actions">
        <button class="vehicle-btn btn-edit" title="Editar">
          <svg class="icon"><use href="assets/icons.svg#icon-edit"></use></svg>
        </button>
        <button class="vehicle-btn btn-delete" title="Apagar">
          <svg class="icon"><use href="assets/icons.svg#icon-trash"></use></svg>
        </button>
      </div>
    </div>

    <div class="vehicle-card-footer">
      <span>${v.combustivelPadrao || "—"}</span>
      <span>Od: ${v.odometroInicial || 0} km</span>
    </div>
  `;

  // clicar no "cabeçalho" abre o detalhe
  const header = card.querySelector(".vehicle-card-header");
  header.style.cursor = "pointer";
  header.addEventListener("click", () => {
    window.location.href = `veiculo.html?id=${encodeURIComponent(v.id)}`;
  });

  // editar
  card.querySelector(".btn-edit").onclick = (ev) => {
    ev.stopPropagation();
    openModal(true, v);
  };

  // apagar
  card.querySelector(".btn-delete").onclick = async (ev) => {
    ev.stopPropagation();
    if (!confirm("Tem a certeza que pretende eliminar este veículo?")) return;
    await deleteVeiculo(v.id);
    carregarVeiculos();
  };

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
