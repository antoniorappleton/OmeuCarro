// Script para Reprocessar Dados CSV Existentes
// Aplica a nova lógica de fuzzy search aos dados já importados
// Executar: node reparse_csv_data.js

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// MESMA lógica da Cloud Function melhorada
function getValFromRaw(raw, fieldKey) {
  const fuzzyPatterns = {
    speed: ["speed", "km/h"],
    rpm: ["engine", "rpm"],
    odometer: ["odometer", "km"],
    fuelLevel: ["fuel level", "%"],
    coolant: ["coolant", "temperature"],
    intakeTemp: ["intake", "temperature"],
    maf: ["mass air flow", "g/s"],
    engineLoad: ["engine load", "%"],
    voltage: ["voltage", "v"],
  };

  const patterns = fuzzyPatterns[fieldKey];
  if (!patterns) return null;

  for (const key of Object.keys(raw)) {
    const lowerKey = key.toLowerCase();
    // Verifica se a key contém TODAS as patterns
    if (patterns.every((p) => lowerKey.includes(p.toLowerCase()))) {
      const val = raw[key];
      if (val !== undefined && val !== null && val !== "") {
        return Number(val);
      }
    }
  }

  return null;
}

async function reparseCSVData() {
  const vehicleId = "DPK7LP2GXiEibKmSQUVA";

  console.log("🔍 A procurar dados CSV para reprocessar...");

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
  console.log("🔄 A reprocessar...\n");

  const batch = db.batch();
  let count = 0;
  let successCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const raw = data.raw || {};

    // Re-parse usando nova lógica
    const newParsed = {
      speed: getValFromRaw(raw, "speed"),
      rpm: getValFromRaw(raw, "rpm"),
      odometer: getValFromRaw(raw, "odometer"),
      fuelLevel: getValFromRaw(raw, "fuelLevel"),
      coolant: getValFromRaw(raw, "coolant"),
      engineLoad: getValFromRaw(raw, "engineLoad"),
      intake: getValFromRaw(raw, "intakeTemp"),
      maf: getValFromRaw(raw, "maf"),
      voltage: getValFromRaw(raw, "voltage"),
      location: data.parsed?.location || null, // Preservar location se existir
    };

    // Verificar se algo mudou
    const hasImprovements =
      newParsed.speed !== null ||
      newParsed.rpm !== null ||
      newParsed.coolant !== null ||
      newParsed.engineLoad !== null;

    if (hasImprovements) {
      batch.update(doc.ref, { parsed: newParsed });
      successCount++;

      // Log de exemplo (primeiro doc)
      if (successCount === 1) {
        console.log("✨ Exemplo de melhoria:");
        console.log("ANTES:", data.parsed);
        console.log("DEPOIS:", newParsed);
        console.log("");
      }
    }

    count++;

    // Firestore batch limit: 500 operations
    if (count % 500 === 0) {
      await batch.commit();
      console.log(
        `   ✅ ${count} docs processados (${successCount} melhorados)`,
      );
      // Criar novo batch
      const newBatch = db.batch();
      Object.assign(batch, newBatch);
    }
  }

  // Commit final
  if (count % 500 !== 0) {
    await batch.commit();
  }

  console.log(`\n✅ CONCLUÍDO!`);
  console.log(`   Total processado: ${count}`);
  console.log(`   Total melhorado: ${successCount}`);
  console.log(`   Sem alterações: ${count - successCount}`);
}

reparseCSVData()
  .then(() => {
    console.log("\n🎉 Reprocessamento concluído com sucesso!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Erro:", err);
    process.exit(1);
  });
