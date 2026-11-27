const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const { sendNotificationToUser } = require("./notify_utils");
const TripMetrics = require("./tripMetrics");
const TripDiagnostics = require("./diagnostics");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Uma sessão nova que chega até 5 min depois da última leitura da viagem ativa
// continua essa viagem (app reiniciada, troca Torque <-> Companion, ou ID de
// fallback que muda à hora certa) em vez de a partir em duas.
const CONTINUE_WINDOW_MS = 5 * 60 * 1000;

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
    const baseTripId =
      reading.sessionId ||
      `fallback_${reading.deviceId || "unknown"}_${readingDate.toISOString().split("T")[0]}_H${readingDate.getUTCHours()}`;
    const sessionKey = reading.sessionId || baseTripId;

    const result = await db.runTransaction(async (t) => {
      let tripId = baseTripId;
      let tripDocRef = tripRef.doc(tripId);
      let tripDoc = await t.get(tripDocRef);
      let tripData = tripDoc.exists ? tripDoc.data() : null;
      let vehicleData = null;

      if (tripData?.tripFinalizadaEm) {
        const vehicleSnap = await t.get(vehicleRef);
        vehicleData = vehicleSnap.exists ? vehicleSnap.data() : {};
        const activeTripId =
          vehicleData.activeObdSessionKey === sessionKey
            ? vehicleData.activeObdTripId
            : null;
        if (activeTripId && activeTripId !== baseTripId) {
          const activeTripRef = tripRef.doc(activeTripId);
          const activeTripDoc = await t.get(activeTripRef);
          if (
            activeTripDoc.exists &&
            !activeTripDoc.data().tripFinalizadaEm
          ) {
            tripId = activeTripId;
            tripDocRef = activeTripRef;
            tripDoc = activeTripDoc;
            tripData = activeTripDoc.data();
          }
        }
        if (tripData?.tripFinalizadaEm) {
          tripId = `${baseTripId}_part_${timestamp}`;
          tripDocRef = tripRef.doc(tripId);
          tripDoc = await t.get(tripDocRef);
          tripData = tripDoc.exists ? tripDoc.data() : null;
        }
      }

      if (!tripDoc.exists) {
        if (!vehicleData) {
          const vehicleSnap = await t.get(vehicleRef);
          vehicleData = vehicleSnap.exists ? vehicleSnap.data() : {};
        }
        const activeId = vehicleData.activeObdTripId;
        if (activeId && activeId !== tripId) {
          const activeRef = tripRef.doc(activeId);
          const activeDoc = await t.get(activeRef);
          const active = activeDoc.exists ? activeDoc.data() : null;
          if (
            active &&
            !active.tripFinalizadaEm &&
            Math.abs(timestamp - Number(active.lastUpdate || 0)) <= CONTINUE_WINDOW_MS
          ) {
            tripId = activeId;
            tripDocRef = activeRef;
            tripDoc = activeDoc;
            tripData = active;
          }
        }
      }

      let isNewTrip = !tripDoc.exists;

      if (tripData && !reading.sessionId) {
        const minutesDiff = (timestamp - (tripData.lastUpdate || 0)) / 60000;
        if (minutesDiff > 15) isNewTrip = true;
      }

      // Não criar lixo com leituras de motor desligado
      if (isNewTrip && rpm === 0 && speed === 0) {
        return { action: "skip", tripId };
      }

      let state;
      let meta = null;
      if (isNewTrip || !tripData.acc) {
        if (!vehicleData) {
          const vehicleSnap = await t.get(vehicleRef);
          vehicleData = vehicleSnap.exists ? vehicleSnap.data() : {};
        }
        meta = {
          fuelType: vehicleData.tipoCombustivel || vehicleData.combustivelPadrao || null,
          refL100: vehicleData.consumoMedio || vehicleData.consumoMedioObd || null,
        };
        state = TripMetrics.createState(meta);
      } else {
        state = tripData.acc;
      }

      TripMetrics.step(state, reading);
      const sum = TripMetrics.summarize(state);
      const fields = TripMetrics.toTripFields(sum);

      // Uma viagem pode juntar várias sessões; com mais de uma, sessionId fica
      // null e a finalização lê as leituras pela janela temporal.
      const previousSessions = isNewTrip
        ? []
        : tripData.sessionIds || (tripData.sessionId ? [tripData.sessionId] : []);
      const sessionIds = [
        ...new Set([...previousSessions, ...(reading.sessionId ? [reading.sessionId] : [])]),
      ];
      const doc = {
        ...fields,
        acc: state,
        dataInicio: Timestamp.fromMillis(state.firstTs),
        dataFim: Timestamp.fromMillis(state.lastTs),
        lastUpdate: state.lastTs,
        origem: "torque-auto",
        sessionIds,
        sessionId: sessionIds.length === 1 ? sessionIds[0] : null,
        deviceId: (isNewTrip ? null : tripData.deviceId) || reading.deviceId || null,
      };
      if (isNewTrip) doc.notified = false;

      // Sem merge: a viagem é inteiramente descrita pelo acumulado
      // (preserva só a flag de notificação de uma viagem existente).
      if (!isNewTrip && tripData.notified) doc.notified = true;
      t.set(tripDocRef, doc);

      const vehicleUpdate = {
        ultimasMetricas: {
          distancia: fields.distancia,
          consumoMedio: fields.consumoMedio,
          lastUpdate: state.lastTs,
          sessionId: reading.sessionId || null,
        },
      };
      if (isNewTrip) {
        vehicleUpdate.activeObdSessionKey = sessionKey;
        vehicleUpdate.activeObdTripId = tripId;
      }
      t.set(vehicleRef, vehicleUpdate, { merge: true });

      return { action: isNewTrip ? "created" : "updated", tripId };
    });

    if (result.action === "created") {
      await updateVehicleObdProfile(vehicleId);
      await finalizePreviousTrip(vehicleId, result.tripId);
      await notifyPreviousTrip(vehicleId, result.tripId);
    }
    return null;
  },
);

