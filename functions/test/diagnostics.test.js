const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateRealtime,
  analyzeTrip,
  calculateBaselines,
  HEALTH_RULES,
} = require("../diagnostics");

const T0 = 1_700_000_000_000;

function makeReadings(seconds, intervalS, parsedForSecond) {
  const readings = [];
  for (let second = 0; second <= seconds; second += intervalS) {
    readings.push({
      timestamp: T0 + second * 1000,
      parsed: {
        speed: 60,
        rpm: 1800,
        coolant: 90,
        engineLoad: 45,
        voltage: 14,
        ...parsedForSecond(second),
      },
    });
  }
  return readings;
}

function warmupTrip() {
  return makeReadings(900, 2, (second) => ({
    coolant: second < 480 ? 40 : second < 600 ? 70 : 90,
    ambientTemp: 20,
  }));
}

function recurrenceHistory(ruleId, count = 2) {
  return Array.from({ length: count }, () => ({
    qualidadeDados: { estado: "suficiente" },
    diagnostico: { achados: [{ ruleId }] },
  }));
}

function runSeries(samples, initialState = {}) {
  let state = initialState;
  const notifications = [];
  samples.forEach((parsed, index) => {
    const result = evaluateRealtime(
      parsed,
      state,
      1_700_000_000_000 + index * 1000,
      "Logan",
    );
    state = result.state;
    notifications.push(...result.notifications);
  });
  return { state, notifications };
}

test("ignora picos curtos e alerta após 20 s contínuos de sobreaquecimento", () => {
  const short = runSeries([
    { coolant: 109 },
    { coolant: 109 },
    { coolant: 99 },
  ]);
  assert.equal(short.notifications.length, 0);

  const sustained = runSeries(Array.from({ length: 26 }, () => ({ coolant: 109 })));
  assert.equal(
    sustained.notifications.filter((item) => item.ruleId === "OVERHEAT").length,
    1,
  );
});

test("aplica histerese ao sobreaquecimento e separa cooldowns por regra", () => {
  let state = {};
  const notifications = [];
  const start = 1_700_000_000_000;
  for (let second = 0; second <= 125; second++) {
    const coolant = second < 25 ? 109 : second < 40 ? 104 : 99;
    const result = evaluateRealtime(
      { coolant, voltage: 12.4, rpm: 1500 },
      state,
      start + second * 1000,
      "Logan",
    );
    state = result.state;
    notifications.push(...result.notifications);
  }
  const alertIds = notifications.map((item) => item.ruleId);
  assert.ok(alertIds.includes("OVERHEAT"));
  assert.ok(alertIds.includes("NO_CHARGE"));
  assert.equal(alertIds.filter((id) => id === "OVERHEAT").length, 1);
});

test("não alerta por baixa carga entre 12,6 e 13,2 V e deteta sobretensão persistente", () => {
  const lowCharge = runSeries(
    Array.from({ length: 150 }, () => ({ voltage: 12.8, rpm: 1500 })),
  );
  assert.equal(
    lowCharge.notifications.some((item) => item.ruleId === "NO_CHARGE"),
    false,
  );

  const overvoltage = runSeries(
    Array.from({ length: 12 }, () => ({ voltage: 15.1 })),
  );
  assert.equal(
    overvoltage.notifications.filter((item) => item.ruleId === "OVERVOLTAGE")
      .length,
    1,
  );
});

test("não conta uma amostra depois de um gap superior a 10 s como persistência", () => {
  let state = {};
  const first = evaluateRealtime(
    { coolant: 109 },
    state,
    1_700_000_000_000,
    "Logan",
  );
  state = first.state;
  const afterGap = evaluateRealtime(
    { coolant: 109 },
    state,
    1_700_000_015_000,
    "Logan",
  );
  assert.equal(afterGap.notifications.length, 0);
  assert.equal(
    afterGap.state.OVERHEAT.conditionSince,
    1_700_000_015_000,
  );
});

test("regras declarativas expõem as condições de avaliação exigidas", () => {
  for (const rule of HEALTH_RULES) {
    for (const field of [
      "id",
      "appliesTo",
      "requires",
      "gate",
      "evaluate",
      "minDurationS",
      "hysteresis",
      "severity",
      "cooldownMin",
      "realtime",
    ]) {
      assert.ok(field in rule, `${rule.id} não declara ${field}`);
    }
    assert.equal(rule.realtime, false);
  }
});

test("dados insuficientes não produzem check-up", () => {
  const result = analyzeTrip(
    makeReadings(90, 15, () => ({ coolant: 90 })),
    { fuelType: "Diesel" },
  );
  assert.equal(result.estado, "dados_insuficientes");
  assert.deepEqual(result.achados, []);
  assert.equal(result.qualidadeDados.estado, "insuficiente");
});

