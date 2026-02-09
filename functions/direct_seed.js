const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.seedRealTrip = onRequest(async (req, res) => {
  const db = admin.firestore();
  const VEHICLE_ID = "DPK7LP2GXiEibKmSQUVA";

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
    custoEstimado: 1.85,
    metricas: {
      rpmMedio: 1380,
      temperaturaMax: 78,
      velocidadeMax: 92.0,
      torqueMedio: 31.97,
      hpMedio: 6.8,
      fuelUsed: 1.105,
    },
    lastUpdate: Date.now(),
    tipo: "OBD_TRIP",
  };

  try {
    const docRef = await db
      .collection("veiculos")
      .doc(VEHICLE_ID)
      .collection("viagens")
      .add(tripData);
    res.send(`✅ Success! Trip seeded with ID: ${docRef.id}`);
  } catch (err) {
    res.status(500).send(`❌ Error: ${err.message}`);
  }
});