async function finalizePreviousTrip(vehicleId, currentTripId) {
  const tripsRef = db.collection("veiculos").doc(vehicleId).collection("viagens");
  const recentSnap = await tripsRef.orderBy("dataFim", "desc").limit(6).get();
  const previousDoc = recentSnap.docs.find(
    (tripDoc) => tripDoc.id !== currentTripId && !tripDoc.data().diagnosticoProcessadoEm,
  );
  if (!previousDoc) return;

  await finalizeTrip(vehicleId, previousDoc, recentSnap, null, currentTripId);
}

async function finalizeTrip(
  vehicleId,
  targetDoc,
  recentSnap,
  existingVehicleSnap,
  excludeTripId,
) {
  const vehicleRef = db.collection("veiculos").doc(vehicleId);
  const [vehicleSnap, baselineSnap] = await Promise.all([
    existingVehicleSnap || vehicleRef.get(),
    vehicleRef.collection("baselines").get(),
  ]);
  if (!vehicleSnap.exists) return null;

  const previousDoc = targetDoc;
  const previousTrip = previousDoc.data();
  if (previousTrip.diagnosticoProcessadoEm) {
    if (!previousTrip.tripFinalizadaEm) {
      await previousDoc.ref.update({
        tripFinalizadaEm: Timestamp.now(),
      });
    }
    return {
      tripId: previousDoc.id,
      alreadyFinalized: true,
      estado: previousTrip.diagnostico?.estado || "indisponivel",
      achados: previousTrip.diagnostico?.achados?.length || 0,
    };
  }

  if (!recentSnap) {
    recentSnap = await vehicleRef
      .collection("viagens")
      .orderBy("dataFim", "desc")
      .limit(6)
      .get();
  }
  const start = previousTrip.dataInicio?.toMillis?.() ?? previousTrip.lastUpdate;
  const end = previousTrip.dataFim?.toMillis?.() ?? previousTrip.lastUpdate;
  if (!Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) {
    throw new Error(`Intervalo inválido para finalizar viagem ${previousDoc.id}`);
  }

  const readingsRef = vehicleRef.collection("leiturasObd");
  const readingQuery = previousTrip.sessionId
    ? readingsRef.where("sessionId", "==", previousTrip.sessionId)
    : readingsRef
        .where("timestamp", ">=", Number(start))
        .where("timestamp", "<=", Number(end))
        .orderBy("timestamp");
  const readingsSnap = await readingQuery.get();
  const readings = readingsSnap.docs
    .map((readingDoc) => readingDoc.data())
    .filter((reading) => {
      const timestamp = Number(reading.timestamp);
      return (
        timestamp >= Number(start) &&
        timestamp <= Number(end) &&
        (!previousTrip.sessionId || reading.sessionId === previousTrip.sessionId)
      );
    });

  const baselines = {};
  baselineSnap.docs.forEach((baselineDoc) => {
    baselines[baselineDoc.id] = baselineDoc.data();
  });
  const recentTrips = recentSnap.docs
    .filter(
      (tripDoc) =>
        tripDoc.id !== previousDoc.id && tripDoc.id !== excludeTripId,
    )
    .map((tripDoc) => tripDoc.data());
  const vehicle = vehicleSnap.data();
  const result = TripDiagnostics.analyzeTrip(readings, {
    fuelType: vehicle.tipoCombustivel || vehicle.combustivelPadrao || null,
    baselines,
    recentTrips,
  });
  const { summary, ...diagnostic } = result;
  const tripForBaseline = {
    ...previousTrip,
    qualidadeDados: result.qualidadeDados,
    diagnostico: diagnostic,
  };
  const validTripCount = [
    tripForBaseline,
    ...recentTrips.filter((trip) => trip.qualidadeDados?.estado === "suficiente"),
  ].filter(
    (trip) =>
      trip.qualidadeDados?.estado === "suficiente" &&
      Number(trip.diagnostico?.metrics?.motorQuenteMin) >= 5 &&
      !trip.diagnostico?.achados?.some(
        (finding) => finding.severidade === "critico",
      ),
  ).length;

  diagnostic.aprendizagem = diagnostic.aprendizagem.map((item) => ({
    ...item,
    viagensValidas: validTripCount,
    minimo: 5,
    mensagem: `A aprender o seu carro (${Math.min(validTripCount, 5)}/5 viagens válidas).`,
  }));
  await previousDoc.ref.update({
    qualidadeDados: result.qualidadeDados,
    diagnostico: diagnostic,
    diagnosticoProcessadoEm: Timestamp.now(),
    tripFinalizadaEm: Timestamp.now(),
  });

  if (baselineSnap.empty) {
    const baselineResult = TripDiagnostics.calculateBaselines(
      [tripForBaseline, ...recentTrips],
      { createdAt: Timestamp.now() },
    );
    if (baselineResult.ready) {
      const batch = db.batch();
      Object.entries(baselineResult.documents).forEach(([metricBand, data]) => {
        batch.set(vehicleRef.collection("baselines").doc(metricBand), data);
      });
      await batch.commit();
    }
  }
  return {
    tripId: previousDoc.id,
    alreadyFinalized: false,
    estado: diagnostic.estado,
    achados: diagnostic.achados.length,
  };
}

