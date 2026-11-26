// js/modules/tripLive.js
// Mostrador "ao vivo" da viagem: lê a leitura OBD mais recente em tempo real
// (Firestore onSnapshot) e mostra velocidade, RPM, consumo, temperaturas e custo.

(function () {
  const RPM_REDLINE = 6500; // valor por defeito para a barra de RPM (não temos o redline real do carro)
  const STALE_AFTER_MS = 20000; // sem leitura há mais de 20s -> considerar "sem sinal"

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  const veiculoId = getParam("id");

  const el = {
    vehicleName: document.getElementById("trip-live-vehicle"),
    statusText: document.getElementById("trip-live-status-text"),
    back: document.getElementById("trip-live-back"),
    speed: document.getElementById("trip-live-speed"),
    rpmValue: document.getElementById("trip-live-rpm-value"),
    rpmFill: document.getElementById("trip-live-rpm-fill"),
    distancia: document.getElementById("tile-distancia"),
    consumo: document.getElementById("tile-consumo"),
    litros: document.getElementById("tile-litros"),
    custo: document.getElementById("tile-custo"),
    coolant: document.getElementById("tile-coolant"),
    intake: document.getElementById("tile-intake"),
    voltage: document.getElementById("tile-voltage"),
    fuellevel: document.getElementById("tile-fuellevel"),
  };

  el.back.addEventListener("click", (e) => {
    e.preventDefault();
    if (veiculoId) {
      window.location.href = `./veiculo.html?id=${encodeURIComponent(veiculoId)}`;
    } else {
      window.location.href = "./veiculos.html";
    }
  });

  function fmt(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return "--";
    return Number(value).toFixed(decimals);
  }

  let lastTimestamp = 0;
  let precoPorLitro = null;

  function renderReading(parsed) {
    const speed = parsed?.speed ?? null;
    const rpm = parsed?.rpm ?? null;
    const coolant = parsed?.coolant ?? null;
    const intake = parsed?.intake ?? null;
    const voltage = parsed?.voltage ?? null;
    const fuelLevel = parsed?.fuelLevel ?? null;
    const tripDistance = parsed?.tripDistance ?? null;
    const tripL100 = parsed?.tripL100 ?? null;
    const fuelUsedTrip = parsed?.fuelUsedTrip ?? null;

    el.speed.textContent = fmt(speed, 0);

    el.rpmValue.textContent = rpm !== null ? fmt(rpm, 0) : "--";
    const pct = rpm !== null ? Math.min(100, (rpm / RPM_REDLINE) * 100) : 0;
    el.rpmFill.style.width = `${pct}%`;
    el.rpmFill.classList.toggle("redline", pct >= 85);

    el.distancia.innerHTML = `${fmt(tripDistance, 1)} <span class="unit">km</span>`;
    el.consumo.innerHTML = `${fmt(tripL100, 1)} <span class="unit">L/100km</span>`;
    el.litros.innerHTML = `${fmt(fuelUsedTrip, 2)} <span class="unit">L</span>`;

    if (fuelUsedTrip !== null && precoPorLitro) {
      el.custo.innerHTML = `${fmt(fuelUsedTrip * precoPorLitro, 2)} <span class="unit">€</span>`;
    } else {
      el.custo.innerHTML = `-- <span class="unit">€</span>`;
    }

    el.coolant.innerHTML = `${fmt(coolant, 0)} <span class="unit">°C</span>`;
    el.intake.innerHTML = `${fmt(intake, 0)} <span class="unit">°C</span>`;
    el.voltage.innerHTML = `${fmt(voltage, 1)} <span class="unit">V</span>`;
    el.fuellevel.innerHTML = `${fmt(fuelLevel, 0)} <span class="unit">%</span>`;

    document.getElementById("tile-coolant-wrap").classList.toggle(
      "danger",
      coolant !== null && coolant > 105,
    );
    document.getElementById("tile-voltage-wrap").classList.toggle(
      "warn",
      voltage !== null && voltage > 0 && voltage < 11.8,
    );
  }

  function formatAgo(s) {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400);
    return `${d} ${d === 1 ? "dia" : "dias"}`;
  }

  function updateStatusBadge() {
    const secondsAgo = lastTimestamp
      ? Math.round((Date.now() - lastTimestamp) / 1000)
      : null;
    const stale = !lastTimestamp || Date.now() - lastTimestamp > STALE_AFTER_MS;
    document.body.classList.toggle("is-stale", stale);

    if (!lastTimestamp) {
      el.statusText.textContent = "A aguardar dados…";
    } else if (stale) {
      el.statusText.textContent = `Sem sinal há ${formatAgo(secondsAgo)}`;
    } else {
      el.statusText.textContent = "Ao vivo";
    }
  }

  async function loadVehicleName() {
    try {
      const doc = await window.db.collection("veiculos").doc(veiculoId).get();
      const v = doc.data();
      if (v) el.vehicleName.textContent = v.nome || "Veículo";
    } catch (e) {
      console.warn("[TripLive] Erro ao carregar veículo:", e);
    }
  }

  async function loadFuelPrice() {
    try {
      if (typeof window.getAbastecimentosDoVeiculo !== "function") return;
      const records = await window.getAbastecimentosDoVeiculo(veiculoId, 1);
      if (records && records[0] && records[0].precoPorLitro) {
        precoPorLitro = records[0].precoPorLitro;
      }
    } catch (e) {
      console.warn("[TripLive] Erro ao carregar preço do combustível:", e);
    }
  }

  let unsubscribe = null;

  function listenLatestReading() {
    unsubscribe = window.db
      .collection("veiculos")
      .doc(veiculoId)
      .collection("leiturasObd")
      .orderBy("timestamp", "desc")
      .limit(1)
      .onSnapshot(
        (snap) => {
          if (snap.empty) return;
          const reading = snap.docs[0].data();
          lastTimestamp = reading.timestamp || Date.now();
          renderReading(reading.parsed || {});
          updateStatusBadge();
        },
        (err) => {
          console.error("[TripLive] Erro no listener de leituras:", err);
          el.statusText.textContent = "Erro ao ligar aos dados";
        },
      );
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        const lock = await navigator.wakeLock.request("screen");
        document.addEventListener("visibilitychange", async () => {
          if (document.visibilityState === "visible") {
            try {
              await navigator.wakeLock.request("screen");
            } catch (e) {
              /* ignora: nem sempre é possível reobter */
            }
          }
        });
        window.addEventListener("beforeunload", () => lock.release().catch(() => {}));
      }
    } catch (e) {
      console.warn("[TripLive] Wake Lock indisponível:", e);
    }
  }

  function init() {
    if (!veiculoId) {
      el.statusText.textContent = "Veículo não especificado";
      return;
    }
    window.auth.onAuthStateChanged((user) => {
      if (!user) return;
      loadVehicleName();
      loadFuelPrice();
      listenLatestReading();
      requestWakeLock();
    });

    setInterval(updateStatusBadge, 1000);

    window.addEventListener("beforeunload", () => {
      if (unsubscribe) unsubscribe();
    });
  }

  init();
})();
