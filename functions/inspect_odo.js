const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function run() {
  try {
    const veiculos = await db.collection("veiculos").get();
    console.log("LISTA DE VEÍCULOS E ODÓMETRO ATUAL:");
    veiculos.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Marca: ${data.marca} | Modelo: ${data.modelo} | Odo Atual: ${data.odometroAtual}`);
    });

    // Diagnóstico específico para o valor 141000
    for (const vDoc of veiculos.docs) {
      console.log(`\nVerificando leituras de hoje para ${vDoc.id}...`);
      const readings = await vDoc.ref.collection("leiturasObd")
        .where("timestamp", ">=", 1739145600000) // 10 de Fev 00:00:00 (timestamp aproximado local)
        .orderBy("timestamp", "asc")
        .get();

      readings.forEach(r => {
        const rData = r.data();
        if (rData.parsed && (rData.parsed.odometer > 100000 || rData.parsed.tripDistance > 0)) {
           console.log(`  [${new Date(rData.timestamp).toLocaleTimeString()}] Odo: ${rData.parsed.odometer} | TripDist: ${rData.parsed.tripDistance} | Raw a6: ${rData.raw?.a6}`);
        }
      });
    }

  } catch (err) {
    console.error("ERRO NO DIAGNÓSTICO:", err);
  }
}

run();
