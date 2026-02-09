const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "omeucarro-d3889",
  });
}

const db = admin.firestore();
const VEHICLE_ID = "DPK7LP2GXiEibKmSQUVA";

async function cleanupTrips() {
  console.log("🔍 Analisando viagens para o veículo:", VEHICLE_ID);

  const tripsRef = db
    .collection("veiculos")
    .doc(VEHICLE_ID)
    .collection("viagens");
  const snap = await tripsRef.orderBy("dataInicio", "desc").get();

  if (snap.empty) {
    console.log("✅ Nenhuma viagem encontrada.");
    return;
  }

  console.log(`📦 Analisando ${snap.docs.length} registos...`);

  const toDelete = [];
  const seenStartTimes = new Set();

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const startTimeStr = data.dataInicio.toDate().toISOString();

    // 1. Identificar Duplicados (mesmo tempo de início)
    if (seenStartTimes.has(startTimeStr)) {
      console.log(
        `🗑️  Agendado para eliminar (Duplicado): ${startTimeStr} [ID: ${doc.id}]`,
      );
      toDelete.push(doc.id);
      return;
    }
    seenStartTimes.add(startTimeStr);

    // 2. Identificar "Lixo" de teste (distância insignificante < 1km se existirem viagens maiores no mesmo dia)
    if (data.distancia < 0.2) {
      console.log(
        `🗑️  Agendado para eliminar (Ruído < 0.2km): ${startTimeStr} [ID: ${doc.id}]`,
      );
      toDelete.push(doc.id);
      return;
    }

    // 3. Identificar trips de teste (marcadas com torque-auto mas distância exata do verify_torque_v2)
    if (data.distancia === 12.5) {
      console.log(
        `🗑️  Agendado para eliminar (Teste 12.5km): ${startTimeStr} [ID: ${doc.id}]`,
      );
      toDelete.push(doc.id);
      return;
    }
  });

  if (toDelete.length === 0) {
    console.log("✅ Nada para limpar.");
    return;
  }

  console.log(`\n🚀 Eliminando ${toDelete.length} registos...`);
  const batch = db.batch();
  toDelete.forEach((id) => batch.delete(tripsRef.doc(id)));
  await batch.commit();

  console.log("✅ Concluído! O teu histórico está agora limpo e lógico.");
}

cleanupTrips().catch(console.error);
