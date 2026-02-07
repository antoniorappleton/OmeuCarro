const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.cleanupManualRecords = onRequest(async (req, res) => {
  try {
    console.log(
      "Iniciando limpeza de registos manuais (deviceId='manual_csv')...",
    );

    // 1. Obter todos os veículos
    const veiculosSnap = await db.collection("veiculos").get();
    let totalDeleted = 0;

    for (const doc of veiculosSnap.docs) {
      const vehicleId = doc.id;
      const readingsRef = doc.ref.collection("leiturasObd");

      // 2. Query por deviceId "manual_csv" OR null (simulado)
      const snapManual = await readingsRef
        .where("deviceId", "==", "manual_csv")
        .get();
      const snapNull = await readingsRef.where("deviceId", "==", null).get();

      // TAMBÉM LIMPAR AS VIAGENS (Sessões)
      const tripsRef = doc.ref.collection("viagens");
      const snapTrips = await tripsRef.limit(50).get(); // Limpar tudo por agora (dev)

      const docsToDelete = [
        ...snapManual.docs,
        ...snapNull.docs,
        ...snapTrips.docs,
      ];

      if (docsToDelete.length === 0) continue;

      console.log(
        `Veículo ${vehicleId}: Encontrados ${docsToDelete.length} registos (manual_csv ou null).`,
      );

      // 3. Batch delete (limit 500)
      const batches = [];
      let currentBatch = db.batch();
      let currentCount = 0;

      docsToDelete.forEach((d) => {
        if (currentCount < 3) {
          console.log(
            `[DEBUG] Apagando doc ${d.id}:`,
            JSON.stringify(d.data()),
          );
        }
        currentBatch.delete(d.ref);
        currentCount++;

        if (currentCount >= 450) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          currentCount = 0;
        }
      });

      if (currentCount > 0) batches.push(currentBatch);

      for (const b of batches) {
        await b.commit();
      }

      totalDeleted += docsToDelete.length;
    }

    console.log(`Limpeza concluída. Total apagados: ${totalDeleted}`);
    res.json({ success: true, deleted: totalDeleted });
  } catch (error) {
    console.error("Erro na limpeza:", error);
    res.status(500).json({ error: error.message });
  }
});
