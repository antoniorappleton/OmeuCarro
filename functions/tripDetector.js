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

    // Extrair Métricas Chave
    const speed = Number(findKey(parsed, "Speed") || 0);
    const rpm = Number(findKey(parsed, "RPM") || 0);
    const tripDist = Number(findKey(parsed, "Trip Distance") || 0);
    const tripL100 = Number(findKey(parsed, "Trip average", "l/100") || 0);
    const coolant = Number(findKey(parsed, "Coolant") || -999);

    // Ignorar leituras sem dados relevantes (motor desligado e sem movimento)
    // Mas cuidado: podemos querer registar o fim da viagem onde RPM=0.
    // Vamos aceitar tudo por enquanto, mas marcar 'movement' flag.
    const isMoving = speed > 0 || rpm > 0;

    const tripRef = db
      .collection("veiculos")
      .doc(vehicleId)
      .collection("viagens");

    // 1. Buscar a ÚLTIMA viagem registada (ativa ou não)
    const lastTripQuery = await tripRef
      .orderBy("lastUpdate", "desc")
      .limit(1)
      .get();

    let currentTrip = null;
    let isNewTrip = false;

    if (!lastTripQuery.empty) {
      currentTrip = lastTripQuery.docs[0];
    }

    // 2. Decidir se cria NOVA ou ATUALIZA
    if (currentTrip) {
      const tripData = currentTrip.data();
      const lastUpdate = tripData.lastUpdate || 0;
      const timeDiff = timestamp - lastUpdate;
      const minutesDiff = timeDiff / (1000 * 60);

      // REGRA 1: Tempo (> 15 min de intervalo = nova viagem)
      if (minutesDiff > 15) {
        isNewTrip = true;
      }

      // REGRA 2: Reset do Torque (Trip Distance ficou menor que anterior drasticamente)
      // Ex: Estava em 50km, passou para 0.1km
      if (
        !isNewTrip &&
        tripDist < (tripData.distanciaMax || 0) &&
        tripDist < 1.0 &&
        (tripData.distanciaMax || 0) > 2.0
      ) {
        console.log(
          `[TripDetector] Reset detectado: Dist ${tripData.distanciaMax} -> ${tripDist}`,
        );
        isNewTrip = true;
      }

      // Proteção contra out-of-order (leituras antigas que chegam tarde)
      if (!isNewTrip && timestamp < lastUpdate) {
        console.log(
          `[TripDetector] Leitura antiga ignorada: ${timestamp} < ${lastUpdate}`,
        );
        return null;
      }
    } else {
      isNewTrip = true;
    }

    // Se a leitura é isolada e sem movimento (ex: ligou ignição 1 min e desligou),
    // e é uma NOVA viagem, talvez não devamos criar lixo?
    // Politica: Criar se tiver RPM > 0 (motor ligado)
    if (isNewTrip && rpm === 0 && speed === 0) {
      console.log(`[TripDetector] Ignorado: Nova viagem sem motor ligado.`);
      return null;
    }

    // 3. Executar Ação
    if (isNewTrip) {
      // Finalizar a anterior (opcional, só para garantir consistência visual se quisermos flag 'closed')
      // Na verdade, a "Lazy" logic não precisa fechar explicitamente, só cria a nova.

      // Criar NOVA
      const newTripData = {
        dataInicio: admin.firestore.Timestamp.fromMillis(timestamp),
        dataFim: admin.firestore.Timestamp.fromMillis(timestamp),
        lastUpdate: timestamp,

        // Totais
        distancia: tripDist, // Valor final acumulado
        distanciaMax: tripDist, // Auxiliar para detetar resets
        duracao: 0, // min

        // Médias (Inicial)
        velocidadeMedia: speed,
        consumoMedio: tripL100,

        // Métricas Agregadas
        metricas: {
          rpmMedio: rpm,
          rpmMax: rpm,
          velocidadeMax: speed,
          temperaturaMax: coolant > -100 ? coolant : null,
          count: 1, // para médias ponderadas
        },

        origem: "torque-auto",
      };

      await tripRef.add(newTripData);
      console.log(`[TripDetector] Nova viagem criada.`);
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

      const updates = {
        dataFim: admin.firestore.Timestamp.fromMillis(timestamp),
        lastUpdate: timestamp,
        duracao: Math.round(duracaoMin), // min

        // Se o tripDist do Torque for confiável e crescente, usamos ele direto.
        // Se for 0 (erro de leitura), mantemos o anterior.
        distancia:
          tripDist > tripData.distanciaMax ? tripDist : tripData.distancia,
        distanciaMax: Math.max(tripData.distanciaMax || 0, tripDist),

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
    }

    return null;
  },
);
