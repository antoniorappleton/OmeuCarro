const admin = require("firebase-admin");
// No functions directory, service-account is usually in root or ..
// Try to find it. User has it in root? Previous script used "../service-account-key.json" from scripts/
// So from functions/ it should be "../service-account-key.json" too?
// Let's assume it is "service-account-key.json" in root.
const serviceAccount = require("../service-account-key.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const vehicleId = "DPK7LP2GXiEibKmSQUVA";

async function debugVehicle() {
  console.log(`Analyzing Vehicle: ${vehicleId}...`);

  const vSnap = await db.collection("veiculos").doc(vehicleId).get();
  if (!vSnap.exists) {
    console.log("Vehicle not found!");
    return;
  }

  const v = vSnap.data();
  console.log("--- Vehicle Data ---");
  console.log("Name:", v.nome);
  console.log("Odometer:", v.odometroAtual);
  console.log("Fuel Capacity:", v.capacidadeDepositoLitros);
  console.log("Fuel Level (OBD):", v.nivelCombustivel);
  console.log("Avg Consumption (Manual History):", v.consumoMedio); // from calculations
  console.log("Avg Consumption (OBD Stored):", v.consumoMedioObd); // from our new feature
  console.log(
    "Last OBD Update:",
    v.lastObdUpdate ? v.lastObdUpdate.toDate() : "Never",
  );

  // Logic from veiculo.js override
  let l100 = 0;
  if (v.consumoMedioObd && v.consumoMedioObd > 0) {
    l100 = v.consumoMedioObd;
    console.log("Config: Using OBD Stored Consumption");
  } else {
    l100 = v.consumoMedio || 0;
    console.log("Config: Using Manual/Fallback Consumption");
  }

  const capacity = v.capacidadeDepositoLitros || 0;
  const fuelLevel = v.nivelCombustivel || 0;

  console.log("\n--- Calculation ---");
  console.log(`L100 used: ${l100}`);

  if (capacity > 0 && fuelLevel > 0 && l100 > 0) {
    const litersLeft = (fuelLevel / 100) * capacity;
    const range = (litersLeft / l100) * 100;
    console.log(`Liters Left (calc): ${litersLeft.toFixed(1)} L`);
    console.log(`Range (calc): ${range.toFixed(0)} km`);

    let rangeThresholdCritical = 40;
    let rangeThresholdWarning = 80;

    if (range <= rangeThresholdCritical)
      console.log("RESULT: CRITICAL ALERT (RED)");
    else if (range <= rangeThresholdWarning)
      console.log("RESULT: WARNING ALERT (YELLOW)");
    else console.log("RESULT: NO ALERT (GREEN)");
  } else {
    console.log("Insufficient data.");
  }
}

debugVehicle();
