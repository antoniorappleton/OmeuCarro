const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.deepCleanupTrips = onRequest(async (req, res) => {
  const db = admin.firestore();

  // 1. Descobrir Veículo Ativo (opcional, mas vamos garantir o ID)
  const vSnap = await db.collection("veiculos").get();
  const vehicleIds = vSnap.docs.map((d) => d.id);

  let totalDeleted = 0;
  let summary = `🔍 Analisando ${vehicleIds.length} veículos: ${vehicleIds.join(", ")}\n\n`;

  for (const vId of vehicleIds) {
    summary += `--- Veículo: ${vId} ---\n`;
    const tripsRef = db.collection("veiculos").doc(vId).collection("viagens");
    const snap = await tripsRef.orderBy("dataInicio", "desc").get();

    if (snap.empty) {
      summary += "✅ Nenhuma viagem.\n";
      continue;
    }

    const toDelete = [];
    const seenMinutes = new Set();
    summary += `📦 ${snap.docs.length} registos encontrados.\n`;

    snap.docs.forEach((doc) => {
      const data = doc.data();
      // Precisão de MINUTO para deduplicação (ignorar milisegundos/segundos)
      const minuteKey = Math.floor(data.dataInicio.toMillis() / 60000);

      // REGRA 1: Duplicados (mesmo minuto de início)
      if (seenMinutes.has(minuteKey)) {
        summary += `🗑️  ELIMINADO (Duplicado no mesmo minuto): ${data.dataInicio.toDate().toLocaleTimeString()} [ID: ${doc.id}]\n`;
        toDelete.push(doc.id);
        return;
      }
      seenMinutes.add(minuteKey);

      // REGRA 2: Ruído (< 0.5km)
      if (data.distancia < 0.5) {
        summary += `🗑️  ELIMINADO (Ruído < 0.5km): ${data.dataInicio.toDate().toLocaleTimeString()} [Dist: ${data.distancia}km]\n`;
        toDelete.push(doc.id);
        return;
      }

      // REGRA 3: Testes específicos de 12.5km
      if (data.distancia === 12.5) {
        summary += `🗑️  ELIMINADO (Teste 12.5km): ${data.dataInicio.toDate().toLocaleTimeString()}\n`;
        toDelete.push(doc.id);
        return;
      }
    });

    if (toDelete.length > 0) {
      const batch = db.batch();
      toDelete.forEach((id) => batch.delete(tripsRef.doc(id)));
      await batch.commit();
      totalDeleted += toDelete.length;
    }
  }

  res.send(
    summary +
      `\n🚀 TOTAL FINAL: ${totalDeleted} registos eliminados. Verificas a L100?`,
  );
});
