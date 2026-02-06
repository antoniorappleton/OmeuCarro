const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.backfillTrips = onRequest(async (req, res) => {
  const vehicleId = req.query.vehicleId;

  if (!vehicleId) {
    return res.status(400).send("Missing vehicleId query parameter.");
  }

  try {
    console.log(`Starting backfill for vehicle: ${vehicleId}`);

    // 1. Fetch ALL readings ordered by time
    // Note: For production with many readings, this should be paginated/batched.
    const snapshot = await db
      .collection(`veiculos/${vehicleId}/leiturasObd`)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      return res.send("No OBD readings found.");
    }

    const readings = [];
    snapshot.forEach((doc) => {
      readings.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Processing ${readings.length} readings...`);

    const trips = [];
    let currentTrip = null;
    let lastReading = null;

    // 2. Process Readings Chronologically
    for (const r of readings) {
      const timestamp = r.timestamp.toDate
        ? r.timestamp.toDate()
        : new Date(r.timestamp);
      const tripDist = parseFloat(r.tripDistance || 0);

      let isNewTrip = false;

      if (!currentTrip) {
        isNewTrip = true;
      } else {
        // Time Gap > 15 mins
        const timeDiff = (timestamp - lastReading.timestamp) / (1000 * 60); // minutes
        if (timeDiff > 15) {
          isNewTrip = true;
        }

        // Distance Reset (Engine restart/Trip reset)
        if (tripDist < (lastReading.tripDist || 0) && tripDist < 1) {
          isNewTrip = true;
        }
      }

      if (isNewTrip) {
        // Finalize previous
        if (currentTrip) {
          trips.push(currentTrip);
        }

        // Start new
        currentTrip = {
          vehicleId: vehicleId,
          startTime: timestamp,
          endTime: timestamp,
          startKm: tripDist,
          endKm: tripDist,
          maxSpeed: 0,
          readingsCount: 0,
          fuelUsed: 0, // Placeholder
        };
      }

      // Update Current Trip
      currentTrip.endTime = timestamp;
      currentTrip.endKm = tripDist;
      currentTrip.readingsCount++;

      const speed = parseFloat(r.speed || 0);
      if (speed > currentTrip.maxSpeed) currentTrip.maxSpeed = speed;

      // Track last reading for logic
      lastReading = {
        timestamp: timestamp,
        tripDist: tripDist,
      };
    }

    // Push final trip
    if (currentTrip) {
      trips.push(currentTrip);
    }

    console.log(`Identified ${trips.length} trips.`);

    // 3. Write to Firestore (Batch)
    // Batches are max 500 ops.
    const batches = [];
    let batch = db.batch();
    let opCount = 0;

    for (const trip of trips) {
      const tripRef = db.collection(`veiculos/${vehicleId}/viagens`).doc();

      // Calculate aggregations
      const distance = Math.max(0, trip.endKm - trip.startKm).toFixed(2);
      // Default efficientcy if unknown
      const avgConsumption = 7.0; // Hardcoded fallback or use avg from readings if available (MAF)

      const tripData = {
        startTime: trip.startTime,
        endTime: trip.endTime,
        distanceKm: parseFloat(distance),
        maxSpeed: trip.maxSpeed,
        readingsCount: trip.readingsCount,
        avgConsumption: avgConsumption,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(tripRef, tripData);
      opCount++;

      if (opCount >= 450) {
        batches.push(batch);
        batch = db.batch();
        opCount = 0;
      }
    }
    if (opCount > 0) batches.push(batch);

    await Promise.all(batches.map((b) => b.commit()));

    res.send({
      success: true,
      msg: `Processed ${readings.length} readings into ${trips.length} trips.`,
      tripsCreated: trips.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send(e.toString());
  }
});
