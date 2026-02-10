const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Processa cada leitura OBD para criar ou atualizar o registo de viagens.
 * Estratégia: "Lazy Finalization"
 * - Se a leitura for > 15min após a última atualização da viagem atual -> Cria NOVA viagem.
 * - Caso contrário -> Atualiza a viagem existente.
 */
exports.processOBDReading = onDocumentCreated(
  "veiculos/{vehicleId}/leiturasObd/{readingId}",
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log("No data associated with the event");
      return;
    }
    const vehicleId = event.params.vehicleId;
    const reading = snap.data();
    const parsed = reading.parsed || {};
    console.log(
      `[TripDetector] Extracted keys: ${Object.keys(parsed).join(", ")}`,
    );

    // Validar timestamp
    const timestamp = reading.timestamp || Date.now();
    const readingDate = new Date(timestamp);

    // Helpers para extrair dados fuzzy
    const findKey = (obj, ...parts) => {
      const keys = Object.keys(obj);
      for (const k of keys) {
        const lower = k.toLowerCase();
        if (parts.every((p) => lower.includes(p.toLowerCase()))) return obj[k];
      }
      return null; // ou undefined
    };

    // Extrair Métricas Chave (Preferir campos normalizados do Torque.js fixes)
    const rpm = reading.parsed?.rpm || 0;
    const speed = reading.parsed?.speed || 0;
    const coolant = reading.parsed?.coolant || -999;
    const tripDist = reading.parsed?.tripDistance || 0;
    const tripL100 = reading.parsed?.tripL100 || 0;


    const tripRef = db
      .collection("veiculos")
      .doc(vehicleId)
      .collection("viagens");

    // 1. Decidir Ancoragem da Viagem (Sessão Determinística > Janela de Tempo)
    let currentTrip = null;
    let isNewTrip = false;
    const tripId =
      reading.sessionId ||
      `fallback_${reading.deviceId || "unknown"}_${readingDate.toISOString().split("T")[0]}_H${readingDate.getUTCHours()}`;

    // Tentar obter o documento diretamente (DETERMINÍSTICO)
    const tripDoc = await tripRef.doc(tripId).get();

    if (tripDoc.exists) {
      currentTrip = tripDoc;
      console.log(`[TripDetector] Viagem existente encontrada (ID: ${tripId})`);
    }

    // 2. Decidir se cria NOVA ou ATUALIZA
    if (currentTrip) {
      const tripData = currentTrip.data();
      const lastUpdate = tripData.lastUpdate || 0;
      const timeDiff = timestamp - lastUpdate;
      const minutesDiff = timeDiff / (1000 * 60);

      // REGRA 1: Tempo (> 15 min de intervalo)
      // "Pro" logic: Se houver sessionId, o documento já existe e nunca criamos "isNewTrip" no mesmo ID.
      // Se não houver sessionId (fallback), respeitamos os 15 min.
      if (!reading.sessionId && minutesDiff > 15) {
        isNewTrip = true;
      }

      // REGRA 2: Reset do Torque (Trip Distance ficou menor que anterior drasticamente)
      // "Pro" logic: Se for a mesma sessão, NÃO criamos nova viagem.
      // Apenas detetamos o reset para gerir o acumulado (distanciaMax).
      if (
        !isNewTrip &&
        !reading.sessionId && // Só reinicia em nova viagem se não houver sessão tracking
        tripDist < (tripData.lastTripDistSeen || 0) &&
        tripDist < 1.0 &&
        (tripData.lastTripDistSeen || 0) > 2.0
      ) {
        isNewTrip = true;
      }

      // Proteção contra out-of-order (leituras antigas que chegam tarde)
      if (!isNewTrip && timestamp < lastUpdate) {
        return null;
      }
    } else {
      isNewTrip = true;
    }

    // Se a leitura é isolada e sem movimento (ex: ligou ignição 1 min e desligou),
    // e é uma NOVA viagem, talvez não devamos criar lixo?
    // Politica: Criar se tiver RPM > 0 (motor ligado)
    if (isNewTrip && rpm === 0 && speed === 0) {
      return null;
    }

    // 3. Executar Ação
    if (isNewTrip) {
      const newTripData = {
        dataInicio: admin.firestore.Timestamp.fromMillis(timestamp),
        dataFim: admin.firestore.Timestamp.fromMillis(timestamp),
        lastUpdate: timestamp,

        // Totais
        distancia: tripDist,
        lastTripDistSeen: tripDist, // NEW: Track last seen for delta calc
        duracao: 0,

        // Médias (Inicial)
        velocidadeMedia: speed,
        consumoMedio: tripL100,

        // Métricas Agregadas
        metricas: {
          rpmMedio: rpm,
          rpmMax: rpm,
          velocidadeMax: speed,
          temperaturaMax: coolant > -100 ? coolant : null,
          count: 1,
        },

        origem: "torque-auto",
        sessionId: reading.sessionId || null,
        deviceId: reading.deviceId || null,
      };

      await tripRef.doc(tripId).set(newTripData, { merge: true });
      console.log(`[TripDetector] Viagem ${tripId} processada (Merge Mode).`);

      // Sync to Vehicle Profile
      await db
        .collection("veiculos")
        .doc(vehicleId)
        .set(
          {
            ultimasMetricas: {
              distancia: tripDist,
              consumoMedio: tripL100,
              lastUpdate: timestamp,
              sessionId: reading.sessionId || null,
            },
          },
          { merge: true },
        );
    } else {
      // Atualizar EXISTENTE
      const tripData = currentTrip.data();
      const oldMetricas = tripData.metricas || {};
      const count = (oldMetricas.count || 0) + 1;

      // Atualizar médias ponderadas (aproximação simples)
      // V_nova_media = ((V_velha * N) + V_nova) / (N + 1)
      const updateAvg = (oldAvg, newVal) =>
        ((oldAvg || 0) * (count - 1) + newVal) / count;

      // Dados de tempo
      const dataInicio = tripData.dataInicio.toMillis();
      const duracaoMin = (timestamp - dataInicio) / (1000 * 60);

      // Lógica Pro: Acumular distância por deltas para resistir a resets do sensor/app
      // delta = leitura_atual - ultima_leitura_vista (se > 0)
      let deltaKm = 0;
      const lastSeen = tripData.lastTripDistSeen || 0;
      if (tripDist > lastSeen) {
        deltaKm = tripDist - lastSeen;
      } else if (tripDist < lastSeen && tripDist < 1.0) {
        // Reset detetado! Usamos o valor atual como o novo delta inicial
        deltaKm = tripDist;
      }

      const updates = {
        dataFim: admin.firestore.Timestamp.fromMillis(timestamp),
        lastUpdate: timestamp,
        duracao: Math.round(duracaoMin), // min
        lastTripDistSeen: tripDist,
        distancia: (tripData.distancia || 0) + deltaKm,

        // Médias diretas do Torque são preferíveis se existirem (tripL100)
        // Se o Torque mandar Trip Average, usamos.
        consumoMedio: tripL100 > 0 ? tripL100 : tripData.consumoMedio,

        // Mas velocidade média o Torque as vezes falha, podemos ponderar ou usar torque
        // Vamos ponderar a nossa para ter certeza
        velocidadeMedia: updateAvg(tripData.velocidadeMedia, speed),

        metricas: {
          rpmMedio: updateAvg(oldMetricas.rpmMedio, rpm),
          rpmMax: Math.max(oldMetricas.rpmMax || 0, rpm),
          velocidadeMax: Math.max(oldMetricas.velocidadeMax || 0, speed),
          temperaturaMax: Math.max(oldMetricas.temperaturaMax || -99, coolant),
          count: count,
        },
      };

      await currentTrip.ref.update(updates);

      // Sync to Vehicle Profile
      await db
        .collection("veiculos")
        .doc(vehicleId)
        .set(
          {
            ultimasMetricas: {
              distancia: updates.distancia,
              consumoMedio: updates.consumoMedio,
              lastUpdate: timestamp,
              sessionId: reading.sessionId || null,
            },
          },
          { merge: true },
        );
    }

    return null;
  },
);