exports.finalizeCurrentVehicleTrip = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
  }
  const vehicleId = String(request.data?.vehicleId || "");
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(vehicleId)) {
    throw new HttpsError("invalid-argument", "Identificador de veículo inválido.");
  }

  const vehicleRef = db.collection("veiculos").doc(vehicleId);
  const vehicleSnap = await vehicleRef.get();
  if (!vehicleSnap.exists || vehicleSnap.data().userId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Veículo não encontrado ou sem acesso.");
  }

  const tripsRef = vehicleRef.collection("viagens");
  const [recentSnap, latestReadingSnap] = await Promise.all([
    tripsRef.orderBy("dataFim", "desc").limit(6).get(),
    vehicleRef.collection("leiturasObd")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get(),
  ]);
  const currentTrip = recentSnap.docs[0];
  if (!currentTrip || currentTrip.data().origem !== "torque-auto") {
    throw new HttpsError(
      "failed-precondition",
      "Não há uma viagem OBD automática recente para finalizar.",
    );
  }

  const tripData = currentTrip.data();
  const latestReading = latestReadingSnap.docs[0]?.data();
  const sameSession = tripData.sessionId
    ? latestReading?.sessionId === tripData.sessionId
    : latestReading?.deviceId === tripData.deviceId;
  if (
    sameSession &&
    Number(latestReading.timestamp) > Number(tripData.lastUpdate)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Ainda há leituras OBD a processar. Aguarda alguns segundos e tenta novamente.",
    );
  }

  await vehicleRef.set(
    {
      activeObdSessionKey: tripData.sessionId || currentTrip.id,
      activeObdTripId: currentTrip.id,
    },
    { merge: true },
  );
  const result = await finalizeTrip(
    vehicleId,
    currentTrip,
    recentSnap,
    vehicleSnap,
  );
  return result;
});

exports.recalculateVehicleBaselines = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
  }
  const vehicleId = String(request.data?.vehicleId || "");
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(vehicleId)) {
    throw new HttpsError("invalid-argument", "Identificador de veículo inválido.");
  }

  const vehicleRef = db.collection("veiculos").doc(vehicleId);
  const vehicleSnap = await vehicleRef.get();
  if (!vehicleSnap.exists || vehicleSnap.data().userId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Veículo não encontrado ou sem acesso.");
  }

  const tripsSnap = await vehicleRef
    .collection("viagens")
    .orderBy("dataFim", "desc")
    .limit(50)
    .get();
  const baselineResult = TripDiagnostics.calculateBaselines(
    tripsSnap.docs.map((tripDoc) => tripDoc.data()),
    { createdAt: Timestamp.now() },
  );
  if (!baselineResult.ready) {
    throw new HttpsError(
      "failed-precondition",
      `São necessárias pelo menos 5 viagens válidas; foram encontradas ${baselineResult.validTripCount}.`,
    );
  }
  if (Object.keys(baselineResult.documents).length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "As viagens válidas não contêm métricas OBD comparáveis para criar uma baseline.",
    );
  }

  const baselinesRef = vehicleRef.collection("baselines");
  const existingSnap = await baselinesRef.get();
  const batch = db.batch();
  existingSnap.docs.forEach((baselineDoc) => batch.delete(baselineDoc.ref));
  Object.entries(baselineResult.documents).forEach(([metricBand, data]) => {
    batch.set(baselinesRef.doc(metricBand), data);
  });
  await batch.commit();
  return {
    validTripCount: baselineResult.validTripCount,
    recalculadaEm: Timestamp.now().toMillis(),
  };
});

async function updateVehicleObdProfile(vehicleId) {
  const vehicleRef = db.collection("veiculos").doc(vehicleId);
  const trips = await vehicleRef
    .collection("viagens")
    .orderBy("dataFim", "desc")
    .limit(10)
    .get();
  const profile = TripMetrics.aggregateObdProfile(
    trips.docs.map((doc) => doc.data()),
  );
  await vehicleRef.set({ obdProfile: profile }, { merge: true });
}

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
