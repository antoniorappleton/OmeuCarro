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

  // ---- Botões "Adicionar veículo" (por enquanto só alerta) ----
  const btnAdd = document.getElementById("btn-add-vehicle");
  const btnAddFirst = document.getElementById("btn-add-first-vehicle");

  function handleAddVehicleClick() {
    alert("Aqui vai abrir o fluxo de 'Adicionar veículo' (form ou modal).");
    // Exemplo futuro:
    // window.location.href = "veiculos.html";
  }

  if (btnAdd) btnAdd.addEventListener("click", handleAddVehicleClick);
  if (btnAddFirst) btnAddFirst.addEventListener("click", handleAddVehicleClick);

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
