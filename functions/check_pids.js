const admin = require("firebase-admin");
// Project ID found in index.js and other files
admin.initializeApp({
  projectId: "omeucarro-d3889"
});

(async () => {
  try {
    const db = admin.firestore();
    const veiculos = await db.collection("veiculos").get();
    for (const vDoc of veiculos.docs) {
      console.log(`\nVEHICLE: ${vDoc.id} (${vDoc.data().nome || "N/A"})`);
      
      const readings = await vDoc.ref.collection("leiturasObd")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (!readings.empty) {
        const data = readings.docs[0].data();
        const safeParams = data.safeParams || {};
        const parsed = data.parsed || {};
        
        console.log(`  Parsed Data:`, JSON.stringify(parsed, null, 2));
        
        console.log(`  Checking specific raw sensors in safeParams:`);
        const interestingPids = [
          "42", "k42", "ff1238", "kff1238", // Battery
          "ff1208", "kff1208", "ff1203", "kff1203", // Trip L/100
          "ff5203", "kff5203", // Long term L/100
          "ff1271", "kff1271", // Fuel used
          "kfe", "fe", // Fuel Flow
          "k0c", "kc", // RPM
          "k0d", "kd"  // Speed
        ];
        
        interestingPids.forEach(pid => {
          if (safeParams[pid] !== undefined) {
             console.log(`    - Found ${pid}: ${safeParams[pid]}`);
          }
        });

        const allShortKeys = Object.keys(safeParams).filter(k => k.match(/^[k0-9a-f]{2,8}$/i));
        console.log(`  All PID-like keys found: ${allShortKeys.join(", ")}`);
        
      } else {
        console.log(`  No readings found.`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
