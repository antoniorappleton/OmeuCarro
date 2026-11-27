const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeTimestamp,
  parseTorquePayload,
} = require("../torqueParser");

test("normaliza segundos uma vez, preserva milissegundos e usa fallback inválido", () => {
  assert.equal(normalizeTimestamp(1_700_000_000, 10), 1_700_000_000_000);
  assert.equal(normalizeTimestamp(1_700_000_000_000, 10), 1_700_000_000_000);
  assert.equal(normalizeTimestamp("inválido", 10), 10);
});

test("extrai PIDs padrão, fuzzy e valores zero sem inventar campos ausentes", () => {
  const { parsed } = parseTorquePayload({
    k0b: "101",
    k33: "99",
    k46: "18",
    k11: "35",
    k2c: "0",
    k2d: "-2",
    k7a: "0",
    k78: "410",
    k06: "-5",
    k07: "2",
    "Intake air temperature (C)": "31",
  });

  assert.equal(parsed.map, 101);
  assert.equal(parsed.baro, 99);
  assert.equal(parsed.ambientTemp, 18);
  assert.equal(parsed.throttle, 35);
  assert.equal(parsed.egrCmd, 0);
  assert.equal(parsed.egrErr, -2);
  assert.equal(parsed.dpfDiffPressure, 0);
  assert.equal(parsed.egt, 410);
  assert.equal(parsed.stft, -5);
  assert.equal(parsed.ltft, 2);
  assert.equal(parsed.intake, 31);
  assert.equal(parsed.boost, null);
});

test("pidMap explícito tem prioridade sobre o PID padrão", () => {
  const { parsed } = parseTorquePayload(
    { customMap: "87", k0b: "101" },
    { map: "customMap" },
  );
  assert.equal(parsed.map, 87);
});
