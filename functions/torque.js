const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { defineSecret } = require("firebase-functions/params");

// Garantir inicialização do admin
if (!admin.apps.length) admin.initializeApp();

// Definir o segredo para a chave de upload
// NOTA: É necessário criar este segredo no Firebase: firebase functions:secrets:set TORQUE_UPLOAD_KEY
// Para emuladores locais, criar um ficheiro .secret.local na pasta functions
const apiKeySecret = defineSecret("TORQUE_UPLOAD_KEY");

// Mapas de PIDs padrão (fallback)
// Suporta array de strings para tentar várias opções (ordem de preferência)
const DEFAULT_PIDS = {
  speed: ["kd", "k0d", "kff1001", "kff1007"], // km/h (OBD, GPS Speed, etc)
  rpm: ["kc", "k0c"], // rpm
  odometer: ["a6", "kff1201"], // km
  fuelLevel: ["2f", "k2f", "k02f"], // %
  latitude: ["kff1006"],
  longitude: ["kff1005"],
  coolant: ["k5", "05", "k05"], // °C
  intakeTemp: ["kf", "0f", "k0f"], // °C
  maf: ["k10", "10"], // g/s
  engineLoad: ["k4", "04", "k04"], // %
  voltage: ["k42", "42", "kff1238"], // V
  tripDistance: ["kff1204"], // km
  tripL100: ["kff1208", "kff1203"], // L/100 (ff1208 is user's average)
  torqueNm: ["kff1225", "kff1226"], // Nm
  hpWheels: ["kff1220", "kff1221"], // hp
  fuelRemainingPct: ["k2f", "2f"], // Re-using fuelLevel if specific PID missing
  distanceToEmptyKm: ["kff126a"], // autonomy
  fuelUsedTrip: ["kff1271"], // Liters
  boost: ["kff12a5"], // kPa or PSI depending on Torque settings
};

/**
 * Função para receber dados do Torque Pro
 * URL: https://<region>-<project>.cloudfunctions.net/uploadTorqueData?vehicleId=XXX&key=YYY
 */
