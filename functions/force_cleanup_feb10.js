const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

async function forceCleanup(db, dryRun = true) {
    const logFile = path.join(__dirname, "force_cleanup.log");
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

    function log(msg) {
        console.log(msg);
        try { fs.appendFileSync(logFile, msg + "\n"); } catch (e) {}
    }

    log(`--- Force Cleanup: Feb 10, 2026 (dryRun=${dryRun}) ---`);

    const startOfDay = new Date("2026-02-10T00:00:00Z");
    const endOfDay = new Date("2026-02-10T23:59:59Z");
    const winnerId = "00lKRuQC3itXvvrCdUvk"; 
    const vehicleId = "DPK7LP2GXiEibKmSQUVA";

    const tripsSnap = await db.collection("veiculos").doc(vehicleId).collection("viagens")
        .where("dataInicio", ">=", startOfDay)
        .where("dataInicio", "<=", endOfDay)
        .get();

    log(`Found ${tripsSnap.size} total trips on Feb 10 for vehicle ${vehicleId}.`);
    
    let deleteCount = 0;
    let batch = db.batch();
    let batchSize = 0;

    for (const tDoc of tripsSnap.docs) {
        if (tDoc.id === winnerId) {
            log(`  [KEEPING] Winner ID: ${tDoc.id}`);
            continue;
        }

        deleteCount++;
        if (!dryRun) {
            batch.delete(tDoc.ref);
            batchSize++;
        } else {
            log(`  [DRY-RUN] Deleting ID: ${tDoc.id}`);
        }
        
        if (batchSize >= 450) {
            await batch.commit();
            log(`  Committed batch of ${batchSize} deletions.`);
            batch = db.batch();
            batchSize = 0;
        }
    }

    if (batchSize > 0) {
        await batch.commit();
        log(`  Committed final batch of ${batchSize} deletions.`);
    }

    log(`\n--- Cleanup Finished ---`);
    log(`Total trips targeted: ${deleteCount}`);
}

module.exports = { forceCleanup };
