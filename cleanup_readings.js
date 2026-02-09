const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteAllReadings() {
  const vehicleId = "DPK7LP2GXiEibKmSQUVA";
  const readingsRef = db
    .collection("veiculos")
    .doc(vehicleId)
    .collection("leiturasObd");

  console.log("Iniciando limpeza de todas as leituras OBD...");

  let deletedCount = 0;
  let batchCount = 0;

  while (true) {
    const snapshot = await readingsRef.limit(500).get();

    if (snapshot.empty) {
      console.log("Nenhuma leitura encontrada. Limpeza completa!");
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    deletedCount += snapshot.size;
    batchCount++;

    console.log(
      `Batch ${batchCount}: ${snapshot.size} leituras apagadas. Total: ${deletedCount}`,
    );

    // Pequena pausa para não sobrecarregar
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(
    `\n✅ Limpeza completa! Total de leituras apagadas: ${deletedCount}`,
  );
  process.exit(0);
}

deleteAllReadings().catch((error) => {
  console.error("Erro na limpeza:", error);
  process.exit(1);
});
