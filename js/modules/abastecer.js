// REFERENCES
const vehicleSelect = document.getElementById("vehicle-select");
const inputOdometer = document.getElementById("input-odometer");
const inputLiters = document.getElementById("input-liters");
const inputTotal = document.getElementById("input-total-price");
const btnSave = document.getElementById("btn-save");
const lastOdometerText = document.getElementById("last-odometer-text");
const dateDisplay = document.getElementById("current-date-display");

let selectedVehicle = null;

// INIT
firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  // Set Date
  const now = new Date();
  dateDisplay.textContent = `Data: ${now.toLocaleDateString("pt-PT")} â€¢ ${now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;

  // Load Vehicles
  await loadVehicles();

  // --- NOVO: Listener de mensagens e refresh automático do token ---
  if (typeof window.listenToForegroundMessages === "function") {
    window.listenToForegroundMessages();
  }
  if ("Notification" in window && Notification.permission === "granted") {
    getUserSettings().then((settings) => {
      if (settings && settings.notificacoesAtivas !== false) {
        console.log("[Abastecer] A atualizar token FCM...");
        window.requestNotificationPermissionAndSaveToken().catch(console.error);
      }
    });
  }
  // -----------------------------------------------------------------
});

async function loadVehicles() {
  try {
    const vehicles = await getVeiculosDoUtilizador();

    vehicleSelect.innerHTML = `<option disabled selected value="">Selecione um veí­culo</option>`;

    vehicles.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.matricula || "(Sem Mat)"} - ${v.nome}`;
      vehicleSelect.appendChild(opt);
    });

    // Listener for change
    vehicleSelect.onchange = async () => {
      const vid = vehicleSelect.value;
      selectedVehicle = vehicles.find((v) => v.id === vid);
      if (selectedVehicle) {
        // Fetch last log for odometer?
        // OR rely on vehicle.odometros (if we sync it).
        // Let's fetch last fuel log to get last KM.
        const logs = await getAbastecimentosDoVeiculo(vid); // Assuming this helper exists or similar
        // We actually have getTodosAbastecimentosDoUtilizador, but let's just get specific if possible,
        // or filter locally for simplicity since dataset is small.
        const allLogs = await getTodosAbastecimentosDoUtilizador(100);
        const vLogs = allLogs
          .filter((l) => l.veiculoId === vid)
          .sort((a, b) => new Date(b.data) - new Date(a.data));

        const lastLog = vLogs[0];
        const lastKm = lastLog
          ? lastLog.km
          : selectedVehicle.odometroInicial || 0;

        lastOdometerText.textContent = `íšltima leitura: ${lastKm} km`;
        inputOdometer.placeholder = Number(lastKm) + 1;
        inputOdometer.value = ""; // Clear for user input
      }
    };

    // Check URL param for pre-selection
    const urlParams = new URLSearchParams(window.location.search);
    const preVid = urlParams.get("vid");
    if (preVid) {
      vehicleSelect.value = preVid;
      vehicleSelect.onchange(); // Trigger update
    }
  } catch (error) {
    console.error("Error loading vehicles:", error);
    alert("Erro ao carregar veí­culos.");
  }
}

// SAVE
btnSave.onclick = async () => {
  const vid = vehicleSelect.value;
  if (!vid) return alert("Selecione um veí­culo.");

  const km = Number(inputOdometer.value);
  const liters = Number(inputLiters.value);
  const total = Number(inputTotal.value);

  if (!km || !liters || !total) return alert("Preencha todos os campos.");

  // Calculate Price Per Liter because DB expects it?
  // Check your existing firestore.js addAbastecimento signature.
  // Usually: { veiculoId, data, km, litros, precoPorLitro, posto, ... }

  const precoPorLitro = total / liters;

  btnSave.disabled = true;
  btnSave.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Guardando...`;

  try {
    const dataISO = new Date().toISOString();

    await addAbastecimento({
      veiculoId: vid,
      data: dataISO,
      km: km,
      litros: liters,
      precoPorLitro: precoPorLitro,
      posto: "Posto (App)", // Placeholder or add field
      obs: "Via App Nova",
    });

    // Success
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error(error);
    alert("Erro ao guardar.");
    btnSave.disabled = false;
    btnSave.innerHTML = `<span class="material-symbols-outlined">save</span> Registar Abastecimento`;
  }
};
