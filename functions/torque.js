const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
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
  speed: ["kd"], // km/h
  rpm: ["kc"], // rpm
  odometer: ["a6", "kff1201"], // km (a6 from ECU, kff1201 from GPS/Calc)
  fuelLevel: ["2f", "k2f"], // % (2f from ECU, k2f from Torque)
  latitude: ["kff1006"],
  longitude: ["kff1005"],
  coolant: ["k5", "05"], // °C
  intakeTemp: ["kf", "0f"], // °C
  maf: ["k10", "10"], // g/s
  engineLoad: ["k4", "04"], // %
  voltage: ["k42", "42", "kff1238"], // V (Control module or Adapter)
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

      // 2. Validação de Segurança (ROBUSTA - múltiplos formatos)

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
      const providedKey =
        params.key ||
        params.password ||
        params.pass ||
        params.pwd ||
        params.auth ||
        params.token;

      // Tentar Basic Auth header como fallback
      const providedKeyFromAuth = parseBasicAuth(req);
      const finalProvidedKey = providedKey || providedKeyFromAuth;

      const validKey = apiKeySecret.value();

      // Debug mode seguro (sem desligar auth)
      const debug = params.debug === "1";
      if (debug) {
        console.log("[DEBUG] Param keys:", Object.keys(params));
        console.log("[DEBUG] Sample:", {
          vehicleId: params.vehicleId,
          hasAuthHeader: !!req.get("authorization"),
          keyLike: providedKey || providedKeyFromAuth || null,
        });
      }

      if (!finalProvidedKey || finalProvidedKey !== validKey) {
        console.warn(
          `[Torque] Acesso negado. Key inválida: ${finalProvidedKey}`,
        );
        // Log útil (sem vazar segredos)
        console.log("[Torque] Param keys recebidas:", Object.keys(params));
        console.log(
          "[Torque] Tem Authorization header?",
          !!req.get("authorization"),
        );
        return res.status(403).send("NO");
      }

      // Remover a chave dos dados a guardar (Segurança)
      const {
        key,
        password,
        pass,
        pwd,
        auth,
        token,
        debug: _,
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
      const timestamp = safeParams.time
        ? Number(safeParams.time)
        : receivedAt.toMillis(); // Usar relógio do servidor Firestore

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
            if (v === undefined || v === null || v === "") return null;
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
          l100: getVal("l100"), // <--- Extrair L100
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

        // Criar referência para novo doc na subcoleção (dentro da tx)
        const readingRef = vehicleRef.collection("leiturasObd").doc();
        t.set(readingRef, readingData);

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
        }
        // ---------------------------------

        if (parsed.fuelLevel !== null && !isNaN(parsed.fuelLevel)) {
          updates.nivelCombustivel = parsed.fuelLevel;
        }

        if (parsed.location) {
          updates.localizacaoAtual = parsed.location;
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
