const test = require("node:test");
const assert = require("node:assert/strict");
const ReportData = require("../../js/utils/tripReportData");

test("filtra datas inclusivas de registos ISO e Timestamp", () => {
  const records = [
    { data: "2025-01-01" },
    { data: { seconds: Date.parse("2025-01-31T23:59:00Z") / 1000 } },
    { data: "2025-02-01" },
    { data: null },
  ];

  assert.equal(
    ReportData.filterByPeriod(records, "data", "2025-01-01", "2025-01-31")
      .length,
    2,
  );
});

test("resume custos e consumo ponderado sem inventar métricas ausentes", () => {
  const summary = ReportData.summarize({
    fuel: [
      { data: "2025-01-04", litros: 30, precoPorLitro: 1.7 },
      { data: "2025-02-03", litros: null, precoPorLitro: 1.8 },
    ],
    trips: [
      { distancia: 100, consumoMedio: 5, diagnostico: { estado: "normal" } },
      { distancia: 50, consumoMedio: null, diagnostico: { estado: "atencao" } },
    ],
    repairs: [{ custo: 75 }, { custo: null }],
  });

  assert.equal(summary.fuelLiters, 30);
  assert.equal(summary.fuelCost, 51);
  assert.equal(summary.repairCost, 75);
  assert.equal(summary.tripDistanceKm, 150);
  assert.equal(summary.averageConsumption, 5);
  assert.deepEqual(summary.healthStates, { normal: 1, atencao: 1 });
  assert.deepEqual(summary.monthlyFuelCost, [
    { month: "2025-01", cost: 51 },
  ]);
});

test("devolve consumo nulo quando não há viagens válidas", () => {
  const summary = ReportData.summarize({
    trips: [{ distancia: 0, consumoMedio: 7 }],
  });
  assert.equal(summary.averageConsumption, null);
});
