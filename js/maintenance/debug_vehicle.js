const admin = require("firebase-admin");
const serviceAccount = require("../service-account-key.json"); // Starts with .. inside scripts/

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const vehicleId = "DPK7LP2GXiEibKmSQUVA"; // extracted from user URL

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
  console.log("Avg Consumption (OBD Stored):", v.consumoMedioObd);
  console.log(
    "Last OBD Update:",
    v.lastObdUpdate ? v.lastObdUpdate.toDate() : "Never",
  );

  // Simulation of Analytics Logic
  const capacity = v.capacidadeDepositoLitros || 0;
  const l100 = v.consumoMedioObd || 0; // Assuming we use OBD for now
  const fuelLevel = v.nivelCombustivel || 0;

  console.log("\n--- Calculation ---");
  if (capacity > 0 && fuelLevel > 0 && l100 > 0) {
    const litersLeft = (fuelLevel / 100) * capacity;
    const range = (litersLeft / l100) * 100;
    console.log(`Liters Left (calc): ${litersLeft.toFixed(1)} L`);
    console.log(`Range (calc): ${range.toFixed(0)} km`);

    let rangeThresholdCritical = 40;
    let rangeThresholdWarning = 80;

    console.log(`Critical Threshold: < ${rangeThresholdCritical} km`);
    console.log(`Warning Threshold: < ${rangeThresholdWarning} km`);

    if (range <= rangeThresholdCritical)
      console.log("RESULT: CRITICAL ALERT (RED)");
    else if (range <= rangeThresholdWarning)
      console.log("RESULT: WARNING ALERT (YELLOW)");
    else console.log("RESULT: NO ALERT (GREEN)");
  } else {
    console.log("Insufficient data for calculation.");
    console.log(`Has Capacity? ${capacity > 0}`);
    console.log(`Has Fuel Level? ${fuelLevel > 0}`);
    console.log(`Has Consumption? ${l100 > 0}`);
  }
}

debugVehicle();
