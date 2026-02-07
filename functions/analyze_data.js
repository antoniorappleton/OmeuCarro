const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.analyzeData = onRequest(async (req, res) => {
  try {
    console.log("Iniciando análise de dados OBD...");
    const report = {};

    const veiculosSnap = await db.collection("veiculos").get();

    for (const doc of veiculosSnap.docs) {
      const vId = doc.id;
      const vData = doc.data();

      report[vId] = {
        nome: vData.nome || "Sem nome",
        odometro: vData.odometroAtual,
        lastUpdate: vData.lastObdUpdate ? vData.lastObdUpdate.toDate() : null,
        readingsCount: 0,
        samples: [],
        anomalies: [],
      };

      // Contar leituras e obter amostra das mais recentes
      const readingsRef = doc.ref.collection("leiturasObd");

      // Contagem (pode ser lento se forem muitos, mas para debug serve)
      const countSnap = await readingsRef.count().get();
      report[vId].readingsCount = countSnap.data().count;

      // Amostra: últimas 5
      const recentSnap = await readingsRef
        .orderBy("timestamp", "desc")
        .limit(5)
        .get();

      recentSnap.docs.forEach((r) => {
        const d = r.data();
        report[vId].samples.push({
          id: r.id,
          timestamp: d.timestamp,
          deviceId: d.deviceId,
          keys: d.parsed ? Object.keys(d.parsed) : "NO_PARSED",
          speed: d.parsed?.speed,
          rpm: d.parsed?.rpm,
          l100: d.parsed
            ? d.parsed["Trip average Litres/100 KM(l/100km)"] ||
              d.parsed.l100 ||
              "N/A"
            : "N/A",
        });
      });

      // Verificar anomalias (ex: deviceId null)
      const nullDeviceSnap = await readingsRef
        .where("deviceId", "==", null)
        .limit(1)
        .get();
      if (!nullDeviceSnap.empty) {
        report[vId].anomalies.push("Existem registos com deviceId null");
      }
    }

    res.json(report);
  } catch (error) {
    console.error("Erro na análise:", error);
    res.status(500).json({ error: error.message });
  }
});