test("deteta termóstato indicativamente após viagem longa sem temperatura adequada", () => {
  const result = analyzeTrip(
    makeReadings(960, 2, () => ({
      coolant: 75,
      ambientTemp: 20,
    })),
    { fuelType: "Diesel" },
  );
  assert.equal(result.qualidadeDados.estado, "suficiente");
  assert.ok(result.achados.some((finding) => finding.ruleId === "THERMOSTAT_OPEN"));
  assert.match(
    result.achados.find((finding) => finding.ruleId === "THERMOSTAT_OPEN")
      .acaoRecomendada,
    /Recomenda-se/,
  );
});

test("deteta queda de temperatura após aquecimento em movimento contínuo", () => {
  const result = analyzeTrip(
    makeReadings(90, 2, (second) => ({
      coolant: second < 40 ? 90 : 80,
    })),
    { fuelType: "Diesel" },
  );
  assert.ok(result.achados.some((finding) => finding.ruleId === "THERMOSTAT_OPEN"));
});

test("IAT alto exige diferença térmica persistente em movimento", () => {
  const high = analyzeTrip(
    makeReadings(90, 2, () => ({
      speed: 60,
      intake: 60,
      ambientTemp: 20,
    })),
    { fuelType: "Gasóleo" },
  );
  const brief = analyzeTrip(
    makeReadings(90, 2, (second) => ({
      speed: 60,
      intake: second < 20 ? 60 : 40,
      ambientTemp: 20,
    })),
    { fuelType: "Gasóleo" },
  );
  assert.ok(high.achados.some((finding) => finding.ruleId === "IAT_HIGH"));
  assert.equal(
    brief.achados.some((finding) => finding.ruleId === "IAT_HIGH"),
    false,
  );
});

test("diesel e combustível desconhecido nunca usam fuel trims", () => {
  const readings = makeReadings(90, 2, () => ({
    stft: 15,
    ltft: 10,
    coolant: 90,
  }));
  for (const fuelType of ["Diesel", ""]) {
    const result = analyzeTrip(readings, { fuelType });
    assert.equal(
      result.achados.some((finding) => finding.ruleId === "FUEL_TRIM"),
      false,
    );
  }
});

test("deteta DPF a zero constante como sensor ou circuito suspeito em diesel", () => {
  const result = analyzeTrip(
    makeReadings(90, 2, () => ({ dpfDiffPressure: 0 })),
    { fuelType: "Diesel" },
  );
  const finding = result.achados.find((item) => item.ruleId === "DPF_PRESSURE");
  assert.ok(finding);
  assert.match(finding.possiveisCausas[0], /suspeito/);
  assert.equal(
    analyzeTrip(makeReadings(90, 2, () => ({ dpfDiffPressure: 0 })), {
      fuelType: "Gasolina",
    }).achados.some((item) => item.ruleId === "DPF_PRESSURE"),
    false,
  );
});

test("limita achados a três e não converte valores ausentes em zero", () => {
  const result = analyzeTrip(
    makeReadings(90, 2, (second) => ({
      rpm: second < 10 ? 0 : 900,
      voltage: second < 10 ? 11.8 : second < 20 ? 9 : 14,
      stft: 15,
      ltft: 10,
    })),
    { fuelType: "Gasolina" },
  );
  assert.ok(result.achados.length <= 3);
  assert.ok(result.achados.some((finding) => finding.ruleId === "BATTERY_REST"));
  assert.ok(result.achados.some((finding) => finding.ruleId === "CRANK_DIP"));

  const absent = analyzeTrip(
    makeReadings(90, 2, () => ({ voltage: null, dpfDiffPressure: null })),
    { fuelType: "Diesel" },
  );
  assert.equal(absent.estado, "normal");
  assert.equal(absent.metrics.dpfPressurePerMaf, null);
});

