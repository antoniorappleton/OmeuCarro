/**
 * FINAL FORCE CLEANUP SCRIPT - Feb 10, 2026
 * 
 * Objective: Delete all 654 duplicate trips for vehicle DPK7LP2GXiEibKmSQUVA on Feb 10th.
 * Winner trip to KEEP: 00lKRuQC3itXvvrCdUvk (Session 1770711048563, Duration 37)
 * 
 * Instructions to run:
 * 1. Open 'firebase functions:shell'
 * 2. Copy and paste the following block:
 */

(async () => {
    const admin = require("firebase-admin");
    const projectId = "omeucarro-d3889";
    
    // Forçar a definição do ID do projeto no ambiente
    process.env.GCP_PROJECT = projectId;
    process.env.GCLOUD_PROJECT = projectId;

    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: projectId
        });
    }

    // Criar uma instância direta do Firestore com o ID do projeto
    const db = new admin.firestore.Firestore({ projectId: projectId });
    const vehicleId = "DPK7LP2GXiEibKmSQUVA";
    const winnerId = "00lKRuQC3itXvvrCdUvk"; // PRESERVE THIS ID
    
    console.log("--- Starting FINAL Force Cleanup ---");
    
    // Fetch every trip on Feb 10 for this vehicle
    const start = admin.firestore.Timestamp.fromDate(new Date("2026-02-10T00:00:00Z"));
    const end = admin.firestore.Timestamp.fromDate(new Date("2026-02-10T23:59:59Z"));

    const snap = await db.collection("veiculos").doc(vehicleId).collection("viagens")
        .where("dataInicio", ">=", start)
        .where("dataInicio", "<=", end)
        .get();

    console.log(`Found ${snap.size} total trips on Feb 10.`);
    
    let deleteCount = 0;
    
    // Batch deletion (Firestore limit is 500 per batch)
    let batch = db.batch();
    let batchSize = 0;

    for (const tDoc of snap.docs) {
        if (tDoc.id === winnerId) {
            console.log(`  [KEEPING] Winner ID: ${tDoc.id}`);
            continue;
        }

        batch.delete(tDoc.ref);
        batchSize++;
        deleteCount++;

        if (batchSize >= 450) {
            await batch.commit();
            console.log(`  Committed batch of ${batchSize} deletions.`);
            batch = db.batch();
            batchSize = 0;
        }
    }

    if (batchSize > 0) {
        await batch.commit();
        console.log(`  Committed final batch of ${batchSize} deletions.`);
    }

    console.log(`\n--- CLEANUP COMPLETE ---`);
    console.log(`Total trips deleted: ${deleteCount}`);
})();
