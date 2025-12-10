// public/js/home.js

document.addEventListener("DOMContentLoaded", () => {
  // MOCK – depois ligamos ao Firestore
  const vehicles = [
    {
      id: "1",
      name: "Carro Principal",
      brand: "Toyota",
      model: "Corolla",
      year: 2021,
      licensePlate: "AA-12-BB",
      fuelType: "Gasolina",
    },
    {
      id: "2",
      name: "SUV Família",
      brand: "BMW",
      model: "X3",
      year: 2022,
      licensePlate: "CC-34-DD",
      fuelType: "Diesel",
    },
  ];

  const fuelRecords = [
    { id: "1", vehicleId: "1", liters: 45.2, totalCost: 65.93 },
    { id: "2", vehicleId: "1", liters: 38.7, totalCost: 55.92 },
    { id: "3", vehicleId: "2", liters: 55.0, totalCost: 76.4 },
  ];

  // ---- KPIs ----
  const totalSpent = fuelRecords.reduce((s, r) => s + r.totalCost, 0);
  const totalLiters = fuelRecords.reduce((s, r) => s + r.liters, 0);
  const totalRecords = fuelRecords.length;

  document.getElementById("stat-veiculos-value").textContent = vehicles.length;
  document.getElementById(
    "stat-gasto-value"
  ).textContent = `€${totalSpent.toFixed(0)}`;
  document.getElementById(
    "stat-litros-value"
  ).textContent = `${totalLiters.toFixed(0)} L`;
  document.getElementById("stat-abastecimentos-value").textContent =
    totalRecords;

  // ---- Veículos ----
  const listEl = document.getElementById("vehicles-list");
  const emptyEl = document.getElementById("vehicles-empty");

  if (!vehicles.length) {
    if (emptyEl) emptyEl.classList.remove("hidden");
  } else {
    if (emptyEl) emptyEl.classList.add("hidden");

    vehicles.forEach((v) => {
      const card = document.createElement("article");
      card.className = "vehicle-card";
      card.innerHTML = `
        <div class="vehicle-card-header">
          <div>
            <div class="vehicle-card-title">${v.name}</div>
            <div class="vehicle-card-subtitle">${v.brand} ${v.model}</div>
          </div>
          <span class="vehicle-card-meta">${v.licensePlate}</span>
        </div>
        <div class="vehicle-card-meta">
          ${v.year || ""} • ${v.fuelType || ""}
        </div>
        <div class="vehicle-card-footer">
          <span>Abastecimentos: ${
            fuelRecords.filter((r) => r.vehicleId === v.id).length
          }</span>
          <span>Total: €${fuelRecords
            .filter((r) => r.vehicleId === v.id)
            .reduce((s, r) => s + r.totalCost, 0)
            .toFixed(0)}</span>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  // ---- MODAL "Adicionar veículo" na Home ----
  const btnAdd = document.getElementById("btn-add-vehicle");
  const btnAddFirst = document.getElementById("btn-add-first-vehicle");

  const vehicleModalOverlay = document.getElementById("vehicle-modal-overlay");
  const vehicleModalForm = document.getElementById("vehicle-modal-form");
  const vehicleModalMessage = document.getElementById("vehicle-modal-message");
  const btnCloseVehicleModal = document.getElementById(
    "btn-close-vehicle-modal"
  );
  const btnCancelVehicleModal = document.getElementById(
    "btn-cancel-vehicle-modal"
  );

  function openVehicleModal() {
    if (!vehicleModalOverlay) return;
    vehicleModalOverlay.classList.add("is-open"); // classe já usada no CSS do fuel-modal
    document.body.classList.add("modal-open");

    if (vehicleModalMessage) {
      vehicleModalMessage.textContent = "";
      vehicleModalMessage.className = "form-message";
    }
  }

  function closeVehicleModal() {
    if (!vehicleModalOverlay) return;
    vehicleModalOverlay.classList.remove("is-open");
    document.body.classList.remove("modal-open");
  }

  // abrir modal pelos botões da home
  function handleAddVehicleClick(event) {
    event.preventDefault();
    openVehicleModal();
  }

  if (btnAdd) btnAdd.addEventListener("click", handleAddVehicleClick);
  if (btnAddFirst) btnAddFirst.addEventListener("click", handleAddVehicleClick);

  // fechar pelo X
  if (btnCloseVehicleModal) {
    btnCloseVehicleModal.addEventListener("click", (e) => {
      e.preventDefault();
      closeVehicleModal();
    });
  }

  // fechar pelo botão "Cancelar"
  if (btnCancelVehicleModal) {
    btnCancelVehicleModal.addEventListener("click", (e) => {
      e.preventDefault();
      closeVehicleModal();
    });
  }

  // fechar ao clicar fora do modal
  if (vehicleModalOverlay) {
    vehicleModalOverlay.addEventListener("click", (e) => {
      if (e.target === vehicleModalOverlay) {
        closeVehicleModal();
      }
    });
  }

  // submissão do formulário -> cria veículo no Firestore
  if (vehicleModalForm) {
    vehicleModalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!vehicleModalMessage) return;

      vehicleModalMessage.textContent = "";
      vehicleModalMessage.className = "form-message";

      const nome = document.getElementById("modal-vehicle-name").value.trim();
      const marca = document.getElementById("modal-vehicle-brand").value.trim();
      const modelo = document
        .getElementById("modal-vehicle-model")
        .value.trim();
      const matricula = document
        .getElementById("modal-vehicle-plate")
        .value.trim();
      const combustivelPadrao =
        document.getElementById("modal-vehicle-fuel").value;
      const odometroInicial = document
        .getElementById("modal-vehicle-odometer")
        .value.trim();

      try {
        if (!nome || !marca || !modelo) {
          throw new Error("Preencha pelo menos Nome, Marca e Modelo.");
        }

        await createVeiculo({
          nome,
          marca,
          modelo,
          matricula,
          combustivelPadrao,
          odometroInicial,
        });

        vehicleModalMessage.textContent = "Veículo criado com sucesso! ✅";
        vehicleModalMessage.classList.add("form-message--success");
        vehicleModalForm.reset();

        // se quiseres, depois de criar podes ir directo para a página de veículos:
        // window.location.href = "veiculos.html";
      } catch (err) {
        console.error(err);
        vehicleModalMessage.textContent =
          err.message || "Erro ao criar veículo.";
        vehicleModalMessage.classList.add("form-message--error");
      }
    });
  }

  // ---- Logout ----
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await auth.signOut();
        window.location.href = "index.html";
      } catch (err) {
        console.error("Erro ao terminar sessão:", err);
      }
    });
  }
});
