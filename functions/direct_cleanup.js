const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.cleanupTripsCloud = onRequest(async (req, res) => {
  const db = admin.firestore();
  const VEHICLE_ID = "DPK7LP2GXiEibKmSQUVA";

  console.log("🔍 Analisando viagens para o veículo:", VEHICLE_ID);

  const tripsRef = db
    .collection("veiculos")
    .doc(VEHICLE_ID)
    .collection("viagens");
  const snap = await tripsRef.orderBy("dataInicio", "desc").get();

  if (snap.empty) {
    return res.send("✅ Nenhuma viagem encontrada.");
  }

  const toDelete = [];
  const seenStartTimes = new Set();
  let analysis = `📦 Analisando ${snap.docs.length} registos...\n`;

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const startTimeStr = data.dataInicio.toDate().toISOString();

    // 1. Identificar Duplicados (mesmo tempo de início)
    if (seenStartTimes.has(startTimeStr)) {
      analysis += `🗑️  Duplicado: ${startTimeStr} [ID: ${doc.id}]\n`;
      toDelete.push(doc.id);
      return;
    }
    seenStartTimes.add(startTimeStr);

    // 2. Identificar "Lixo" de teste (distância insignificante e data recente)
    // Se for hoje (9 fev) e tiver < 0.2km
    if (data.distancia < 0.2) {
      analysis += `🗑️  Ruído (< 0.2km): ${startTimeStr} [ID: ${doc.id}]\n`;
      toDelete.push(doc.id);
      return;
    }

    // 3. Identificar trips de teste específicas (12.5km do script de teste)
    if (data.distancia === 12.5) {
      analysis += `🗑️  Teste Simulation (12.5km): ${startTimeStr} [ID: ${doc.id}]\n`;
      toDelete.push(doc.id);
      return;
    }
  });

  if (toDelete.length === 0) {
    return res.send(analysis + "✅ Nada para limpar.");
  }

  const batch = db.batch();
  toDelete.forEach((id) => batch.delete(tripsRef.doc(id)));
  await batch.commit();

  res.send(analysis + `\n✅ Sucesso: ${toDelete.length} registos eliminados!`);
});
