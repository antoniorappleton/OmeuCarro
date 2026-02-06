// Script para Limpar Dados CSV da Firestore
// Executar: node cleanup_csv_data.js

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Precisas do ficheiro de credenciais

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function cleanupCSVData() {
  const vehicleId = "DPK7LP2GXiEibKmSQUVA";

  console.log("🔍 A procurar dados CSV...");

  const snapshot = await db
    .collection("veiculos")
    .doc(vehicleId)
    .collection("leiturasObd")
    .where("deviceId", "==", "manual_csv")
    .get();

  if (snapshot.empty) {
    console.log("✅ Nenhum dado CSV encontrado.");
    return;
  }

  console.log(`📦 Encontrados ${snapshot.docs.length} documentos CSV`);
  console.log("🗑️  A eliminar...");

  const batch = db.batch();
  let count = 0;

  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    count++;

    // Firestore batch limit: 500 operations
    if (count % 500 === 0) {
      console.log(`   Batch ${count / 500} preparado...`);
    }
  });

  await batch.commit();
  console.log(`✅ ${count} documentos eliminados com sucesso!`);
}

cleanupCSVData()
  .then(() => {
    console.log("✅ Cleanup concluído!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Erro:", err);
    process.exit(1);
  });
