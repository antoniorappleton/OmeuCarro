const admin = require("firebase-admin");

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: "omeucarro-d3889" });
}
const db = admin.firestore();

async function confirm() {
    const vId = "DPK7LP2GXiEibKmSQUVA";
    const target = new Date("2026-02-10T08:10:58Z");
    const start = new Date(target.getTime() - 5000);
    const end = new Date(target.getTime() + 5000);

    console.log(`Checking trips for vehicle ${vId} between ${start.toISOString()} and ${end.toISOString()}...`);

    const snap = await db.collection("veiculos").doc(vId).collection("viagens")
        .where("dataInicio", ">=", admin.firestore.Timestamp.fromDate(start))
        .where("dataInicio", "<=", admin.firestore.Timestamp.fromDate(end))
        .get();

    console.log(`Final count found: ${snap.size}`);
    
    snap.docs.forEach(doc => {
        const d = doc.data();
        console.log(`- Trip ID: ${doc.id}`);
        console.log(`  Start: ${d.dataInicio.toDate().toISOString()}`);
        console.log(`  Duration: ${d.duracao} min`);
        console.log(`  Distance: ${d.distancia} km`);
    });
}

confirm().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
