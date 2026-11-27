// Testes do cálculo de métricas de viagem.  Correr:  cd functions && npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../tripMetrics");

const T0 = 1_760_000_000_000;

// Gera leituras a cada `dt` segundos a partir de uma lista de velocidades.
function drive(speeds, { dt = 2, extra = () => ({}) } = {}) {
  return speeds.map((speed, i) => ({
    timestamp: T0 + i * dt * 1000,
    parsed: { speed, rpm: speed > 0 ? 1500 : 800, ...extra(i, speed) },
  }));
}

const constant = (kmh, seconds, dt = 2) => Array(seconds / dt + 1).fill(kmh);

test("as duas cópias do módulo são idênticas", () => {
  const a = fs.readFileSync(path.join(__dirname, "../tripMetrics.js"), "utf8");
  const b = fs.readFileSync(path.join(__dirname, "../../js/utils/tripMetrics.js"), "utf8");
  assert.equal(a, b, "copia js/utils/tripMetrics.js para functions/tripMetrics.js");
});

test("integra a velocidade quando o Torque não envia distância", () => {
  // 60 km/h durante 10 min = 10 km
  const s = T.fromReadings(drive(constant(60, 600)));
  const sum = T.summarize(s);
  assert.equal(sum.distanceSource, "velocidade");
  assert.ok(Math.abs(sum.distanceKm - 10) < 0.01, `distância ${sum.distanceKm}`);
  assert.equal(sum.durationMin, 10);
  assert.equal(sum.avgMovingSpeed, 60);
});

test("prefere a distância do Torque quando existe, e sobrevive a reset do contador", () => {
  const trip = [0, 1, 2, 3, 0.5, 1.5]; // reset a meio (3 -> 0.5)
  const readings = trip.map((d, i) => ({
    timestamp: T0 + i * 60_000,
    parsed: { speed: 60, rpm: 1500, tripDistance: d },
  }));
  const sum = T.summarize(T.fromReadings(readings));
  assert.equal(sum.distanceSource, "torque");
  assert.equal(sum.distanceKm, 4.5); // 3 + 0.5 + 1
});

test("não integra através de falhas de ligação longas", () => {
  const readings = [
    { timestamp: T0, parsed: { speed: 100, rpm: 2000 } },
    { timestamp: T0 + 10 * 60_000, parsed: { speed: 100, rpm: 2000 } }, // 10 min sem dados
  ];
  assert.equal(T.summarize(T.fromReadings(readings)).distanceKm, 0);
});

test("qualidade: calcula cobertura e intervalo mediano; marca gaps acima de 10 s", () => {
  const complete = T.summarize(
    T.fromReadings([
      { timestamp: T0, parsed: { speed: 0, rpm: 800, map: 0 } },
      { timestamp: T0 + 1000, parsed: { speed: 0, rpm: 800 } },
      { timestamp: T0 + 2000, parsed: { speed: 0, rpm: 800 } },
    ]),
  );
  assert.equal(complete.qualidadeDados.cobertura, 1);
  assert.equal(complete.qualidadeDados.intervaloMedianoS, 1);
  assert.equal(complete.qualidadeDados.gaps, 0);
  assert.equal(complete.qualidadeDados.estado, "suficiente");
  assert.equal(complete.obdProfile.map, true);

  const withGap = T.summarize(
    T.fromReadings([
      { timestamp: T0, parsed: { speed: 0, rpm: 800 } },
      { timestamp: T0 + 5000, parsed: { speed: 0, rpm: 800 } },
      { timestamp: T0 + 20_000, parsed: { speed: 0, rpm: 800 } },
    ]),
  );
  assert.equal(withGap.qualidadeDados.gaps, 1);
  assert.equal(withGap.qualidadeDados.estado, "insuficiente");
});

test("migra acumulado antigo sem perder métricas e preserva campos da viagem", () => {
  const old = T.createState();
  T.step(old, { timestamp: T0, parsed: { speed: 50, rpm: 1500 } });
  old.v = 2;
  delete old.intervalHistogram;
  delete old.obdProfile;

  const upgraded = T.upgradeState(old);
  T.step(upgraded, {
    timestamp: T0 + 1000,
    parsed: { speed: 50, rpm: 1500 },
  });
  assert.equal(upgraded.v, T.VERSION);
  assert.equal(upgraded.firstTs, T0);
  assert.ok(upgraded.distCalcKm > 0);

  const fields = T.toTripFields(T.summarize(upgraded));
  assert.ok("qualidadeDados" in fields);
  assert.ok("obdProfile" in fields);
  assert.equal(fields.calcVersion, T.VERSION);
});

