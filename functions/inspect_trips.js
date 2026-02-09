const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.inspectTrips = onRequest(async (req, res) => {
  const db = admin.firestore();

  const vSnap = await db.collection("veiculos").get();
  let summary = `🔍 Diagnóstico de Viagens\n`;
  summary += `Total de Veículos: ${vSnap.docs.length}\n\n`;

  for (const vDoc of vSnap.docs) {
    const vId = vDoc.id;
    const vName = vDoc.data().nome || "Sem nome";
    const vData = vDoc.data();
    summary += `--- Veículo: ${vId} (${vName}) ---\n`;
    summary += `Profile: Odo ${vData.odometroAtual || "N/A"}km, Fuel ${vData.nivelCombustivel || "N/A"}%\n`;
    if (vData.ultimasMetricas) {
      summary += `Sync: ${JSON.stringify(vData.ultimasMetricas)}\n`;
    }

    const tripsSnap = await vDoc.ref
      .collection("viagens")
      .orderBy("dataInicio", "desc")
      .get();
    summary += `Total de Viagens: ${tripsSnap.docs.length}\n`;

    tripsSnap.docs.forEach((tDoc) => {
      const t = tDoc.data();
      const start = t.dataInicio ? t.dataInicio.toDate().toISOString() : "NADA";
      summary += `  • [${tDoc.id}] ${start} | Dist: ${t.distancia}km | Dur: ${t.duracao}min | Origem: ${t.origem || "N/A"}\n`;
    });
    summary += `\n`;
  }

  res.send(summary);
});
