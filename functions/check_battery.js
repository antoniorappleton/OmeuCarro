const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

(async () => {
  try {
    const db = admin.firestore();
    const veiculos = await db.collection("veiculos").get();
    for (const vDoc of veiculos.docs) {
      // Get the last 5 readings to be sure
      const readings = await vDoc.ref.collection("leiturasObd").orderBy("timestamp", "desc").limit(5).get();
      if (!readings.empty) {
        console.log(`\nVEHICLE: ${vDoc.id} (${vDoc.data().nome || "N/A"})`);
        readings.docs.forEach((doc, idx) => {
          const rData = doc.data();
          const safeParams = rData.safeParams || {};
          const parsed = rData.parsed || {};
          
          console.log(`  Reading ${idx + 1} (ID: ${doc.id}):`);
          console.log(`    - Parsed Voltage: ${parsed.voltage}`);
          
          // Look for any key that might be voltage in safeParams
          const rawKeys = Object.keys(safeParams);
          const potentialKeys = rawKeys.filter(k => 
            k.toLowerCase().includes("volt") || 
            k.toLowerCase().includes("v") || 
            k === "42" || 
            k === "k42" || 
            k === "kff1238" ||
            k === "ff1238" ||
            k === "ff1214" // O2 Voltage just in case
          );
          
          if (potentialKeys.length > 0) {
            console.log(`    - Potential raw keys found:`);
            potentialKeys.forEach(pk => {
              console.log(`        ${pk}: ${safeParams[pk]}`);
            });
          } else {
            console.log(`    - No voltage-related keys found in raw parameters.`);
          }
        });
      } else {
        console.log(`\nVEHICLE: ${vDoc.id} (${vDoc.data().nome || "N/A"}) - No readings found.`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
