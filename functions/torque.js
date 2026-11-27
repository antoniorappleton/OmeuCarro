const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { defineSecret } = require("firebase-functions/params");
const { evaluateRealtime } = require("./diagnostics");
const {
  normalizeTimestamp,
  parseTorquePayload,
} = require("./torqueParser");

// Garantir inicialização do admin
if (!admin.apps.length) admin.initializeApp();

// Definir o segredo para a chave de upload
// NOTA: É necessário criar este segredo no Firebase: firebase functions:secrets:set TORQUE_UPLOAD_KEY
// Para emuladores locais, criar um ficheiro .secret.local na pasta functions
const apiKeySecret = defineSecret("TORQUE_UPLOAD_KEY");

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

      const timestamp = normalizeTimestamp(
        safeParams.time,
        receivedAt.toMillis(),
      );

      // 5. Iniciar Transação (Concorrência Segura)
      const notifications = await db.runTransaction(async (t) => {
        const vSnap = await t.get(vehicleRef);

        if (!vSnap.exists) {
          throw new Error("VEHICLE_NOT_FOUND");
        }

        const vData = vSnap.data();
        const pidMap = vData.pidMap || {};

        const { parsed, latitude: lat, longitude: lon } =
          parseTorquePayload(safeParams, pidMap);
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

        const alertResult = evaluateRealtime(
          parsed,
          vData.alertState || {},
          timestamp,
          vData.nome || "veículo",
        );
        updates.alertState = alertResult.state;

        // --- Lógica de Odómetro Robusta ---
        if (
          parsed.odometer !== null &&
          !isNaN(parsed.odometer) &&
          parsed.odometer > 0
        ) {
          // --- Opção A: Odómetro Absoluto (ECU) ---
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

              if (minutesDiff > 0.1 && diff > 5) {
                const impliedSpeed = (diff / minutesDiff) * 60;
                if (impliedSpeed > 500) {
                  console.warn(
                    `[Torque] Salto temporal impossível: ${diff}km em ${minutesDiff.toFixed(1)}min (${impliedSpeed.toFixed(0)}km/h)`,
                  );
                  isValidOdo = false;
                }
              }
            }
          }

          if (isValidOdo) {
            updates.odometroAtual = parsed.odometer;
            console.log(`[Torque] Odo Absoluto (ECU): ${parsed.odometer}`);
          }
        } else if (
          parsed.tripDistance !== null &&
          parsed.tripDistance > 0 &&
          vData.odometroAtual > 0 &&
          safeParams.session // SEGURANÇA: Só incremental se houver sessão
        ) {
          // --- Opção B: Odómetro Incremental (Trip Distance) ---
          const lastTripDist = vData.lastTripDistance || 0;
          const currentSessionId = safeParams.session;
          const lastSessionId = vData.lastSessionId || null;

          if (currentSessionId !== lastSessionId) {
            // Mudança de sessão: apenas sincronizamos o baseline
            console.log(
              `[Torque] Nova Sessão (${currentSessionId}). Baseline: ${parsed.tripDistance}km`,
            );
            updates.lastTripDistance = parsed.tripDistance;
            updates.lastSessionId = currentSessionId;
          } else {
            // Mesma sessão: calcular delta
            if (parsed.tripDistance < lastTripDist) {
              // Torque resetou a viagem no meio da sessão? Apenas sincronizamos o novo valor.
              console.warn(
                `[Torque] Reset de Trip inesperado na sessão ${currentSessionId}: ${lastTripDist} -> ${parsed.tripDistance}`,
              );
              updates.lastTripDistance = parsed.tripDistance;
            } else {
              const delta = parsed.tripDistance - lastTripDist;
              // Segurança: delta razoável por leitura (5 segundos = max 0.5km @ 360km/h)
              if (delta > 0 && delta < 5) {
                updates.odometroAtual = vData.odometroAtual + delta;
                updates.lastTripDistance = parsed.tripDistance;
                // console.log(`[Torque] Odo Incremental: +${delta.toFixed(3)}km -> ${updates.odometroAtual.toFixed(1)}`);
              }
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
        return {
          userId: vData.userId,
          alerts: alertResult.notifications,
        };
      });

      await Promise.all(
        notifications.alerts.map((alert) =>
          sendNotificationToUser(notifications.userId, alert.title, alert.body, {
            veiculoId: vehicleId,
            type: "alarm",
            ruleId: alert.ruleId,
            url: `/pages/veiculo.html?id=${vehicleId}`,
          }).catch((error) =>
            console.error(`[FCM Alarm Error] ${alert.ruleId}:`, error),
          ),
        ),
      );

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