test("baseline usa mediana e MAD e exige cinco viagens elegíveis", () => {
  const trip = (warmupMin, isCritical = false) => ({
    qualidadeDados: { estado: "suficiente" },
    diagnostico: {
      metrics: {
        motorQuenteMin: 6,
        warmupMin,
        ambienteC: 20,
        mafCruise: 10,
      },
      achados: isCritical ? [{ severidade: "critico" }] : [],
    },
  });
  const ineligible = [trip(99, true), trip(99)].slice(0, 1);
  assert.equal(calculateBaselines(ineligible).ready, false);

  const result = calculateBaselines(
    [trip(3), trip(4), trip(4), trip(5), trip(100)],
    { createdAt: new Date("2026-01-01T00:00:00Z") },
  );
  const warmup = result.documents.warmupMin_ambient_20;
  assert.equal(result.ready, true);
  assert.equal(result.validTripCount, 5);
  assert.equal(warmup.mediana, 4);
  assert.equal(warmup.mad, 1);
  assert.equal(warmup.n, 5);
  assert.equal(warmup.criadaEm.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("baseline ignora métricas e temperatura ambiente explicitamente nulas", () => {
  const trips = Array.from({ length: 5 }, () => ({
    qualidadeDados: { estado: "suficiente" },
    diagnostico: {
      metrics: {
        motorQuenteMin: 6,
        warmupMin: null,
        ambienteC: null,
        mafCruise: null,
      },
      achados: [],
    },
  }));
  const result = calculateBaselines(trips);

  assert.equal(result.ready, true);
  assert.deepEqual(result.documents, {});
});

test("desvios de baseline só aparecem após recorrência em três viagens válidas", () => {
  const previous = (withFinding) => ({
    qualidadeDados: { estado: "suficiente" },
    diagnostico: {
      achados: withFinding ? [{ ruleId: "WARMUP_SLOW" }] : [],
    },
  });
  const options = {
    fuelType: "Gasóleo",
    baselines: {
      warmupMin_ambient_20: { mediana: 4, mad: 0, n: 5 },
    },
  };
  const readings = warmupTrip();
  const notRecurring = analyzeTrip(readings, {
    ...options,
    recentTrips: [previous(true)],
  });
  const recurring = analyzeTrip(readings, {
    ...options,
    recentTrips: [previous(true), previous(true)],
  });
  assert.equal(
    notRecurring.achados.some((finding) => finding.ruleId === "WARMUP_SLOW"),
    false,
  );
  assert.ok(recurring.achados.some((finding) => finding.ruleId === "WARMUP_SLOW"));
});

test("UNDERBOOST e MAF_DRIFT respeitam bandas, baseline robusta e recorrência", () => {
  const underboost = analyzeTrip(
    makeReadings(90, 2, () => ({
      rpm: 2500,
      engineLoad: 90,
      map: 105,
      baro: 100,
      maf: 20,
    })),
    {
      fuelType: "Diesel",
      baselines: { underboostKpa: { mediana: 10, mad: 0, n: 5 } },
      recentTrips: recurrenceHistory("UNDERBOOST"),
    },
  );
  const maf = analyzeTrip(
    makeReadings(90, 2, () => ({
      rpm: 2200,
      engineLoad: 50,
      maf: 5,
    })),
    {
      fuelType: "Gasolina",
      baselines: { mafCruise: { mediana: 10, mad: 0, n: 5 } },
      recentTrips: recurrenceHistory("MAF_DRIFT"),
    },
  );
  assert.ok(underboost.achados.some((finding) => finding.ruleId === "UNDERBOOST"));
  assert.ok(maf.achados.some((finding) => finding.ruleId === "MAF_DRIFT"));
  assert.equal(
    analyzeTrip(
      makeReadings(90, 2, () => ({
        rpm: 2500,
        engineLoad: 90,
        map: 105,
        baro: 100,
      })),
      {
        fuelType: "Gasolina",
        baselines: { underboostKpa: { mediana: 10, mad: 0, n: 5 } },
        recentTrips: recurrenceHistory("UNDERBOOST"),
      },
    ).achados.some((finding) => finding.ruleId === "UNDERBOOST"),
    false,
  );
});

test("carga elevada em cruzeiro só escala para atenção após recorrência", () => {
  const result = analyzeTrip(
    makeReadings(120, 2, () => ({
      speed: 90,
      engineLoad: 80,
    })),
    {
      fuelType: "Diesel",
      baselines: { loadCruise: { mediana: 50, mad: 0, n: 5 } },
      recentTrips: recurrenceHistory("HIGH_LOAD_CRUISE"),
    },
  );
  const finding = result.achados.find((item) => item.ruleId === "HIGH_LOAD_CRUISE");
  assert.ok(finding);
  assert.equal(finding.severidade, "atencao");
  assert.match(finding.possiveisCausas.join(" "), /vento/);
});

test("pressão DPF normalizada só sinaliza desvio de baseline após recorrência", () => {
  const result = analyzeTrip(
    makeReadings(90, 2, () => ({
      speed: 90,
      coolant: 90,
      maf: 20,
      dpfDiffPressure: 10,
    })),
    {
      fuelType: "Diesel",
      baselines: { dpfPressurePerMaf: { mediana: 0.2, mad: 0, n: 5 } },
      recentTrips: recurrenceHistory("DPF_PRESSURE"),
    },
  );
  const finding = result.achados.find((item) => item.ruleId === "DPF_PRESSURE");
  assert.ok(finding);
  assert.equal(finding.severidade, "atencao");
});

test("fuel trims só gasolina quente e exigem persistência antes do aviso", () => {
  const sustained = analyzeTrip(
    makeReadings(90, 2, () => ({ coolant: 90, stft: 15, ltft: 10 })),
    { fuelType: "Gasolina" },
  );
  const brief = analyzeTrip(
    makeReadings(90, 2, (second) => ({
      coolant: 90,
      stft: second < 20 ? 15 : 0,
      ltft: 0,
    })),
    { fuelType: "Gasolina" },
  );
  assert.ok(sustained.achados.some((finding) => finding.ruleId === "FUEL_TRIM"));
  assert.equal(
    brief.achados.some((finding) => finding.ruleId === "FUEL_TRIM"),
    false,
  );
});
