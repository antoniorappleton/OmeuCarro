const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "omeucarro-d3889" });

(async () => {
  try {
    const db = admin.firestore();
    const veiculos = await db.collection("veiculos").get();
    
    for (const vDoc of veiculos.docs) {
      const vData = vDoc.data();
      console.log(`\nVEHICLE: ${vDoc.id} (${vData.nome})`);
      console.log(`  Current Odo: ${vData.odometroAtual}`);
      console.log(`  Initial Odo: ${vData.odometroInicial}`);
      
      const readings = await vDoc.ref.collection("leiturasObd")
        .where("timestamp", ">=", new Date("2026-02-10T00:00:00Z").getTime())
        .orderBy("timestamp", "desc")
        .get();

      if (!readings.empty) {
        console.log(`  Readings from Feb 10: ${readings.size}`);
        const first = readings.docs[readings.size - 1].data();
        const last = readings.docs[0].data();
        
        console.log(`  First Reading today:`);
        console.log(`    - Timestamp: ${new Date(first.timestamp).toLocaleString()}`);
        console.log(`    - Odo (parsed): ${first.parsed?.odometer}`);
        console.log(`    - TripDist (parsed): ${first.parsed?.tripDistance}`);
        console.log(`    - SessionId: ${first.sessionId}`);
        
        console.log(`  Last Reading today:`);
        console.log(`    - Timestamp: ${new Date(last.timestamp).toLocaleString()}`);
        console.log(`    - Odo (parsed): ${last.parsed?.odometer}`);
        console.log(`    - TripDist (parsed): ${last.parsed?.tripDistance}`);
        console.log(`    - SessionId: ${last.sessionId}`);

        // Check for safeParams raw odometer keys
        const rawKey = Object.keys(last.safeParams || {}).find(k => k === "a6" || k === "kff1201");
        if (rawKey) {
          console.log(`  Raw Odo Key found (${rawKey}): ${last.safeParams[rawKey]}`);
        }
      } else {
        console.log(`  No readings found for today.`);
        // Try all-time last reading
        const lastAll = await vDoc.ref.collection("leiturasObd").orderBy("timestamp", "desc").limit(1).get();
        if (!lastAll.empty) {
          const lData = lastAll.docs[0].data();
          console.log(`  Last recorded reading ever (${new Date(lData.timestamp).toLocaleString()}):`);
          console.log(`    - Odo: ${lData.parsed?.odometer}`);
          console.log(`    - TripDist: ${lData.parsed?.tripDistance}`);
        }
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
