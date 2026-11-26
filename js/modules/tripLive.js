// js/modules/tripLive.js
// Mostrador "ao vivo" da viagem.
// - Valores instantâneos (velocidade, RPM, temperaturas, bateria) vêm da última
//   leitura OBD (Firestore onSnapshot).
// - Métricas da viagem (distância, consumo, custo, tempo, ralenti, condução) são
//   calculadas aqui com TripMetrics a partir das leituras da sessão atual, porque
//   muitos carros (ex.: Logan dCi) não fornecem distância/consumo de viagem pelo
//   Torque — a distância é integrada a partir da velocidade.

(function () {
  const RPM_REDLINE = 6500; // valor por defeito para a barra de RPM
  const STALE_AFTER_MS = 20000; // sem leitura há mais de 20s -> "sem sinal"
  const TRIP_GAP_MS = 15 * 60 * 1000; // pausa maior = nova viagem (sem sessionId)
  const HISTORY_WINDOW_MS = 6 * 60 * 60 * 1000;

  const veiculoId = new URLSearchParams(window.location.search).get("id");
  const $ = (id) => document.getElementById(id);

  const el = {
    vehicleName: $("trip-live-vehicle"),
    statusText: $("trip-live-status-text"),
    back: $("trip-live-back"),
    speed: $("trip-live-speed"),
    rpmValue: $("trip-live-rpm-value"),
    rpmFill: $("trip-live-rpm-fill"),
    footnote: $("trip-live-footnote"),
  };

  el.back.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = veiculoId
      ? `./veiculo.html?id=${encodeURIComponent(veiculoId)}`
      : "./veiculos.html";
  });

  function fmt(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return "--";
    return Number(value).toLocaleString("pt-PT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function setTile(id, value, unit) {
    const node = $(id);
    if (node) node.innerHTML = `${value} <span class="unit">${unit}</span>`;
  }

  function fmtDuration(min) {
    if (min === null || min === undefined || isNaN(min)) return { v: "--", u: "min" };
    if (min < 60) return { v: fmt(min, 0), u: "min" };
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return { v: `${h}h${String(m).padStart(2, "0")}`, u: "" };
  }

  // ---------- Estado ----------
  let lastTimestamp = 0;
  let precoPorLitro = null;
  let tripMeta = { fuelType: null, refL100: null };
  let tripState = null;
  let lastSessionId = null;
  let historyLoaded = false;
  const pending = []; // leituras que chegam enquanto o histórico carrega

  // ---------- Render ----------
  function renderInstant(parsed) {
    const speed = parsed?.speed ?? null;
    const rpm = parsed?.rpm ?? null;
    const coolant = parsed?.coolant ?? null;
    const intake = parsed?.intake ?? null;
    const voltage = parsed?.voltage ?? null;
    const fuelLevel = parsed?.fuelLevel ?? null;

    el.speed.textContent = fmt(speed, 0);
    el.rpmValue.textContent = fmt(rpm, 0);
    const pct = rpm !== null ? Math.min(100, (rpm / RPM_REDLINE) * 100) : 0;
    el.rpmFill.style.width = `${pct}%`;
    el.rpmFill.classList.toggle("redline", pct >= 85);

    setTile("tile-coolant", fmt(coolant, 0), "°C");
    setTile("tile-intake", fmt(intake, 0), "°C");
    setTile("tile-voltage", fmt(voltage, 1), "V");
    setTile("tile-fuellevel", fmt(fuelLevel, 0), "%");

    $("tile-coolant-wrap").classList.toggle("danger", coolant !== null && coolant > 105);
    $("tile-coolant-wrap").classList.toggle(
      "cold",
      coolant !== null && coolant < 70,
    );
    $("tile-voltage-wrap").classList.toggle(
      "warn",
      voltage !== null && voltage > 0 && voltage < 11.8,
    );
  }

  function renderTrip() {
    if (!tripState) return;
    const s = window.TripMetrics.summarize(tripState, {
      ...tripMeta,
      pricePerLiter: precoPorLitro,
    });
    const est = s.fuelSource === "estimativa";

    setTile("tile-distancia", fmt(s.distanceKm, 1), "km");
    setTile("tile-consumo", (est ? "~" : "") + fmt(s.l100, 1), "L/100km");
    setTile("tile-litros", (est ? "~" : "") + fmt(s.liters, 2), "L");
    setTile("tile-custo", (est ? "~" : "") + fmt(s.cost, 2), "€");

    const d = fmtDuration(s.durationMin);
    setTile("tile-tempo", d.v, d.u);
    setTile("tile-velmedia", fmt(s.avgMovingSpeed, 0), "km/h");
    setTile("tile-ralenti", fmt(s.idleMin, 0), `min${s.idlePct !== null ? ` · ${s.idlePct}%` : ""}`);
    setTile("tile-eventos", `${s.harshAccel} / ${s.harshBrake}`, "");
    const eventsWrap = $("tile-eventos-wrap");
    if (eventsWrap) eventsWrap.classList.toggle("warn", s.harshAccel + s.harshBrake >= 3);

    // Nota de rodapé: de onde vem o consumo
    const notes = [];
    if (s.distanceSource === "velocidade")
      notes.push("Distância calculada a partir da velocidade OBD.");
    if (s.fuelSource === "torque") notes.push("Consumo medido pelo Torque.");
    else if (s.fuelSource === "maf") notes.push("Consumo calculado pelo sensor MAF.");
    else if (est)
      notes.push(
        `Consumo estimado com a tua média real (${fmt(tripMeta.refL100, 1)} L/100km) — o carro não reporta fluxo de combustível.`,
      );
    if (s.cost !== null) notes.push("Custo com o preço do último abastecimento.");
    el.footnote.textContent = notes.join(" ");
  }

  function formatAgo(s) {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400);
    return `${d} ${d === 1 ? "dia" : "dias"}`;
  }

  function updateStatusBadge() {
    const secondsAgo = lastTimestamp ? Math.round((Date.now() - lastTimestamp) / 1000) : null;
    const stale = !lastTimestamp || Date.now() - lastTimestamp > STALE_AFTER_MS;
    document.body.classList.toggle("is-stale", stale);

    if (!lastTimestamp) el.statusText.textContent = "A aguardar dados…";
    else if (stale) el.statusText.textContent = `Sem sinal há ${formatAgo(secondsAgo)}`;
    else el.statusText.textContent = "Ao vivo";
  }

  // ---------- Viagem ----------
  function isSameTrip(reading, prevTs) {
    if (reading.sessionId && lastSessionId) return reading.sessionId === lastSessionId;
    return reading.timestamp - prevTs <= TRIP_GAP_MS;
  }

  function applyReading(reading) {
    if (!tripState || !isSameTrip(reading, tripState.lastTs || 0)) {
      tripState = window.TripMetrics.createState(tripMeta);
    }
    lastSessionId = reading.sessionId || lastSessionId;
    window.TripMetrics.step(tripState, reading);
  }

  // Carrega as leituras da viagem em curso (última sessão / último bloco contínuo).
  async function loadTripHistory(latest) {
    try {
      const snap = await window.db
        .collection("veiculos")
        .doc(veiculoId)
        .collection("leiturasObd")
        .where("timestamp", ">=", latest.timestamp - HISTORY_WINDOW_MS)
        .orderBy("timestamp", "asc")
        .limit(6000)
        .get();
      const all = snap.docs.map((d) => d.data());

      // Recuar desde a leitura mais recente enquanto for a mesma viagem
      let startIdx = all.length - 1;
      for (let i = all.length - 1; i > 0; i--) {
        const cur = all[i];
        const prev = all[i - 1];
        const sameSession =
          cur.sessionId && prev.sessionId
            ? cur.sessionId === prev.sessionId
            : cur.timestamp - prev.timestamp <= TRIP_GAP_MS;
        if (!sameSession) break;
        startIdx = i - 1;
      }
      const segment = startIdx >= 0 ? all.slice(startIdx) : [];
      tripState = window.TripMetrics.fromReadings(segment, tripMeta);
      lastSessionId = latest.sessionId || null;
    } catch (e) {
      console.warn("[TripLive] Erro a carregar histórico da viagem:", e);
      tripState = window.TripMetrics.createState(tripMeta);
    }
    historyLoaded = true;
    pending.splice(0).forEach(applyReading);
    renderTrip();
  }

  // ---------- Dados de referência ----------
  async function loadVehicle() {
    try {
      const doc = await window.db.collection("veiculos").doc(veiculoId).get();
      const v = doc.data();
      if (!v) return;
      el.vehicleName.textContent = v.nome || "Veículo";
      tripMeta.fuelType = v.tipoCombustivel || v.combustivelPadrao || null;
      if (!tripMeta.refL100) tripMeta.refL100 = v.consumoMedio || v.consumoMedioObd || null;
    } catch (e) {
      console.warn("[TripLive] Erro ao carregar veículo:", e);
    }
  }

  async function loadFuelData() {
    try {
      if (typeof window.getAbastecimentosDoVeiculo !== "function") return;
      const records = await window.getAbastecimentosDoVeiculo(veiculoId, 100);
      if (records?.[0]?.precoPorLitro) precoPorLitro = Number(records[0].precoPorLitro);
      // Média real (cheio-a-cheio) é a melhor referência para estimar o consumo
      const avg = window.Analytics?.calculateConsumption?.(records)?.averageL100;
      if (avg) tripMeta.refL100 = avg;
    } catch (e) {
      console.warn("[TripLive] Erro ao carregar abastecimentos:", e);
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
          renderInstant(reading.parsed || {});
          updateStatusBadge();

          if (!historyLoaded) {
            if (!pending.length) loadTripHistory(reading);
            pending.push(reading);
          } else {
            applyReading(reading);
            renderTrip();
          }
        },
        (err) => {
          console.error("[TripLive] Erro no listener de leituras:", err);
          el.statusText.textContent = "Erro ao ligar aos dados";
        },
      );
  }

  async function requestWakeLock() {
    try {
      if (!("wakeLock" in navigator)) return;
      const lock = await navigator.wakeLock.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try {
            await navigator.wakeLock.request("screen");
          } catch (e) {
            /* nem sempre é possível reobter */
          }
        }
      });
      window.addEventListener("beforeunload", () => lock.release().catch(() => {}));
    } catch (e) {
      console.warn("[TripLive] Wake Lock indisponível:", e);
    }
  }

  function init() {
    if (!veiculoId) {
      el.statusText.textContent = "Veículo não especificado";
      return;
    }
    window.auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      // Referências primeiro (consumo/preço) para a estimativa ficar certa à 1.ª
      await Promise.all([loadVehicle(), loadFuelData()]);
      listenLatestReading();
      requestWakeLock();
    });

    setInterval(updateStatusBadge, 1000);
    window.addEventListener("beforeunload", () => unsubscribe && unsubscribe());
  }

  init();
})();