exports.uploadTorqueData = onRequest(
  { secrets: [apiKeySecret] },
  async (req, res) => {
    try {
      // 1. Unificar payload (GET ou POST)
      const params = { ...req.query, ...req.body };

      // 2. Validação de Segurança (ROBUSTA)

      // Helper: Parse Basic Auth header
      function parseBasicAuth(req) {
        const h = req.get("authorization") || "";
        if (!h.toLowerCase().startsWith("basic ")) return null;
        try {
          const raw = Buffer.from(h.split(" ")[1], "base64").toString("utf8");
          const [user, pass] = raw.split(":");
          return pass || null; // normalmente interessa a password
        } catch {
          return null;
        }
      }

      // Tentar múltiplos nomes comuns para a key
      // 2. Validação de Segurança (ROBUSTA)
      const TORQUE_UPLOAD_KEY = apiKeySecret.value();
      const providedKey =
        params.key ||
        params.password ||
        params.pass ||
        params.pwd ||
        params.auth ||
        params.token;

      const providedKeyFromAuth = parseBasicAuth(req);
      const finalProvidedKey = providedKey || providedKeyFromAuth;

      if (!finalProvidedKey || finalProvidedKey !== TORQUE_UPLOAD_KEY) {
        console.warn("[Torque] Falha na autenticação.");
        return res.status(403).send("NO");
      }

      // Remover a chave e campos sensíveis dos dados a guardar (Segurança)
      const {
        key: _k,
        password: _p,
        pass: _pa,
        pwd: _pw,
        auth: _au,
        token: _to,
        debug: _de,
        ...safeParams
      } = params;

      // 3. Validação do Veículo
      const vehicleId = safeParams.vehicleId || params.vehicleId;

      // Aceitar hífens e underscores, min 3 chars
      const vehicleIdRegex = /^[A-Za-z0-9_-]{3,60}$/;

      if (!vehicleId || !vehicleIdRegex.test(vehicleId)) {
        console.warn(`[Torque] vehicleId inválido: ${vehicleId}`);
        return res.status(400).send("INVALID_ID");
      }

      // 4. Preparar Dados basicos
      const db = admin.firestore();
      const vehicleRef = db.collection("veiculos").doc(vehicleId);

      // Timestamp do registo
      const receivedAt = admin.firestore.Timestamp.now(); // Usar relógio do servidor Firestore

      // Normalização de Timestamp (Torque Pro pode enviar epoch em segundos)
      let timestamp = safeParams.time ? Number(safeParams.time) : receivedAt.toMillis();
      if (timestamp < 10000000000) {
        // Se o valor for pequeno, provavelmente está em segundos (ex: 1.6e9 vs 1.6e12)
        timestamp *= 1000;
      }
      if (timestamp && timestamp < 10000000000) {
        // Menos de 10 dígitos -> provavelmente segundos
        timestamp = timestamp * 1000;
      }

      // 5. Iniciar Transação (Concorrência Segura)
      await db.runTransaction(async (t) => {
        const vSnap = await t.get(vehicleRef);

        if (!vSnap.exists) {
          throw new Error("VEHICLE_NOT_FOUND");
        }

        const vData = vSnap.data();
        const pidMap = vData.pidMap || {};

        // Helper para extrair valor numérico com fallback
        const getVal = (fieldKey) => {
          // Helper local para parsear float aceitando virgula
          const parseNum = (v) => {
            if (v === undefined || v === null || v === "" || v === "-")
              return null;
            if (typeof v === "number") return v;
            const s = String(v).replace(",", ".");
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
          };

          // Opção 1: Mapeamento explícito no veículo
          if (pidMap[fieldKey]) {
            const val = safeParams[pidMap[fieldKey]];
            const num = parseNum(val);
            if (num !== null) return num;
          }

          // Opção 2: PIDs padrão (tenta lista de short codes)
          const defaults = DEFAULT_PIDS[fieldKey] || [];
          for (const pid of defaults) {
            const val = safeParams[pid];
            const num = parseNum(val);
            if (num !== null) return num;
          }

          // Opção 3: Procurar por nomes completos do Torque (fuzzy search)
          const fuzzyPatterns = {
            speed: ["speed", "km/h"],
            rpm: ["engine", "rpm"],
            odometer: ["odometer", "km"],
            fuelLevel: ["fuel level", "%"],
            coolant: ["coolant", "temperature"],
            intakeTemp: ["intake", "temperature"],
            maf: ["mass air flow", "g/s"],
            engineLoad: ["engine load", "%"],
            voltage: ["voltage", "v"],
            l100: ["l/100", "average"], // Generic l100

            // --- NOVOS CAMPOS (Plan v2) ---
            tripDistance: ["trip distance", "km"],
            tripL100: ["trip average", "l/100"],
            fuelUsedTrip: ["fuel used", "trip"],
            avgSpeedMoving: ["average", "speed", "moving"],
            torqueNm: ["torque", "nm"],
            hpWheels: ["horsepower", "wheels"],
            fuelRemainingPct: ["fuel remaining", "%"],
            distanceToEmptyKm: ["distance to empty", "km"],
            boost: ["boost", "pressure"],
            fuelUsedTrip: ["fuel used", "trip"],
          };

          const patterns = fuzzyPatterns[fieldKey];
          if (patterns) {
            for (const key of Object.keys(safeParams)) {
              const lowerKey = key.toLowerCase();
              if (patterns.every((p) => lowerKey.includes(p.toLowerCase()))) {
                const val = safeParams[key];
                const num = parseNum(val);
                if (num !== null) return num;
              }
            }
          }

          return null;
        };

        const parsed = {
          speed: getVal("speed"),
          rpm: getVal("rpm"),
          odometer: getVal("odometer"),
          fuelLevel: getVal("fuelLevel"),
          coolant: getVal("coolant"),
          engineLoad: getVal("engineLoad"),
          intake: getVal("intakeTemp"),
          maf: getVal("maf"),
          voltage: getVal("voltage"),
          l100: getVal("l100"),

          // Novos campos para Viagens e UI
          tripDistance: getVal("tripDistance"),
          tripL100: getVal("tripL100"),
          fuelUsedTrip: getVal("fuelUsedTrip"),
          avgSpeedMoving: getVal("avgSpeedMoving"),
          torqueNm: getVal("torqueNm"),
          hpWheels: getVal("hpWheels"),
          fuelRemainingPct: getVal("fuelRemainingPct"),
          distanceToEmptyKm: getVal("distanceToEmptyKm"),
          boost: getVal("boost"),
          fuelUsed: getVal("fuelUsedTrip"),

          location: null,
        };

        const lat = getVal("latitude");
        const lon = getVal("longitude");
        if (lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
          parsed.location = new admin.firestore.GeoPoint(lat, lon);
        }

        // Gravar Leitura (Histórico)
        const readingData = {
          vehicleId,
          timestamp,
          receivedAt,
          sessionId: safeParams.session || null,
          deviceId: safeParams.id || null,
          email: safeParams.eml || null,
          raw: safeParams, // Sem a key!
          parsed: parsed,
        };

        // Criar referência determinística robusta para evitar duplicados por retry do cliente
        const deviceId = readingData.deviceId || "nodev";
        const sessionId = readingData.sessionId || "nosession";
        const readingId = crypto
          .createHash("md5")
          .update(`${vehicleId}_${deviceId}_${sessionId}_${timestamp}`)
          .digest("hex");

        const readingRef = vehicleRef.collection("leiturasObd").doc(readingId);
        t.set(readingRef, readingData, { merge: true });

        // Agregação no Veículo
        const updates = {
          lastObdUpdate: receivedAt,
        };

        // --- Lógica de Odómetro Robusta ---
        if (
          parsed.odometer !== null &&
          !isNaN(parsed.odometer) &&
          parsed.odometer > 0
        ) {
          const currentOdo = vData.odometroAtual || 0;
          const diff = parsed.odometer - currentOdo;

          let isValidOdo = false;
          const isFirstSync = !vData.odometroAtual;

          // Regra base: não pode diminuir
          if (isFirstSync || diff >= 0) {
            isValidOdo = true;

            // Regra Anti-Salto Absoluto (>2000km)
            if (diff > 2000 && !isFirstSync) {
              console.warn(
                `[Torque] Salto odómetro excessivo (>2000km): ${diff}km`,
              );
              isValidOdo = false;
            }

            // Regra Temporal: Velocidade Implícita
            if (
              isValidOdo &&
              !isFirstSync &&
              vData.lastObdUpdate &&
              typeof vData.lastObdUpdate.toDate === "function"
            ) {
              const nowMs = receivedAt.toMillis();
              const lastMs = vData.lastObdUpdate.toDate().getTime();
              const minutesDiff = (nowMs - lastMs) / 60000;

              // Só valida se passou tempo relevante (> 6 segs / 0.1 min) E distância relevante (> 5km)
              if (minutesDiff > 0.1 && diff > 5) {
                const impliedSpeed = (diff / minutesDiff) * 60; // km/h
                if (impliedSpeed > 500) {
                  // Tolerância 500 km/h (glitches de GPS/ecu)
                  console.warn(
                    `[Torque] Salto temporal impossível: ${diff}km em ${minutesDiff.toFixed(1)}min (${impliedSpeed.toFixed(0)}km/h)`,
                  );
                  isValidOdo = false;
                }
              }
            }
          } else {
            // Ignorar silenciosamente ou warn se diminuiu
            // console.warn(...) se quisermos debug
            isValidOdo = false;
          }

          if (isValidOdo) {
            updates.odometroAtual = parsed.odometer;
          }
        } else if (
          parsed.tripDistance !== null &&
          parsed.tripDistance > 0 &&
          vData.odometroAtual > 0
        ) {
          // --- Odometer Fallback (Incremental) ---
          const lastTripDist = vData.lastTripDistance || 0;
          const currentSessionId = safeParams.session || null;
          const lastSessionId = vData.lastSessionId || null;

          // Detect session change or Torque trip reset
          if (
            currentSessionId !== lastSessionId ||
            parsed.tripDistance < lastTripDist
          ) {
            // New session or manual reset: just sync the baseline
            updates.lastTripDistance = parsed.tripDistance;
            updates.lastSessionId = currentSessionId;
          } else {
            // Same session: add delta to current odometer
            const delta = parsed.tripDistance - lastTripDist;
            if (delta > 0 && delta < 50) {
              // Safety: limit delta per reading
              updates.odometroAtual = vData.odometroAtual + delta;
              updates.lastTripDistance = parsed.tripDistance;
            }
          }
        }
        // ---------------------------------

        if (parsed.fuelLevel !== null && !isNaN(parsed.fuelLevel)) {
          updates.nivelCombustivel = parsed.fuelLevel;
        }

        if (parsed.location) {
          updates.localizacaoAtual = parsed.location;
        }

        // Feature Requested: Update Average Consumption if available (Long Term Average)
        if (parsed.l100 !== null && parsed.l100 > 0) {
          updates.consumoMedioObd = parsed.l100;
        }

        t.update(vehicleRef, updates);

        // Log para debug (mas só depois da tx ou dentro?) - dentro é ok
        console.log(
          `[Torque] UPDATE: ${vehicleId} | Odo: ${parsed.odometer} | Updates:`,
          JSON.stringify(updates),
        );
      });

      return res.status(200).send("OK");
    } catch (error) {
      if (error.message === "VEHICLE_NOT_FOUND") {
        return res.status(404).send("VEHICLE_NOT_FOUND");
      }
      console.error("[Torque] Erro interno:", error);
      return res.status(500).send("ERROR");
    }
  },
);
