const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

(async () => {
  try {
    const db = admin.firestore();
    const veiculos = await db.collection("veiculos").get();
    for (const vDoc of veiculos.docs) {
      const readings = await vDoc.ref.collection("leiturasObd").orderBy("timestamp", "desc").limit(20).get();
      console.log(`VEHICLE: ${vDoc.id} (${vDoc.data().nome || "N/A"})`);
      let nullSess = 0;
      let hasSess = 0;
      readings.forEach(r => {
        if (r.data().sessionId) hasSess++;
        else nullSess++;
      });
      console.log(`  SessionID Stats (last 10-20): ${hasSess} present, ${nullSess} null`);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
