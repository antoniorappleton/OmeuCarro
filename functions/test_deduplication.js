const crypto = require("crypto");

async function simulate(admin) {
    const db = admin.firestore();
    console.log("--- Starting Deduplication Simulation ---");
    
    const vehicleId = "DPK7LP2GXiEibKmSQUVA";
    const sessionId = "TEST_SIMULATION_" + Date.now();
    const timestamp = Date.now();
    
    const readingData = {
        timestamp: timestamp,
        receivedAt: admin.firestore.Timestamp.now(),
        sessionId: sessionId,
        parsed: {
            speed: 50,
            rpm: 2500,
            tripDistance: 1.5,
            coolant: 90
        }
    };

    const readingId = crypto
        .createHash("md5")
        .update(`${sessionId}_${timestamp}`)
        .digest("hex");

    console.log(`Simulating 5 parallel writes for Reading ID: ${readingId}`);

    const vehicleRef = db.collection("veiculos").doc(vehicleId);
    const readingRef = vehicleRef.collection("leiturasObd").doc(readingId);

    // Simulate 5 parallel triggers/writes
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(readingRef.set(readingData));
    }

    await Promise.all(promises);
    console.log("Writes completed.");

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const checkReadings = await vehicleRef.collection("leiturasObd")
        .where("sessionId", "==", sessionId)
        .get();

    console.log(`Readings found in DB for this session: ${checkReadings.size}`);
    
    if (checkReadings.size === 1) {
        console.log("SUCCESS: Only 1 reading document created despite 5 attempts.");
    } else {
        console.log("FAILURE: Multiple reading documents found.");
    }

    console.log("\n--- Simulation Finished ---");
}

module.exports = { simulate };
