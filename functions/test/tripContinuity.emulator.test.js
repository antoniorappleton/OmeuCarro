// Regressão (27/11/2026): uma mudança de sessão a meio da condução partia a
// viagem em duas. Uma sessão nova até 5 min depois da última leitura deve
// continuar a viagem ativa; depois de uma pausa maior abre-se viagem nova.
const test = require("node:test");
const assert = require("node:assert/strict");

test(
  "nova sessão a meio da condução continua a viagem; após pausa longa abre outra",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-omeucarro" });
    }
    const db = admin.firestore();
    require("../tripDetector"); // regista o trigger no emulador
    const vehicleId = `testcont_${Date.now()}`;
    const vehicleRef = db.collection("veiculos").doc(vehicleId);
    const t0 = Date.now() - 60 * 60 * 1000;

    const write = (id, sessionId, offsetS, speed = 50) =>
      vehicleRef.collection("leiturasObd").doc(id).set({
        vehicleId,
        sessionId,
        deviceId: "dev",
        timestamp: t0 + offsetS * 1000,
        parsed: { speed, rpm: 1500, coolant: 85, voltage: 14.1 },
      });

    try {
      await vehicleRef.set({ userId: "owner-user", tipoCombustivel: "Diesel" });

      await write("a1", "S-A", 0);
      await waitForTrip(vehicleRef, "S-A", (t) => t.acc?.n >= 1);
      await write("a2", "S-A", 60);
      await waitForTrip(vehicleRef, "S-A", (t) => t.acc?.n >= 2);

      // Sessão nova 30 s depois (app reiniciada): mesma viagem
      await write("b1", "S-B", 90);
      await waitForTrip(vehicleRef, "S-A", (t) => t.acc?.n >= 3);
      const merged = (await vehicleRef.collection("viagens").doc("S-A").get()).data();
      assert.deepEqual(merged.sessionIds, ["S-A", "S-B"]);
      assert.equal(merged.sessionId, null);
      assert.ok(merged.distancia > 1, `distância acumulada ${merged.distancia}`);
      assert.equal((await vehicleRef.collection("viagens").doc("S-B").get()).exists, false);

      // Sessão nova após 20 min parado: viagem nova
      await write("c1", "S-C", 90 + 20 * 60);
      await waitForTrip(vehicleRef, "S-C", (t) => t.acc?.n >= 1);
      const trips = await vehicleRef.collection("viagens").get();
      assert.deepEqual(trips.docs.map((d) => d.id).sort(), ["S-A", "S-C"]);
    } finally {
      const [trips, readings, baselines] = await Promise.all([
        vehicleRef.collection("viagens").get(),
        vehicleRef.collection("leiturasObd").get(),
        vehicleRef.collection("baselines").get(),
      ]);
      await Promise.all([
        ...trips.docs.map((d) => d.ref.delete()),
        ...readings.docs.map((d) => d.ref.delete()),
        ...baselines.docs.map((d) => d.ref.delete()),
        vehicleRef.delete(),
      ]);
    }
  },
);

async function waitForTrip(vehicleRef, tripId, predicate) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snap = await vehicleRef.collection("viagens").doc(tripId).get();
    if (snap.exists && predicate(snap.data())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Timed out waiting for trip ${tripId}`);
}
