const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { sendNotificationToUser } = require("./notify_utils");
const TripMetrics = require("./tripMetrics");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * Processa cada leitura OBD para criar ou atualizar o registo de viagens.
 *
 * - Viagem ancorada no sessionId do Torque (determinístico). Sem sessão, usa um
 *   ID por dispositivo/hora e abre nova viagem após 15 min sem dados.
 * - As métricas (distância integrada pela velocidade, ralenti, eventos bruscos,
 *   consumo estimado, score) são acumuladas em `acc` com TripMetrics.step(),
 *   o mesmo código que a app usa no visor ao vivo e para recalcular viagens.
 * - Atualização dentro de transação: leituras chegam quase em simultâneo e o
 *   acumulado não pode perder incrementos.
 */
exports.processOBDReading = onDocumentCreated(
  "veiculos/{vehicleId}/leiturasObd/{readingId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const vehicleId = event.params.vehicleId;
    const reading = snap.data();

    // Importações em massa são tratadas pelo cliente
    if (reading.imported) return null;

    const parsed = reading.parsed || {};
    const timestamp = reading.timestamp || Date.now();
    const readingDate = new Date(timestamp);
    const rpm = parsed.rpm || 0;
    const speed = parsed.speed || 0;

    const vehicleRef = db.collection("veiculos").doc(vehicleId);
    const tripRef = vehicleRef.collection("viagens");
    const tripId =
      reading.sessionId ||
      `fallback_${reading.deviceId || "unknown"}_${readingDate.toISOString().split("T")[0]}_H${readingDate.getUTCHours()}`;
    const tripDocRef = tripRef.doc(tripId);

    const result = await db.runTransaction(async (t) => {
      const tripDoc = await t.get(tripDocRef);
      let isNewTrip = !tripDoc.exists;
      const tripData = tripDoc.exists ? tripDoc.data() : null;

      if (tripData && !reading.sessionId) {
        const minutesDiff = (timestamp - (tripData.lastUpdate || 0)) / 60000;
        if (minutesDiff > 15) isNewTrip = true;
      }

      // Não criar lixo com leituras de motor desligado
      if (isNewTrip && rpm === 0 && speed === 0) return { action: "skip" };

      let state;
      let meta = null;
      if (isNewTrip || !tripData.acc || tripData.acc.v !== TripMetrics.VERSION) {
        const vSnap = await t.get(vehicleRef);
        const v = vSnap.exists ? vSnap.data() : {};
        meta = {
          fuelType: v.tipoCombustivel || v.combustivelPadrao || null,
          refL100: v.consumoMedio || v.consumoMedioObd || null,
        };
        state = TripMetrics.createState(meta);
      } else {
        state = tripData.acc;
      }

      TripMetrics.step(state, reading);
      const sum = TripMetrics.summarize(state);
      const fields = TripMetrics.toTripFields(sum);

      const doc = {
        ...fields,
        acc: state,
        dataInicio: admin.firestore.Timestamp.fromMillis(state.firstTs),
        dataFim: admin.firestore.Timestamp.fromMillis(state.lastTs),
        lastUpdate: state.lastTs,
        origem: "torque-auto",
        sessionId: reading.sessionId || null,
        deviceId: reading.deviceId || null,
      };
      if (isNewTrip) doc.notified = false;

      // Sem merge: a viagem é inteiramente descrita pelo acumulado
      // (preserva só a flag de notificação de uma viagem existente).
      if (!isNewTrip && tripData.notified) doc.notified = true;
      t.set(tripDocRef, doc);

      t.set(
        vehicleRef,
        {
          ultimasMetricas: {
            distancia: fields.distancia,
            consumoMedio: fields.consumoMedio,
            lastUpdate: state.lastTs,
            sessionId: reading.sessionId || null,
          },
        },
        { merge: true },
      );

      return { action: isNewTrip ? "created" : "updated" };
    });

    if (result.action === "created") {
      await notifyPreviousTrip(vehicleId, tripId);
    }
    return null;
  },
);

// Ao começar uma viagem nova, envia o resumo da anterior (uma vez).
async function notifyPreviousTrip(vehicleId, currentTripId) {
  try {
    const tripRef = db.collection("veiculos").doc(vehicleId).collection("viagens");
    const lastTrips = await tripRef.orderBy("dataFim", "desc").limit(3).get();
    const prevTripDoc = lastTrips.docs.find((d) => d.id !== currentTripId);
    if (!prevTripDoc) return;
    const prevTrip = prevTripDoc.data();
    if (prevTrip.notified || !(prevTrip.distancia > 0.1)) return;

    const userId = (await db.collection("veiculos").doc(vehicleId).get()).data()?.userId;
    const dist = prevTrip.distancia.toFixed(1);
    const cons = prevTrip.consumoMedio
      ? `${prevTrip.consumoFonte === "estimativa" ? "~" : ""}${prevTrip.consumoMedio.toFixed(1)} L/100`
      : null;
    const parts = [`Percorreu ${dist} km em ${Math.round(prevTrip.duracao || 0)} min`];
    if (cons) parts.push(`média ${cons}`);
    if (prevTrip.score != null) parts.push(`score ${prevTrip.score}`);

    await sendNotificationToUser(userId, "🏁 Viagem Concluída", parts.join(" · ") + ".", {
      url: `/pages/veiculo.html?id=${vehicleId}`,
      tripId: prevTripDoc.id,
    });
    await prevTripDoc.ref.update({ notified: true });
  } catch (e) {
    console.error("[TripDetector] Erro ao enviar resumo de viagem:", e);
  }
}
