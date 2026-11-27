(function (root, factory) {
  const metrics =
    typeof module === "object" && module.exports
      ? require("./tripMetrics")
      : root.TripMetrics;
  const api = factory(metrics);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TripDiagnostics = api;
})(typeof self !== "undefined" ? self : this, function (TripMetrics) {
const ALERT_RULES = [
  {
    id: "OVERHEAT",
    appliesTo: "todos",
    requires: ["coolant"],
    gate: () => true,
    evaluate: (p) => p.coolant >= 108,
    exit: (p) => p.coolant < 100,
    minDurationS: 20,
    hysteresis: { enter: 108, exit: 100 },
    severity: "critical",
    cooldownMin: 30,
    realtime: true,
    title: "Alerta: temperatura do motor",
    message: (value, vehicleName) =>
      `${vehicleName}: temperatura do líquido de refrigeração a ${Math.round(value)} °C. Para em segurança e verifica o nível do líquido quando o motor arrefecer.`,
  },
  {
    id: "NO_CHARGE",
    appliesTo: "todos",
    requires: ["voltage", "rpm"],
    gate: (_p, context) => context.engineRunningForS > 60,
    evaluate: (p) => p.voltage < 12.6,
    exit: (p) => p.voltage >= 13.2 || p.rpm <= 500,
    minDurationS: 60,
    hysteresis: { enter: 12.6, exit: 13.2 },
    severity: "critical",
    cooldownMin: 30,
    realtime: true,
    title: "Alerta: sistema de carga",
    message: (_value, vehicleName) =>
      `${vehicleName}: tensão baixa com o motor em funcionamento. Possível falha do alternador ou da correia; recomenda-se verificar.`,
  },
  {
    id: "OVERVOLTAGE",
    appliesTo: "todos",
    requires: ["voltage"],
    gate: () => true,
    evaluate: (p) => p.voltage > 15,
    exit: (p) => p.voltage < 14.8,
    minDurationS: 10,
    hysteresis: { enter: 15, exit: 14.8 },
    severity: "critical",
    cooldownMin: 30,
    realtime: true,
    title: "Alerta: tensão elevada",
    message: (value, vehicleName) =>
      `${vehicleName}: tensão a ${value.toFixed(1)} V. Possível falha do regulador; recomenda-se verificar.`,
  },
];

function isPresent(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function evaluateRealtime(parsed, previousState, timestamp, vehicleName) {
  const now = Number(timestamp);
  if (!Number.isFinite(now)) {
    throw new TypeError("timestamp tem de ser um número finito");
  }

  const state = { ...(previousState || {}) };
  const notifications = [];
  const priorSampleAt = Number(state.lastSampleAt) || null;
  if (priorSampleAt !== null && now <= priorSampleAt) {
    return { state, notifications };
  }
  const isContinuous =
    priorSampleAt !== null && now > priorSampleAt && now - priorSampleAt <= 10_000;
  const rpm = isPresent(parsed.rpm) ? Number(parsed.rpm) : null;

  if (rpm !== null && rpm > 500) {
    if (!isContinuous || !state.engineRunningSince) {
      state.engineRunningSince = now;
    }
  } else {
    state.engineRunningSince = null;
  }

  const engineRunningForS = state.engineRunningSince
    ? Math.max(0, (now - state.engineRunningSince) / 1000)
    : 0;

  for (const rule of ALERT_RULES) {
    const ruleState = { ...(state[rule.id] || {}) };
    const hasRequiredData = rule.requires.every((field) =>
      isPresent(parsed[field]),
    );
    const ruleContinuous =
      isContinuous &&
      ruleState.lastSampleAt !== undefined &&
      now - Number(ruleState.lastSampleAt) <= 10_000;

    if (!hasRequiredData || !rule.gate(parsed, { engineRunningForS })) {
      ruleState.conditionSince = null;
      ruleState.active = false;
    } else {
      const entered = rule.evaluate(parsed);
      const exited = rule.exit(parsed);

      if (ruleState.active) {
        if (exited) {
          ruleState.active = false;
          ruleState.conditionSince = null;
        }
      } else if (entered) {
        if (!ruleContinuous || ruleState.conditionSince === null) {
          ruleState.conditionSince = now;
        }
        if ((now - ruleState.conditionSince) / 1000 >= rule.minDurationS) {
          ruleState.active = true;
        }
      } else if (exited || !ruleContinuous) {
        ruleState.conditionSince = null;
      }

      const cooldownMs = rule.cooldownMin * 60_000;
      const cooldownElapsed =
        !ruleState.lastSentAt || now - ruleState.lastSentAt >= cooldownMs;
      if (ruleState.active && cooldownElapsed) {
        notifications.push({
          ruleId: rule.id,
          title: rule.title,
          body: rule.message(Number(parsed[rule.requires[0]]), vehicleName),
        });
        ruleState.lastSentAt = now;
      }
    }

    ruleState.lastSampleAt = now;
    state[rule.id] = ruleState;
  }

  state.lastSampleAt = now;
  return { state, notifications };
}

function median(values) {
  const sorted = values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianAbsoluteDeviation(values, center) {
  return median(values.map((value) => Math.abs(value - center)));
}

function numeric(reading, field) {
  const raw = reading?.parsed?.[field];
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function medianOf(readings, selector) {
  return median(
    readings.map((reading) => selector(reading)).filter((value) => value !== null),
  );
}

function longestDuration(readings, predicate) {
  let start = null;
  let previous = null;
  let longest = 0;
  for (const reading of readings) {
    const ts = Number(reading.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (!predicate(reading)) {
      start = null;
      previous = null;
      continue;
    }
    if (previous !== null && (ts <= previous || ts - previous > 10_000)) {
      start = ts;
    }
    if (start === null) start = ts;
    previous = ts;
    longest = Math.max(longest, (ts - start) / 1000);
  }
  return longest;
}

function robustDeviation(value, baseline, relativeThreshold, direction) {
  if (!baseline || Number(baseline.n) < 5 || !Number.isFinite(value)) {
    return { learning: true, isSignificant: false };
  }
  const center = finiteNumber(baseline.mediana);
  const mad = finiteNumber(baseline.mad);
  if (center === null || mad === null) {
    return { learning: false, isSignificant: false };
  }
  const delta = value - center;
  const denominator = 1.4826 * mad;
  const z =
    denominator === 0
      ? delta === 0
        ? 0
        : Math.sign(delta) * Infinity
      : delta / denominator;
  const relative = Math.abs(center) > 0 ? Math.abs(delta / center) : Math.abs(delta);
  const directionMatches =
    direction === "below" ? delta < 0 : direction === "above" ? delta > 0 : true;
  return {
    learning: false,
    isSignificant: Math.abs(z) > 3 && relative > relativeThreshold && directionMatches,
    z,
    center,
  };
}

function ambientBand(value) {
  return Number.isFinite(value) ? Math.round(value / 5) * 5 : null;
}

function isGasoline(fuelType) {
  const type = String(fuelType || "").toLowerCase();
  return type.includes("gasolina") || type.includes("gasoline") || type.includes("petrol");
}

function makeFinding(ruleId, severity, value, reference, causes, action, durationS, confidence) {
  return {
    ruleId,
    severidade: severity,
    valorObservado: value,
    referencia: reference,
    duracaoS: durationS || 0,
    confianca: confidence,
    possiveisCausas: causes,
    acaoRecomendada: action,
  };
}

const HEALTH_RULES = [
  {
    id: "THERMOSTAT_OPEN",
    appliesTo: "todos",
    requires: ["coolant"],
    gate: (context) => context.thermostatFinding !== null,
    evaluate: (context) => context.thermostatFinding,
    minDurationS: 0,
    hysteresis: { enter: 80, exit: 85 },
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "WARMUP_SLOW",
    appliesTo: "todos",
    requires: ["coolant"],
    gate: (context) => context.summary.warmupMin !== null,
    evaluate: (context) => context.warmupFinding,
    minDurationS: 0,
    hysteresis: null,
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "IAT_HIGH",
    appliesTo: "todos",
    requires: ["intake", "ambientTemp", "speed"],
    gate: (context) => context.iatDurationS >= 60,
    evaluate: (context) => context.iatFinding,
    minDurationS: 60,
    hysteresis: { enter: 35, exit: 30 },
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "UNDERBOOST",
    appliesTo: "diesel",
    requires: ["map", "baro", "rpm", "engineLoad"],
    gate: (context) => context.underboostMedian !== null,
    evaluate: (context) => context.underboostFinding,
    minDurationS: 0,
    hysteresis: null,
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "MAF_DRIFT",
    appliesTo: "todos",
    requires: ["maf", "rpm", "engineLoad"],
    gate: (context) => context.mafCruise !== null,
    evaluate: (context) => context.mafFinding,
    minDurationS: 0,
    hysteresis: null,
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "HIGH_LOAD_CRUISE",
    appliesTo: "todos",
    requires: ["speed", "engineLoad"],
    gate: (context) => context.cruiseDurationS >= 60,
    evaluate: (context) => context.loadCruiseFinding,
    minDurationS: 60,
    hysteresis: null,
    severity: "informativo",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "DPF_PRESSURE",
    appliesTo: "diesel",
    requires: ["dpfDiffPressure"],
    gate: (context) => context.dpfFinding !== null,
    evaluate: (context) => context.dpfFinding,
    minDurationS: 0,
    hysteresis: null,
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "BATTERY_REST",
    appliesTo: "todos",
    requires: ["voltage", "rpm"],
    gate: (context) => context.restVoltage !== null,
    evaluate: (context) => context.restFinding,
    minDurationS: 0,
    hysteresis: null,
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "CRANK_DIP",
    appliesTo: "todos",
    requires: ["voltage", "rpm"],
    gate: (context) => context.crankVoltage !== null,
    evaluate: (context) => context.crankFinding,
    minDurationS: 0,
    hysteresis: null,
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
  {
    id: "FUEL_TRIM",
    appliesTo: "gasolina",
    requires: ["stft", "ltft", "coolant"],
    gate: (context) => context.fuelTrimMedian !== null,
    evaluate: (context) => context.fuelTrimFinding,
    minDurationS: 30,
    hysteresis: { enter: 10, exit: 8 },
    severity: "atencao",
    cooldownMin: 0,
    realtime: false,
  },
];

function analyzeTrip(readings, options = {}) {
  const sorted = (readings || [])
    .filter((reading) => Number.isFinite(Number(reading?.timestamp)))
    .slice()
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const fuelType = options.fuelType || null;
  const state = TripMetrics.fromReadings(sorted, { fuelType });
  const summary = TripMetrics.summarize(state);
  const profile = summary.obdProfile || {};
  const quality = summary.qualidadeDados;
  const baselines = options.baselines || {};
  const diesel = TripMetrics.isDiesel(fuelType);
  const gasoline = isGasoline(fuelType);
  const findings = [];
  const learning = [];
  const sampleCount = sorted.length;
  const confidence =
    quality.cobertura >= 0.9 &&
    quality.intervaloMedianoS <= 2 &&
    sampleCount >= 50
      ? "alta"
      : quality.cobertura >= 0.75 &&
          quality.intervaloMedianoS <= 3 &&
          sampleCount >= 20
        ? "média"
        : "baixa";
  const values = (field, predicate = () => true) =>
    sorted
      .filter(predicate)
      .map((reading) => numeric(reading, field))
      .filter((value) => value !== null);
  const ambient = medianOf(sorted, (r) => numeric(r, "ambientTemp"));
  const hotEngineMinutes = longestDuration(
    sorted,
    (r) => numeric(r, "coolant") !== null && numeric(r, "coolant") >= 80,
  ) / 60;

  if (quality.estado !== "suficiente") {
    return {
      estado: "dados_insuficientes",
      qualidadeDados: quality,
      achados: [],
      aprendizagem: [],
      metrics: { motorQuenteMin: hotEngineMinutes },
      summary,
    };
  }

  const warmupMetric = summary.warmupMin;
  const warmupBaseline =
    ambient === null
      ? null
      : Object.entries(baselines)
          .filter(
            ([key, baseline]) =>
              key.startsWith("warmupMin_ambient_") &&
              Number.isFinite(Number(baseline.ambienteC)) &&
              Math.abs(Number(baseline.ambienteC) - ambient) <= 5,
          )
          .sort(
            (a, b) =>
              Math.abs(Number(a[1].ambienteC) - ambient) -
              Math.abs(Number(b[1].ambienteC) - ambient),
          )[0]?.[1] ||
        baselines[`warmupMin_ambient_${ambientBand(ambient)}`];
  const warmupDeviation = robustDeviation(warmupMetric, warmupBaseline, 0.5, "above");
  const warmupFinding =
    warmupMetric !== null && warmupDeviation.isSignificant
      ? makeFinding(
          "WARMUP_SLOW",
          "atencao",
          warmupMetric,
          warmupDeviation.center,
          ["Termóstato", "condução lenta ou com muito ralenti"],
          "Compara com outras viagens em condições ambientais semelhantes.",
          0,
          confidence,
        )
      : null;
  if (warmupMetric !== null && warmupDeviation.learning) {
    learning.push({ ruleId: "WARMUP_SLOW", metric: "warmupMin", n: warmupBaseline?.n || 0 });
  }

  const thermostatLongTrip =
    summary.durationMin >= 15 &&
    summary.movingMin >= 10 &&
    (ambient === null || ambient > 5) &&
    summary.maxCoolant !== null &&
    summary.maxCoolant < 80;
  let warmPeak = null;
  let coolantDrop = null;
  let previousMovingTs = null;
  for (const reading of sorted) {
    const coolant = numeric(reading, "coolant");
    const speed = numeric(reading, "speed");
    const ts = Number(reading.timestamp);
    if (coolant === null || speed === null || speed < 3) {
      warmPeak = null;
      previousMovingTs = null;
      continue;
    }
    if (previousMovingTs !== null && ts - previousMovingTs > 10_000) {
      warmPeak = null;
    }
    if (coolant >= 85) warmPeak = Math.max(warmPeak || coolant, coolant);
    if (warmPeak !== null && warmPeak - coolant >= 8) coolantDrop = warmPeak - coolant;
    previousMovingTs = ts;
  }
  const thermostatFinding = thermostatLongTrip || coolantDrop !== null
    ? makeFinding(
        "THERMOSTAT_OPEN",
        "atencao",
        thermostatLongTrip ? summary.maxCoolant : coolantDrop,
        thermostatLongTrip ? "máx. < 80 °C" : "queda ≥ 8 °C após atingir 85 °C",
        ["Termóstato preso aberto", "sensor de temperatura"],
        "Recomenda-se verificar o sistema de refrigeração.",
        0,
        confidence,
      )
    : null;

  const iatDurationS = longestDuration(
    sorted,
    (r) => {
      const intake = numeric(r, "intake");
      const outside = numeric(r, "ambientTemp");
      const speed = numeric(r, "speed");
      return intake !== null && outside !== null && speed !== null &&
        speed > 50 && intake - outside > 35;
    },
  );
  const iatMedianDelta = median(
    sorted
      .filter((r) => {
        const intake = numeric(r, "intake");
        const outside = numeric(r, "ambientTemp");
        const speed = numeric(r, "speed");
        return intake !== null &&
          outside !== null &&
          speed !== null &&
          speed > 50 &&
          intake - outside > 35;
      })
      .map((r) => numeric(r, "intake") - numeric(r, "ambientTemp")),
  );
  const iatFinding =
    iatDurationS >= 60
      ? makeFinding(
          "IAT_HIGH",
          "atencao",
          iatMedianDelta,
          "> 35 °C a > 50 km/h durante ≥ 60 s",
          ["Intercooler obstruído ou com fuga", "sensor IAT"],
          "Recomenda-se verificar a admissão e o sensor.",
          iatDurationS,
          confidence,
        )
      : null;

  const underboostValues = sorted
    .filter((r) => {
      const rpm = numeric(r, "rpm");
      const load = numeric(r, "engineLoad");
      return rpm !== null && rpm >= 2000 && rpm <= 3000 && load !== null && load >= 85;
    })
    .map((r) => {
      const map = numeric(r, "map");
      const baro = numeric(r, "baro");
      return map !== null && baro !== null ? map - baro : null;
    })
    .filter((value) => value !== null);
  const underboostMedian = median(underboostValues);
  const underboostDeviation = robustDeviation(
    underboostMedian,
    baselines.underboostKpa,
    0.25,
    "below",
  );
  const underboostFinding =
    diesel && underboostDeviation.isSignificant
      ? makeFinding(
          "UNDERBOOST",
          "atencao",
          underboostMedian,
          underboostDeviation.center,
          ["Fuga no circuito de admissão", "atuador/geometria do turbo", "EGR"],
          "Recomenda-se verificar o circuito de admissão e o turbo.",
          0,
          confidence,
        )
      : null;
  if (diesel && underboostMedian !== null && underboostDeviation.learning) {
    learning.push({ ruleId: "UNDERBOOST", metric: "underboostKpa", n: baselines.underboostKpa?.n || 0 });
  }

  const mafCruise = median(
    sorted
      .filter((r) => {
        const rpm = numeric(r, "rpm");
        const load = numeric(r, "engineLoad");
        const coolant = numeric(r, "coolant");
        return rpm !== null && rpm >= 2000 && rpm <= 2500 &&
          load !== null && load >= 40 && load <= 60 &&
          coolant !== null && coolant >= 80;
      })
      .map((r) => numeric(r, "maf"))
      .filter((value) => value !== null),
  );
  const mafDeviation = robustDeviation(mafCruise, baselines.mafCruise, 0.15);
  const mafFinding =
    mafDeviation.isSignificant
      ? makeFinding(
          "MAF_DRIFT",
          "atencao",
          mafCruise,
          mafDeviation.center,
          ["MAF sujo ou degradado", "fuga a jusante do MAF", "EGR"],
          "Recomenda-se verificar o MAF e o circuito de admissão.",
          0,
          diesel ? "média" : confidence,
        )
      : null;
  if (mafCruise !== null && mafDeviation.learning) {
    learning.push({ ruleId: "MAF_DRIFT", metric: "mafCruise", n: baselines.mafCruise?.n || 0 });
  }

  let cruiseWindow = [];
  let maxCruiseDurationS = 0;
  let cruiseRunStart = null;
  let lastCruiseTs = null;
  let stableCruiseSamples = [];
  const stableCruiseTimestamps = new Set();
  for (const reading of sorted) {
    const ts = Number(reading.timestamp);
    const speed = numeric(reading, "speed");
    const load = numeric(reading, "engineLoad");
    const inRange = speed !== null && speed >= 80 && speed <= 100 && load !== null;
    if (
      !inRange ||
      (lastCruiseTs !== null && (ts <= lastCruiseTs || ts - lastCruiseTs > 10_000))
    ) {
      cruiseWindow = [];
      cruiseRunStart = null;
    }
    if (inRange) {
      if (cruiseRunStart === null) cruiseRunStart = ts;
      cruiseWindow.push({ ts, speed, load });
      while (cruiseWindow.length > 1 && ts - cruiseWindow[0].ts > 60_000) {
        cruiseWindow.shift();
      }
      const cruiseDurationS = (ts - cruiseRunStart) / 1000;
      if (
        cruiseWindow[cruiseWindow.length - 1].ts - cruiseWindow[0].ts >= 60_000 &&
        Math.max(...cruiseWindow.map((sample) => sample.speed)) -
          Math.min(...cruiseWindow.map((sample) => sample.speed)) <
          5
      ) {
        maxCruiseDurationS = Math.max(maxCruiseDurationS, cruiseDurationS);
        stableCruiseSamples = cruiseWindow.slice();
        cruiseWindow.forEach((sample) => stableCruiseTimestamps.add(sample.ts));
      }
      lastCruiseTs = ts;
    } else {
      lastCruiseTs = null;
    }
  }
  const loadCruise = median(stableCruiseSamples.map((sample) => sample.load));
  const loadBaseline = baselines.loadCruise;
  const loadCenter = Number(loadBaseline?.mediana);
  const loadDeviation = robustDeviation(
    loadCruise,
    loadBaseline,
    Number.isFinite(loadCenter) && loadCenter !== 0 ? 20 / Math.abs(loadCenter) : 20,
    "above",
  );
  const recentTrips = options.recentTrips || [];
  const loadCruiseFinding =
    maxCruiseDurationS >= 60 &&
    loadCruise !== null &&
    loadBaseline &&
    loadBaseline.n >= 5 &&
    loadCruise > loadCenter + 20 &&
    loadDeviation.isSignificant
      ? makeFinding(
          "HIGH_LOAD_CRUISE",
          "informativo",
          loadCruise,
          Number(loadBaseline.mediana) + 20,
          ["Restrição no escape/DPF", "travões presos", "pressão baixa nos pneus", "inclinação ou vento"],
          "Compara com viagens semelhantes antes de pedir uma inspeção.",
          maxCruiseDurationS,
          confidence,
        )
      : null;
  if (loadCruise !== null && (!loadBaseline || loadBaseline.n < 5)) {
    learning.push({ ruleId: "HIGH_LOAD_CRUISE", metric: "loadCruise", n: loadBaseline?.n || 0 });
  }

  const dpfValues = sorted
    .filter((r) => numeric(r, "dpfDiffPressure") !== null)
    .map((r) => numeric(r, "dpfDiffPressure"));
  const dpfZero = dpfValues.length >= 5 && dpfValues.every((value) => value === 0);
  const dpfNegative = dpfValues.some((value) => value < 0);
  const dpfNormalized = median(
    sorted
      .filter((r) => {
        const pressure = numeric(r, "dpfDiffPressure");
        const maf = numeric(r, "maf");
        const coolant = numeric(r, "coolant");
        return (
          pressure !== null &&
          maf !== null &&
          maf > 0 &&
          coolant !== null &&
          coolant >= 80 &&
          stableCruiseTimestamps.has(Number(r.timestamp))
        );
      })
      .map((r) => numeric(r, "dpfDiffPressure") / numeric(r, "maf")),
  );
  const dpfDeviation = robustDeviation(
    dpfNormalized,
    baselines.dpfPressurePerMaf,
    0.5,
    "above",
  );
  const dpfFinding =
    dpfZero || dpfNegative
      ? makeFinding(
          "DPF_PRESSURE",
          "atencao",
          dpfZero ? "0 constante" : "valor negativo",
          "pressão diferencial plausível",
          ["Sensor/circuito de pressão diferencial suspeito"],
          "Recomenda-se verificar o sensor e respetiva cablagem; o valor não confirma uma avaria.",
          0,
          "baixa",
        )
      : dpfDeviation.isSignificant
        ? makeFinding(
            "DPF_PRESSURE",
            "atencao",
            dpfNormalized,
            dpfDeviation.center,
            ["Carga de fuligem elevada", "regeneração falhada"],
            "Recomenda-se confirmar com diagnóstico adequado ao fabricante.",
            0,
            confidence,
          )
        : null;
  if (dpfNormalized !== null && dpfDeviation.learning) {
    learning.push({ ruleId: "DPF_PRESSURE", metric: "dpfPressurePerMaf", n: baselines.dpfPressurePerMaf?.n || 0 });
  }

  const firstEngineIndex = sorted.findIndex((r) => {
    const rpm = numeric(r, "rpm");
    return rpm !== null && rpm > 500;
  });
  const restingVoltages =
    firstEngineIndex > 0
      ? sorted
          .slice(0, firstEngineIndex)
          .filter((r) => numeric(r, "rpm") === 0 && numeric(r, "voltage") !== null)
          .map((r) => numeric(r, "voltage"))
      : [];
  const restVoltage = median(restingVoltages);
  const restFinding =
    restVoltage !== null && restVoltage < 12.2
      ? makeFinding(
          "BATTERY_REST",
          restVoltage < 12 ? "critico" : "atencao",
          restVoltage,
          restVoltage < 12 ? "≥ 12,0 V" : "≥ 12,2 V",
          ["Bateria descarregada ou degradada", "consumo parasita"],
          "Recomenda-se verificar a bateria e o sistema de carga.",
          0,
          confidence,
        )
      : null;

  let crankVoltage = null;
  for (let i = 1; i < sorted.length; i++) {
    const previousRpm = numeric(sorted[i - 1], "rpm");
    const currentRpm = numeric(sorted[i], "rpm");
    const startTs = Number(sorted[i].timestamp);
    if (previousRpm !== null && previousRpm <= 500 && currentRpm !== null && currentRpm > 500) {
      const crankReadings = sorted.filter((reading) =>
        Math.abs(Number(reading.timestamp) - startTs) <= 3000,
      );
      const crankVoltages = crankReadings
        .map((reading) => numeric(reading, "voltage"))
        .filter((value) => value !== null);
      crankVoltage = crankVoltages.length ? Math.min(...crankVoltages) : null;
      break;
    }
  }
  const crankFinding =
    crankVoltage !== null && crankVoltage < 9.6
      ? makeFinding(
          "CRANK_DIP",
          "atencao",
          crankVoltage,
          "≥ 9,6 V durante o arranque",
          ["Bateria fraca"],
          "Recomenda-se confirmar com um teste de carga; a amostragem pode não captar o mínimo real.",
          0,
          "baixa",
        )
      : null;

  const fuelTrimSamples = sorted.filter((r) => {
    const coolant = numeric(r, "coolant");
    return coolant !== null && coolant >= 80 &&
      numeric(r, "stft") !== null && numeric(r, "ltft") !== null;
  });
  const fuelTrimMedian = diesel
    ? null
    : median(fuelTrimSamples.map((r) => Math.abs(numeric(r, "stft") + numeric(r, "ltft"))));
  const fuelTrimDurationS = longestDuration(
    fuelTrimSamples,
    (r) => Math.abs(numeric(r, "stft") + numeric(r, "ltft")) > 10,
  );
  const idleTrim = median(
    fuelTrimSamples
      .filter((r) => numeric(r, "rpm") !== null && numeric(r, "rpm") < 1200)
      .map((r) => Math.abs(numeric(r, "stft") + numeric(r, "ltft"))),
  );
  const loadedTrim = median(
    fuelTrimSamples
      .filter((r) => numeric(r, "rpm") !== null && numeric(r, "rpm") >= 2000)
      .map((r) => Math.abs(numeric(r, "stft") + numeric(r, "ltft"))),
  );
  const fuelTrimFinding =
    fuelTrimMedian !== null && fuelTrimMedian > 10 && fuelTrimDurationS >= 30
      ? makeFinding(
          "FUEL_TRIM",
          fuelTrimMedian > 20 ? "critico" : "atencao",
          fuelTrimMedian,
          fuelTrimMedian > 20 ? "|STFT + LTFT| ≤ 20 %" : "|STFT + LTFT| ≤ 10 %",
          idleTrim !== null && loadedTrim !== null && idleTrim > loadedTrim
            ? ["Entrada de ar falso"]
            : ["Alimentação de combustível", "MAF"],
          "Recomenda-se confirmar com diagnóstico adequado ao veículo.",
          fuelTrimDurationS,
          confidence,
        )
      : null;

  const context = {
    summary,
    profile,
    thermostatFinding,
    warmupFinding,
    iatDurationS,
    iatFinding,
    underboostMedian,
    underboostFinding,
    mafCruise,
    mafFinding,
    cruiseDurationS: maxCruiseDurationS,
    loadCruiseFinding,
    dpfFinding,
    restVoltage,
    restFinding,
    crankVoltage,
    crankFinding,
    fuelTrimMedian,
    fuelTrimFinding,
  };

  for (const rule of HEALTH_RULES) {
    if (rule.appliesTo === "diesel" && !diesel) continue;
    if (rule.appliesTo === "gasolina" && !gasoline) continue;
    if (!rule.requires.every((field) => profile[field])) continue;
    if (!rule.gate(context)) continue;
    const finding = rule.evaluate(context);
    if (finding) findings.push(finding);
  }

  const priorValidTrips = recentTrips
    .filter((trip) => trip.qualidadeDados?.estado === "suficiente")
    .slice(0, 4);
  const deviationRules = new Set([
    "WARMUP_SLOW",
    "UNDERBOOST",
    "MAF_DRIFT",
    "HIGH_LOAD_CRUISE",
    "DPF_PRESSURE",
  ]);
  const visibleFindings = findings.filter((finding) => {
    const isSensorPlausibilityFinding =
      finding.ruleId === "DPF_PRESSURE" &&
      typeof finding.valorObservado === "string";
    if (
      !deviationRules.has(finding.ruleId) ||
      isSensorPlausibilityFinding
    ) {
      return true;
    }
    const priorOccurrences = priorValidTrips.filter((trip) =>
      trip.diagnostico?.achados?.some(
        (previous) => previous.ruleId === finding.ruleId,
      ),
    ).length;
    if (priorOccurrences + 1 < 3) return false;
    if (finding.ruleId === "HIGH_LOAD_CRUISE") {
      finding.severidade = "atencao";
    }
    return true;
  });
  const severityOrder = { critico: 0, atencao: 1, informativo: 2 };
  const confidenceOrder = { alta: 0, "média": 1, baixa: 2 };
  visibleFindings.sort(
    (a, b) =>
      severityOrder[a.severidade] - severityOrder[b.severidade] ||
      confidenceOrder[a.confianca] - confidenceOrder[b.confianca],
  );
  const selectedFindings = visibleFindings.slice(0, 3);
  const diagnosticFields = ["coolant", "voltage", "maf", "map", "dpfDiffPressure", "stft"];
  const available = diagnosticFields.some((field) => profile[field]);
  const estado = !available
    ? "indisponivel"
    : selectedFindings.some((finding) => finding.severidade === "critico")
      ? "verificar"
      : selectedFindings.some((finding) => finding.severidade === "atencao")
        ? "a_vigiar"
        : "normal";

  return {
    estado,
    qualidadeDados: quality,
    achados: selectedFindings,
    aprendizagem: learning,
    metrics: {
      warmupMin: summary.warmupMin,
      underboostKpa: underboostMedian,
      mafCruise,
      loadCruise,
      dpfPressurePerMaf: dpfNormalized,
      ambienteC: ambient,
      motorQuenteMin: hotEngineMinutes,
    },
    summary,
  };
}

function calculateBaselines(trips, options = {}) {
  const eligible = (trips || []).filter((trip) => {
    const diagnostic = trip.diagnostico || {};
    return trip.qualidadeDados?.estado === "suficiente" &&
      Number(diagnostic.metrics?.motorQuenteMin) >= 5 &&
      !diagnostic.achados?.some((finding) => finding.severidade === "critico");
  });
  if (eligible.length < 5) {
    return { ready: false, validTripCount: eligible.length, documents: {} };
  }

  const metrics = [
    "underboostKpa",
    "mafCruise",
    "loadCruise",
    "dpfPressurePerMaf",
  ];
  const documents = {};
  const addDocument = (key, values, ambientC) => {
    if (values.length < 5) return;
    const center = median(values);
    documents[key] = {
      mediana: center,
      mad: medianAbsoluteDeviation(values, center),
      n: values.length,
      ambienteC: ambientC ?? null,
      versao: 1,
      criadaEm: options.createdAt || new Date(),
    };
  };

  for (const metric of metrics) {
    addDocument(
      metric,
      eligible
        .map((trip) => finiteNumber(trip.diagnostico.metrics?.[metric]))
        .filter((value) => value !== null),
    );
  }

  const ambientBands = new Set(
    eligible
      .map((trip) => finiteNumber(trip.diagnostico.metrics?.ambienteC))
      .filter((value) => value !== null)
      .map((value) => ambientBand(value))
      .filter((band) => band !== null),
  );
  for (const band of ambientBands) {
    addDocument(
      `warmupMin_ambient_${band}`,
      eligible
        .filter(
          (trip) =>
            finiteNumber(trip.diagnostico.metrics?.ambienteC) !== null &&
            ambientBand(finiteNumber(trip.diagnostico.metrics?.ambienteC)) === band,
        )
        .map((trip) => finiteNumber(trip.diagnostico.metrics?.warmupMin))
        .filter((value) => value !== null),
      band,
    );
  }

  return { ready: true, validTripCount: eligible.length, documents };
}

return {
  ALERT_RULES,
  HEALTH_RULES,
  evaluateRealtime,
  analyzeTrip,
  calculateBaselines,
};
});