test("perfil do veículo reflete apenas os campos observados nas viagens recentes", () => {
  const profile = T.aggregateObdProfile(
    [
      { obdProfile: { dpfDiffPressure: true, map: true } },
      { obdProfile: { ambientTemp: true } },
      { obdProfile: { map: false } },
    ],
    2,
  );
  assert.equal(profile.dpfDiffPressure, true);
  assert.equal(profile.map, true);
  assert.equal(profile.ambientTemp, true);
  assert.equal(profile.egt, false);
});

test("leituras fora de ordem e duplicadas não contam a dobrar", () => {
  const readings = drive(constant(60, 600));
  const s = T.createState();
  for (const r of readings) T.step(s, r);
  const before = T.summarize(s).distanceKm;
  T.step(s, readings[10]); // atrasada
  T.step(s, readings[readings.length - 1]); // duplicada
  assert.equal(T.summarize(s).distanceKm, before);
});

test("tempo ao ralenti e percentagem", () => {
  const speeds = [...constant(0, 120), ...constant(50, 360)];
  const sum = T.summarize(T.fromReadings(drive(speeds)));
  assert.ok(Math.abs(sum.idleMin - 2) < 0.05, `ralenti ${sum.idleMin}`);
  assert.ok(sum.idlePct >= 24 && sum.idlePct <= 26, `pct ${sum.idlePct}`);
});

test("deteta acelerações e travagens bruscas sem contar o mesmo evento várias vezes", () => {
  const speeds = [...constant(30, 60), 55, 80, ...constant(80, 60), 50, 20, ...constant(20, 60)];
  const sum = T.summarize(T.fromReadings(drive(speeds)));
  assert.equal(sum.harshAccel, 1);
  assert.equal(sum.harshBrake, 1);
});

test("combustível: diesel sem dados usa a média de referência (estimativa)", () => {
  const s = T.fromReadings(drive(constant(60, 600), { extra: () => ({ maf: 20 }) }), {
    fuelType: "Diesel",
    refL100: 5,
  });
  const sum = T.summarize(s, { pricePerLiter: 2 });
  assert.equal(sum.fuelSource, "estimativa"); // MAF ignorado em diesel
  assert.equal(sum.liters, 0.5);
  assert.equal(sum.l100, 5);
  assert.equal(sum.cost, 1);
});

test("combustível: gasolina com MAF calcula pelo MAF", () => {
  const s = T.fromReadings(drive(constant(60, 600), { extra: () => ({ maf: 10 }) }), {
    fuelType: "Gasolina 95",
    refL100: 5,
  });
  const sum = T.summarize(s);
  assert.equal(sum.fuelSource, "maf");
  // 10 g/s * 600 s / 14.7 / 745 ≈ 0.548 L
  assert.ok(Math.abs(sum.liters - 0.55) < 0.01, `litros ${sum.liters}`);
});

test("combustível: litros do Torque têm prioridade sobre tudo", () => {
  const readings = drive(constant(60, 600), {
    extra: (i) => ({ fuelUsedTrip: i * 0.002, maf: 10 }),
  });
  const sum = T.summarize(T.fromReadings(readings, { fuelType: "Gasolina", refL100: 5 }));
  assert.equal(sum.fuelSource, "torque");
  assert.equal(sum.liters, 0.6);
});

test("aquecimento do motor e viagem a frio", () => {
  const warm = drive(constant(50, 600), { extra: (i) => ({ coolant: 30 + i }) });
  const sumWarm = T.summarize(T.fromReadings(warm));
  assert.equal(sumWarm.reachedWarm, true);
  assert.ok(sumWarm.warmupMin > 1 && sumWarm.warmupMin < 1.5);

  const cold = drive(constant(50, 120), { extra: () => ({ coolant: 40 }) });
  assert.equal(T.summarize(T.fromReadings(cold)).reachedWarm, false);
});

test("score: nulo em viagens curtas, 100 numa condução suave, baixa com maus hábitos", () => {
  assert.equal(T.summarize(T.fromReadings(drive(constant(50, 30)))).score, null);
  assert.equal(T.summarize(T.fromReadings(drive(constant(50, 600)))).score, 100);

  const aggressive = drive(constant(130, 600), { extra: () => ({ rpm: 3500 }) });
  const s = T.summarize(T.fromReadings(aggressive)).score;
  assert.ok(s < 75, `score ${s}`);
});

test("toTripFields mantém os campos usados pela app (compatibilidade)", () => {
  const f = T.toTripFields(T.summarize(T.fromReadings(drive(constant(60, 600)))));
  for (const k of ["distancia", "duracao", "velocidadeMedia", "consumoMedio", "custoEstimado", "score", "calcVersion"])
    assert.ok(k in f, k);
  for (const k of ["rpmMedio", "velocidadeMax", "temperaturaMax", "voltagemMedia"])
    assert.ok(k in f.metricas, k);
  assert.equal(f.calcVersion, T.VERSION);
});
