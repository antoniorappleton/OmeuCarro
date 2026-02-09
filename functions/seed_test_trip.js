const admin = require("firebase-admin");

// initializeApp search for GOOGLE_APPLICATION_CREDENTIALS
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "omeucarro-d3889",
  });
}

const db = admin.firestore();

const VEHICLE_ID = "DPK7LP2GXiEibKmSQUVA";

async function seedTrip() {
  console.log("🚀 Semeando viagem de teste para o veículo:", VEHICLE_ID);

  const tripData = {
    veiculoId: VEHICLE_ID,
    dataInicio: admin.firestore.Timestamp.fromDate(
      new Date("2026-02-09T12:28:21"),
    ),
    dataFim: admin.firestore.Timestamp.fromDate(
      new Date(new Date("2026-02-09T12:28:21").getTime() + 25.17 * 60000),
    ),
    distancia: 23.12,
    duracao: 25.17,
    consumoMedio: 5.93,
    velocidadeMedia: 54.4,
    custoEstimado: 1.85, // Aproximado
    metricas: {
      rpmMedio: 1380,
      temperaturaMax: 78,
      velocidadeMax: 92.0,
      torqueMedio: 31.97,
      hpMedio: 6.8,
      fuelUsed: 1.105,
    },
    tipo: "OBD_TRIP",
  };

  try {
    const res = await db
      .collection("veiculos")
      .doc(VEHICLE_ID)
      .collection("viagens")
      .add(tripData);

    console.log("✅ Viagem criada com ID:", res.id);
    process.exit(0);
  } catch (e) {
    console.error("❌ Erro ao semear:", e);
    process.exit(1);
  }
}

seedTrip();
