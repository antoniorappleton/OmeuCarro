const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "omeucarro-d3889"
    });
}

const db = admin.firestore();
const logFile = path.join(__dirname, "force_cleanup_standalone.log");

function log(msg) {
    console.log(msg);
    try {
        fs.appendFileSync(logFile, msg + "\n");
    } catch (e) {}
}

async function run() {
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    log(`--- Force Cleanup Standalone: Feb 10, 2026 ---`);

    const startOfDay = new Date("2026-02-10T00:00:00Z");
    const endOfDay = new Date("2026-02-10T23:59:59Z");
    const winnerId = "00lKRuQC3itXvvrCdUvk"; 
    const vehicleId = "DPK7LP2GXiEibKmSQUVA";

    try {
        const tripsSnap = await db.collection("veiculos").doc(vehicleId).collection("viagens")
            .where("dataInicio", ">=", startOfDay)
            .where("dataInicio", "<=", endOfDay)
            .get();

        log(`Found ${tripsSnap.size} total trips on Feb 10.`);
        
        let deleteCount = 0;
        let batch = db.batch();
        let batchSize = 0;

        for (const tDoc of tripsSnap.docs) {
            if (tDoc.id === winnerId) {
                log(`  [KEEPING] Winner ID: ${tDoc.id}`);
                continue;
            }

            deleteCount++;
            batch.delete(tDoc.ref);
            batchSize++;
            
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

        log(`\n--- Cleanup Standalone Finished ---`);
        log(`Total trips deleted: ${deleteCount}`);

    } catch (error) {
        log(`CLEANUP ERROR: ${error.message}`);
        console.error(error);
    }
}

run();
