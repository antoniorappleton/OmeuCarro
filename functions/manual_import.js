const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json"); // ⚠️ PLACEHOLDER: Ensure this file exists or configure credentials

// ⚠️ CONFIGURATION ⚠️
const VEICULO_ID = "DPK7LP2GXiEibKmSQUVA";
const USE_EMULATOR = false; // Set to true if running with firebase emulators

// CHANGE THIS DATA
// Format: { data: "YYYY-MM-DD", odometro: 123456, litros: 50.5, totalCost: 90.50, tipo: "Gasolina 95", posto: "BP" }
const DATA_TO_IMPORT = [
  // Example:
  // { data: "2024-01-01", odometro: 100000, litros: 50, totalCost: 80, tipo: "Gasolina 95", posto: "Exemplo" },
];

async function main() {
  if (VEICULO_ID === "REPLACE_WITH_VEHICLE_ID") {
    console.error("❌ Please set the VEICULO_ID const in the script.");
    process.exit(1);
  }

  // Initialize Firebase Admin
  try {
    if (USE_EMULATOR) {
      process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
      process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
      admin.initializeApp({ projectId: "demo-project" });
      console.log("🔧 Using Emulator");
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("🌍 Using Production (Service Account)");
    }
  } catch (e) {
    console.error("❌ Error initializing app. Check service-account.json or credentials.", e.message);
    process.exit(1);
  }

  const db = admin.firestore();
  const batch = db.batch();
  const collectionRef = db.collection("veiculos").doc(VEICULO_ID).collection("abastecimentos");

  console.log(`🚀 Starting import for Vehicle: ${VEICULO_ID}`);
  console.log(`📊 Found ${DATA_TO_IMPORT.length} records to import.`);

  let count = 0;
  for (const item of DATA_TO_IMPORT) {
    const docRef = collectionRef.doc(); // Auto-ID

    // Calculate price per liter if missing
    const litros = Number(item.litros);
    const totalCost = Number(item.totalCost || item.custo || 0);
    const precoPorLitro = item.precoPorLitro ? Number(item.precoPorLitro) : (litros > 0 ? totalCost / litros : 0);

    const payload = {
      data: item.data, // String YYYY-MM-DD is fine for sorting usually, but app might expect specific format. Ideally ISO.
      // If the app expects Timestamps, we might need admin.firestore.Timestamp.fromDate(new Date(item.data))
      // Based on firestore.js, it seems to use string dates in some places but let's be careful. 
      // Checked firestore.js: createAbastecimento uses `data.data` directly. In the UI it's usually YYYY-MM-DD string from input type="date".
      
      odometro: Number(item.odometro),
      litros: litros,
      precoPorLitro: Number(precoPorLitro.toFixed(3)),
      tipoCombustivel: item.tipo || "Gasolina 95",
      posto: item.posto || "Importado",
      observacoes: item.observacoes || "Importado via script",
      completo: true, // Defaulting to true
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      importadoEm: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(docRef, payload);
    count++;
  }

  if (count > 0) {
    await batch.commit();
    console.log(`✅ Successfully imported ${count} records!`);
  } else {
    console.log("⚠️ No records to import.");
  }
}

main().catch(console.error);
