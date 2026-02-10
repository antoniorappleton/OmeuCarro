const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "deep_scan.log");

function log(msg) {
    console.log(msg);
    try {
        fs.appendFileSync(logFile, msg + "\n");
    } catch (e) {}
}

/**
 * Deep scan for all trips on 2026-02-10.
 * @param {object} db Firestore instance.
 */
async function deepScan(db) {
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    log(`--- Deep Scan: Feb 10, 2026 ---`);

    const startOfDay = new Date("2026-02-10T00:00:00Z");
    const endOfDay = new Date("2026-02-10T23:59:59Z");

    try {
        const vehiclesSnap = await db.collection("veiculos").get();
        log(`Scanning ${vehiclesSnap.size} vehicles...`);

        let totalFound = 0;
        const targetSessionId = "1770711048563";

        for (const vDoc of vehiclesSnap.docs) {
            // Firestore Node.js SDK allows passing Date objects directly in where()
            const tripsSnap = await vDoc.ref.collection("viagens")
                .where("dataInicio", ">=", startOfDay)
                .where("dataInicio", "<=", endOfDay)
                .get();

            if (!tripsSnap.empty) {
                log(`\nVehicle: ${vDoc.id} - ${tripsSnap.size} trips found on Feb 10.`);
                totalFound += tripsSnap.size;

                tripsSnap.docs.forEach(tDoc => {
                    const d = tDoc.data();
                    const isWinner = (d.sessionId === targetSessionId && d.duracao === 37);
                    log(`  ${isWinner ? "[TARGET] " : ""}ID: ${tDoc.id} | Session: ${d.sessionId} | Dur: ${d.duracao} | Dist: ${d.distancia} | Start: ${d.dataInicio ? d.dataInicio.toDate().toISOString() : 'N/A'}`);
                });
            }
        }

        log(`\n--- Scan Finished ---`);
        log(`Total trips found for 2026-02-10: ${totalFound}`);

    } catch (error) {
        log(`SCAN ERROR: ${error.message}`);
        console.error(error);
    }
}

module.exports = { deepScan };
