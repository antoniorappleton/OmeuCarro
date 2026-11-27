const DEFAULT_PIDS = {
  speed: ["kd", "k0d", "kff1001", "kff1007"],
  rpm: ["kc", "k0c"],
  odometer: ["a6", "kff1201"],
  fuelLevel: ["2f", "k2f", "k02f"],
  latitude: ["kff1006"],
  longitude: ["kff1005"],
  coolant: ["k5", "05", "k05"],
  intakeTemp: ["kf", "0f", "k0f"],
  maf: ["k10", "10"],
  engineLoad: ["k4", "04", "k04"],
  voltage: ["k42", "42", "kff1238"],
  tripDistance: ["kff1204"],
  tripL100: ["kff1208"],
  l100: ["kff5203"],
  torqueNm: ["kff1225"],
  hpWheels: ["kff1226"],
  avgSpeedMoving: ["kff1263"],
  fuelRemainingPct: ["k2f", "2f"],
  distanceToEmptyKm: ["kff126a"],
  fuelUsedTrip: ["kff1271"],
  boost: ["kff12a5"],
  map: ["k0b", "0b"],
  baro: ["k33", "33"],
  ambientTemp: ["k46", "46"],
  throttle: ["k11", "11"],
  egrCmd: ["k2c", "2c"],
  egrErr: ["k2d", "2d"],
  dpfDiffPressure: ["k7a", "7a", "k7b", "7b"],
  egt: ["k78", "78", "k79", "79"],
  stft: ["k06", "06", "k6"],
  ltft: ["k07", "07", "k7"],
};

const FUZZY_PATTERNS = {
  speed: ["speed", "km/h"],
  rpm: ["engine", "rpm"],
  odometer: ["odometer", "km"],
  fuelLevel: ["fuel level", "%"],
  coolant: ["coolant", "temperature"],
  intakeTemp: ["intake", "temperature"],
  maf: ["mass air flow", "g/s"],
  engineLoad: ["engine load", "%"],
  voltage: ["voltage", "v"],
  l100: ["l/100", "average"],
  tripDistance: ["trip distance", "km"],
  tripL100: ["trip average", "l/100"],
  fuelUsedTrip: ["fuel used", "trip"],
  avgSpeedMoving: ["average", "speed", "moving"],
  torqueNm: ["torque", "nm"],
  hpWheels: ["horsepower", "wheels"],
  fuelRemainingPct: ["fuel remaining", "%"],
  distanceToEmptyKm: ["distance to empty", "km"],
  boost: ["boost", "pressure"],
  map: ["intake manifold pressure"],
  baro: ["barometric pressure"],
  ambientTemp: ["ambient air temperature"],
  throttle: ["throttle position"],
  egrCmd: ["commanded egr"],
  egrErr: ["egr error"],
  dpfDiffPressure: ["dpf", "pressure"],
  egt: ["exhaust gas temperature"],
  stft: ["short term fuel trim"],
  ltft: ["long term fuel trim"],
};

function parseNumber(value) {
  if (value === undefined || value === null || value === "" || value === "-")
    return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value, fallback) {
  const timestamp = parseNumber(value);
  if (timestamp === null || timestamp <= 0) return fallback;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function getValue(params, pidMap, field) {
  const configuredPid = pidMap[field];
  if (configuredPid) {
    const configuredValue = parseNumber(params[configuredPid]);
    if (configuredValue !== null) return configuredValue;
  }

  for (const pid of DEFAULT_PIDS[field] || []) {
    const value = parseNumber(params[pid]);
    if (value !== null) return value;
  }

  const patterns = FUZZY_PATTERNS[field];
  if (!patterns) return null;
  for (const key of Object.keys(params)) {
    const normalizedKey = key.toLowerCase();
    if (patterns.every((pattern) => normalizedKey.includes(pattern))) {
      const value = parseNumber(params[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function parseTorquePayload(params, pidMap = {}) {
  const values = {};
  for (const field of Object.keys(DEFAULT_PIDS)) {
    values[field] = getValue(params, pidMap, field);
  }

  const { latitude, longitude, intakeTemp, ...parsed } = values;
  parsed.intake = intakeTemp;
  parsed.fuelUsed = parsed.fuelUsedTrip;
  parsed.location = null;
  return {
    parsed,
    latitude,
    longitude,
  };
}

module.exports = {
  DEFAULT_PIDS,
  normalizeTimestamp,
  parseNumber,
  parseTorquePayload,
};
