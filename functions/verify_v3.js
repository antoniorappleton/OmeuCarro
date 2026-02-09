const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "omeucarro-d3889",
  });
}

const db = admin.firestore();
const VEHICLE_ID = "DPK7LP2GXiEibKmSQUVA";

async function verify() {
  console.log("Starting Integration Verification...");

  // 1. Get initial Odometer
  const vSnap = await db.collection("veiculos").doc(VEHICLE_ID).get();
  const initialOdo = vSnap.data().odometroAtual || 0;
  console.log(`Initial Odometer: ${initialOdo}`);

  // 2. Inject an OBD Reading that SHOULD trigger a fallback update
  // We simulate a reading with tripDistance = 1.0 (delta = 1.0 if lastTripDistance was 0)
  const sessionId = "verify_sess_" + Date.now();
  const readingId = "verify_read_" + Date.now();

  const readingData = {
    timestamp: Date.now(),
    sessionId: sessionId,
    parsed: {
      tripDistance: 1.0,
      tripL100: 5.5,
      speed: 50,
      rpm: 2000,
    },
  };

  console.log("Injecting OBD Reading (Fallback Test)...");
  await db
    .collection("veiculos")
    .doc(VEHICLE_ID)
    .collection("leiturasObd")
    .doc(readingId)
    .set(readingData);

  console.log("Waiting for Cloud Functions to process (5s)...");
  await new Promise((r) => setTimeout(r, 5000));

  // 3. Verify Vehicle Profile Updates
  const vSnapFinal = await db.collection("veiculos").doc(VEHICLE_ID).get();
  const finalOdo = vSnapFinal.data().odometroAtual || 0;
  const metrics = vSnapFinal.data().ultimasMetricas || {};

  console.log("--- RESULTS ---");
  console.log(`Final Odometer: ${finalOdo}`);
  console.log(`Odometer Delta: ${finalOdo - initialOdo}`);
  console.log(`Sync Metrics:`, JSON.stringify(metrics, null, 2));

  if (finalOdo > initialOdo) {
    console.log("✅ SUCCESS: Odometer incremented via fallback!");
  } else {
    console.log("❌ FAILURE: Odometer did not update.");
  }

  if (metrics.distancia === 1.0) {
    console.log("✅ SUCCESS: Profile metrics synced!");
  } else {
    console.log("❌ FAILURE: Profile metrics sync failed.");
  }

  process.exit(0);
}

verify().catch(console.error);
