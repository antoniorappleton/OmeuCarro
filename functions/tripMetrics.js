// tripMetrics.js — cálculo de métricas de viagem a partir de leituras OBD.
//
// ATENÇÃO: este ficheiro existe em DOIS sítios com conteúdo idêntico:
//   - js/utils/tripMetrics.js   (browser: window.TripMetrics)
//   - functions/tripMetrics.js  (Cloud Functions: require("./tripMetrics"))
// Se alterares um, copia para o outro.
//
// Porquê calcular nós: muitos carros (ex.: Dacia Logan dCi) não têm sensor MAF
// nem fluxo de combustível, e o Torque envia "Distância da viagem" e
// "L/100 da viagem" a 0. A distância é então obtida integrando a velocidade OBD
// no tempo, e o consumo é estimado (ver summarize()).
//
// Uso:
//   let s = TripMetrics.createState({ fuelType, refL100 });
//   for (const r of readings) s = TripMetrics.step(s, r);   // r = { timestamp, parsed }
//   const sum = TripMetrics.summarize(s, { refL100, fuelType, pricePerLiter });

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TripMetrics = api;
})(typeof self !== "undefined" ? self : this, function () {
  const VERSION = 2;

  const GAP_MAX_S = 120; // intervalos maiores = falha de ligação; não integra
  const MOVING_KMH = 3; // abaixo disto o carro está parado
  const HIGH_RPM = 3000;
  const OVERSPEED_KMH = 120;
  const WARM_COOLANT_C = 70;
  // Eventos bruscos (km/h por segundo). 11 km/h/s ≈ 0,31 g; 13 km/h/s ≈ 0,37 g
  const HARSH_ACCEL = 11;
  const HARSH_BRAKE = -13;
  const HARSH_MAX_DT_S = 4; // só avalia com amostras próximas
  const HARSH_COOLDOWN_MS = 3000; // não conta o mesmo evento várias vezes

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  }

  function isDiesel(fuelType) {
    const f = String(fuelType || "").toLowerCase();
    return f.includes("diesel") || f.includes("gasóleo") || f.includes("gasoleo");
  }

  function createState(meta) {
    return {
      v: VERSION,
      meta: {
        fuelType: (meta && meta.fuelType) || null,
        refL100: (meta && num(meta.refL100)) || null,
      },
      n: 0,
      firstTs: null,
      lastTs: null,
      lastSpeed: null,
      lastHarshTs: 0,

      distCalcKm: 0,
      torqueDistKm: 0,
      lastTorqueDist: null,
      torqueFuelL: 0,
      lastTorqueFuel: null,
      lastTripL100: null,
      mafGrams: 0,

      engineSec: 0, // segundos com motor ligado (dados válidos)
      movingSec: 0,
      idleSec: 0, // motor ligado, parado
      highRpmSec: 0,
      overspeedSec: 0,
      warmupSec: null, // segundos até o motor atingir 70 °C
      startedCold: null,

      maxSpeed: 0,
      maxRpm: 0,
      rpmSum: 0, // ponderado pelo tempo (motor ligado)
      maxCoolant: null,
      voltSum: 0,
      voltSec: 0,
      minVolt: null,
      loadSum: 0,
      loadSec: 0,

      harshAccel: 0,
      harshBrake: 0,

      fuelLevelStart: null,
      fuelLevelEnd: null,
    };
  }

  // Delta de um contador acumulado do Torque (que pode ser reiniciado a meio).
  function counterDelta(last, val, maxStep) {
    if (val === null) return { last, add: 0 };
    if (last === null) return { last: val, add: 0 }; // primeiro valor = base
    if (val >= last) {
      const d = val - last;
      return { last: val, add: d > 0 && d < maxStep ? d : 0 };
    }
    return { last: val, add: val < maxStep ? val : 0 }; // reset do contador
  }

  // Processa UMA leitura. Devolve o próprio estado (mutado) por conveniência.
  function step(s, reading) {
    if (!reading) return s;
    const p = reading.parsed || reading;
    const ts = num(reading.timestamp);
    if (ts === null) return s;

    const speed = Math.max(0, num(p.speed) || 0);
    const rpm = num(p.rpm);
    const coolant = num(p.coolant);
    const volt = num(p.voltage);
    const load = num(p.engineLoad);
    const maf = num(p.maf);
    const fuelLevel = num(p.fuelLevel);

    s.n++;
    if (s.firstTs === null || ts < s.firstTs) s.firstTs = ts;

    // Máximos/mínimos (valem mesmo para leituras fora de ordem)
    if (speed > s.maxSpeed) s.maxSpeed = speed;
    if (rpm !== null && rpm > s.maxRpm) s.maxRpm = rpm;
    if (coolant !== null && coolant > -40 && coolant < 150) {
      if (s.maxCoolant === null || coolant > s.maxCoolant) s.maxCoolant = coolant;
      if (s.startedCold === null) s.startedCold = coolant < WARM_COOLANT_C;
    }
    if (fuelLevel !== null && fuelLevel > 0) {
      if (s.fuelLevelStart === null) s.fuelLevelStart = fuelLevel;
      s.fuelLevelEnd = fuelLevel;
    }

    // Contadores do próprio Torque (quando o carro os suporta)
    const td = counterDelta(s.lastTorqueDist, num(p.tripDistance), 5);
    s.lastTorqueDist = td.last;
    s.torqueDistKm += td.add;
    const tf = counterDelta(s.lastTorqueFuel, num(p.fuelUsedTrip ?? p.fuelUsed), 2);
    s.lastTorqueFuel = tf.last;
    s.torqueFuelL += tf.add;
    const tl = num(p.tripL100);
    if (tl !== null && tl > 0 && tl < 40) s.lastTripL100 = tl;

    // Integração no tempo (só para leituras em ordem e sem grandes falhas)
    if (s.lastTs !== null && ts > s.lastTs) {
      const dt = (ts - s.lastTs) / 1000;
      if (dt <= GAP_MAX_S) {
        const prevSpeed = s.lastSpeed ?? speed;
        s.distCalcKm += (((prevSpeed + speed) / 2) * dt) / 3600;

        const engineOn = (rpm !== null && rpm > 300) || speed > 0;
        if (engineOn) {
          s.engineSec += dt;
          if (speed >= MOVING_KMH) s.movingSec += dt;
          else s.idleSec += dt;
          if (rpm !== null) s.rpmSum += rpm * dt;
          if (rpm !== null && rpm > HIGH_RPM) s.highRpmSec += dt;
          if (speed > OVERSPEED_KMH) s.overspeedSec += dt;
          if (volt !== null && volt > 5 && volt < 20) {
            s.voltSum += volt * dt;
            s.voltSec += dt;
            if (s.minVolt === null || volt < s.minVolt) s.minVolt = volt;
          }
          if (load !== null && load >= 0 && load <= 100) {
            s.loadSum += load * dt;
            s.loadSec += dt;
          }
          if (maf !== null && maf > 0 && maf < 500) s.mafGrams += maf * dt;
        }

        if (
          s.warmupSec === null &&
          s.startedCold &&
          coolant !== null &&
          coolant >= WARM_COOLANT_C
        ) {
          s.warmupSec = (ts - s.firstTs) / 1000;
        }

        if (dt >= 0.5 && dt <= HARSH_MAX_DT_S && s.lastSpeed !== null) {
          const accel = (speed - s.lastSpeed) / dt;
          if (ts - s.lastHarshTs > HARSH_COOLDOWN_MS) {
            if (accel >= HARSH_ACCEL) {
              s.harshAccel++;
              s.lastHarshTs = ts;
            } else if (accel <= HARSH_BRAKE) {
              s.harshBrake++;
              s.lastHarshTs = ts;
            }
          }
        }
      }
    }

    if (s.lastTs === null || ts >= s.lastTs) {
      s.lastTs = ts;
      s.lastSpeed = speed;
    }
    return s;
  }

  function fromReadings(readings, meta) {
    const sorted = (readings || [])
      .filter((r) => r && num(r.timestamp) !== null)
      .sort((a, b) => num(a.timestamp) - num(b.timestamp));
    const s = createState(meta);
    for (const r of sorted) step(s, r);
    return s;
  }

  function round(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  // Score 0–100: começa em 100 e desconta por hábitos que gastam combustível
  // ou desgastam o carro. Só é calculado com pelo menos 1 min em movimento.
  function computeScore(s, distanceKm) {
    if (s.movingSec < 60) return { score: null, penalties: {} };
    const per100km = (n) => (distanceKm > 1 ? (n / distanceKm) * 100 : n * 10);
    const pen = {
      aceleracoes: Math.min(25, per100km(s.harshAccel) * 1.5),
      travagens: Math.min(25, per100km(s.harshBrake) * 2),
      rotacao: Math.min(20, (s.highRpmSec / s.movingSec) * 100 * 1.5),
      velocidade: Math.min(20, (s.overspeedSec / s.movingSec) * 100 * 1.0),
      ralenti: Math.min(
        15,
        Math.max(0, (s.idleSec / Math.max(1, s.engineSec)) * 100 - 15) * 0.5,
      ),
    };
    const total = Object.values(pen).reduce((a, b) => a + b, 0);
    return { score: Math.round(Math.max(0, Math.min(100, 100 - total))), penalties: pen };
  }

  // opts: { refL100, fuelType, pricePerLiter } — sobrepõem s.meta quando dados.
  function summarize(s, opts) {
    opts = opts || {};
    const fuelType = opts.fuelType || (s.meta && s.meta.fuelType) || null;
    const refL100 = num(opts.refL100) || (s.meta && s.meta.refL100) || null;
    const price = num(opts.pricePerLiter);

    const useTorqueDist = s.torqueDistKm > 0.1;
    const distanceKm = useTorqueDist ? s.torqueDistKm : s.distCalcKm;
    const durationMin =
      s.firstTs !== null && s.lastTs !== null ? (s.lastTs - s.firstTs) / 60000 : 0;

    // Combustível: dados reais do Torque > MAF (só gasolina) > estimativa
    let liters = null;
    let fuelSource = null;
    if (s.torqueFuelL > 0.02) {
      liters = s.torqueFuelL;
      fuelSource = "torque";
    } else if (s.lastTripL100 && distanceKm > 0.5) {
      liters = (s.lastTripL100 * distanceKm) / 100;
      fuelSource = "torque";
    } else if (s.mafGrams > 0 && !isDiesel(fuelType)) {
      // estequiométrico gasolina 14,7:1; densidade ~745 g/L
      liters = s.mafGrams / 14.7 / 745;
      fuelSource = "maf";
    } else if (refL100 && distanceKm > 0) {
      liters = (refL100 * distanceKm) / 100;
      fuelSource = "estimativa";
    }
    const l100 = liters !== null && distanceKm > 0.5 ? (liters / distanceKm) * 100 : null;
    const cost = liters !== null && price ? liters * price : null;
    const co2Kg = liters !== null ? liters * (isDiesel(fuelType) ? 2.64 : 2.31) : null;

    const { score, penalties } = computeScore(s, distanceKm);

    return {
      distanceKm: round(distanceKm, 2),
      distanceSource: useTorqueDist ? "torque" : "velocidade",
      durationMin: round(durationMin, 1),
      avgSpeed: durationMin > 0 ? round(distanceKm / (durationMin / 60), 1) : null,
      avgMovingSpeed: s.movingSec > 30 ? round(s.distCalcKm / (s.movingSec / 3600), 1) : null,
      maxSpeed: round(s.maxSpeed, 0),
      movingMin: round(s.movingSec / 60, 1),
      idleMin: round(s.idleSec / 60, 1),
      idlePct: s.engineSec > 0 ? round((s.idleSec / s.engineSec) * 100, 0) : null,
      avgRpm: s.engineSec > 0 && s.rpmSum > 0 ? round(s.rpmSum / s.engineSec, 0) : null,
      maxRpm: round(s.maxRpm, 0),
      highRpmPct: s.movingSec > 0 ? round((s.highRpmSec / s.movingSec) * 100, 0) : null,
      maxCoolant: round(s.maxCoolant, 0),
      warmupMin: s.warmupSec !== null ? round(s.warmupSec / 60, 1) : null,
      reachedWarm: s.startedCold === null ? null : !s.startedCold || s.warmupSec !== null,
      avgVoltage: s.voltSec > 0 ? round(s.voltSum / s.voltSec, 1) : null,
      minVoltage: round(s.minVolt, 1),
      avgLoad: s.loadSec > 0 ? round(s.loadSum / s.loadSec, 0) : null,
      harshAccel: s.harshAccel,
      harshBrake: s.harshBrake,
      liters: round(liters, 2),
      l100: round(l100, 1),
      fuelSource,
      cost: round(cost, 2),
      co2Kg: round(co2Kg, 1),
      fuelLevelStart: round(s.fuelLevelStart, 0),
      fuelLevelEnd: round(s.fuelLevelEnd, 0),
      score,
      penalties,
      readings: s.n,
    };
  }

  // Campos que vão para o documento da viagem (compatíveis com o formato antigo).
  function toTripFields(sum) {
    return {
      distancia: sum.distanceKm || 0,
      duracao: Math.round(sum.durationMin || 0),
      velocidadeMedia: sum.avgSpeed || 0,
      consumoMedio: sum.l100 || 0,
      consumoFonte: sum.fuelSource || null,
      litrosEstimados: sum.liters,
      custoEstimado: sum.cost || 0,
      score: sum.score,
      calcVersion: VERSION,
      metricas: {
        rpmMedio: sum.avgRpm,
        rpmMax: sum.maxRpm,
        velocidadeMax: sum.maxSpeed,
        velocidadeMediaMovimento: sum.avgMovingSpeed,
        temperaturaMax: sum.maxCoolant,
        voltagemMedia: sum.avgVoltage,
        voltagemMin: sum.minVoltage,
        cargaMedia: sum.avgLoad,
        tempoMovimentoMin: sum.movingMin,
        tempoRalentiMin: sum.idleMin,
        ralentiPct: sum.idlePct,
        rotacaoAltaPct: sum.highRpmPct,
        aceleracoesBruscas: sum.harshAccel,
        travagensBruscas: sum.harshBrake,
        aquecimentoMin: sum.warmupMin,
        co2Kg: sum.co2Kg,
        combustivelInicio: sum.fuelLevelStart,
        combustivelFim: sum.fuelLevelEnd,
        count: sum.readings,
      },
    };
  }

  return {
    VERSION,
    createState,
    step,
    fromReadings,
    summarize,
    toTripFields,
    isDiesel,
  };
});
