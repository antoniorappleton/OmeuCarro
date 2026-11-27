const test = require("node:test");
const assert = require("node:assert/strict");

test(
  "explicitly finalizes an owned trip and starts a new segment for later readings",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || "demo-omeucarro",
      });
    }
    const db = admin.firestore();
    const TripMetrics = require("../tripMetrics");
    const { finalizeCurrentVehicleTrip } = require("../tripDetector");
    const vehicleId = `testfinal_${Date.now()}`;
    const vehicleRef = db.collection("veiculos").doc(vehicleId);
    const tripId = "session-explicit-end";
    const tripRef = vehicleRef.collection("viagens").doc(tripId);
    const timestamp = Date.now();
    const acc = TripMetrics.createState({ fuelType: "Diesel" });
    TripMetrics.step(acc, {
      timestamp: timestamp - 1_000,
      parsed: { speed: 30, rpm: 1500, coolant: 80 },
    });
    const tripFields = TripMetrics.toTripFields(TripMetrics.summarize(acc));

    try {
      await vehicleRef.set({
        userId: "owner-user",
        tipoCombustivel: "Diesel",
      });
      await tripRef.set({
        ...tripFields,
        origem: "torque-auto",
        sessionId: tripId,
        deviceId: "test-device",
        dataInicio: admin.firestore.Timestamp.fromMillis(timestamp - 60_000),
        dataFim: admin.firestore.Timestamp.fromMillis(acc.lastTs),
        lastUpdate: acc.lastTs,
        distancia: 0.5,
        duracao: 1,
        consumoMedio: null,
        score: null,
        notified: true,
        acc,
      });

      await assert.rejects(
        finalizeCurrentVehicleTrip.run({
          auth: { uid: "other-user" },
          data: { vehicleId },
        }),
        (error) => error.code === "permission-denied",
      );

      const result = await finalizeCurrentVehicleTrip.run({
        auth: { uid: "owner-user" },
        data: { vehicleId },
      });
      assert.equal(result.tripId, tripId);
      assert.equal(result.alreadyFinalized, false);

      const finalizedTrip = await tripRef.get();
      assert.ok(finalizedTrip.data().diagnosticoProcessadoEm);
      assert.ok(finalizedTrip.data().tripFinalizadaEm);

      const continuationId = `${tripId}_part_${timestamp + 1_000}`;
      await vehicleRef.collection("leiturasObd").doc("reading-after-end").set({
        sessionId: tripId,
        deviceId: "test-device",
        timestamp: timestamp + 1_000,
        parsed: { speed: 30, rpm: 1500, coolant: 80 },
      });
      await waitFor(async () => {
        const [continuation, vehicle] = await Promise.all([
          vehicleRef.collection("viagens").doc(continuationId).get(),
          vehicleRef.get(),
        ]);
        return (
          continuation.exists &&
          vehicle.data().activeObdTripId === continuationId
        );
      });
      const continuation = await vehicleRef
        .collection("viagens")
        .doc(continuationId)
        .get();
      assert.ok(continuation.exists);
      assert.ok((await tripRef.get()).data().diagnosticoProcessadoEm);
    } finally {
      const [trips, readings, baselines] = await Promise.all([
        vehicleRef.collection("viagens").get(),
        vehicleRef.collection("leiturasObd").get(),
        vehicleRef.collection("baselines").get(),
      ]);
      await Promise.all([
        ...trips.docs.map((doc) => doc.ref.delete()),
        ...readings.docs.map((doc) => doc.ref.delete()),
        ...baselines.docs.map((doc) => doc.ref.delete()),
        vehicleRef.delete(),
      ]);
    }
  },
);

async function waitFor(condition) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail("Timed out waiting for Firestore trigger processing");
}
