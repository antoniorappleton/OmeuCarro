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
      // Em Firestore, where("field", "==", null) funciona para campos nulos explicitamente,
      // mas se o campo não existe, precisa de truca.
      // Assumindo que antes a gente NÃO mandava deviceId, ele não existia ou era null?
      // No import antigo: const params = ...; uploadData(params).
      // Se não tinha 'id' nos params, chegava null ao create?
      // O endpoint antigo fazia: deviceId: safeParams.id || null
      // Então gravou como null.
      const snapNull = await readingsRef.where("deviceId", "==", null).get();

      const docsToDelete = [...snapManual.docs, ...snapNull.docs];

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
