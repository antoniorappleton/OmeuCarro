const admin = require("firebase-admin");
const https = require("https");

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "omeucarro-d3889",
  });
}

// Configuração
const VEHICLE_ID = "DPK7LP2GXiEibKmSQUVA"; // Use the real one or a test one
const SECRET_KEY = "79051526"; // From the user prompt
const CLOUD_URL = "https://uploadtorquedata-5jojqy2jpa-uc.a.run.app";

async function verifyTorqueFixes() {
  console.log("🚀 Iniciando Simulação de Viagem Real (Múltiplas leituras)");

  const baseTime = Date.now() - 600000; // Começar 10 min atrás

  const readings = [
    { speed: 40, rpm: 2000, dist: 0.1, torque: 120, hp: 60 },
    { speed: 60, rpm: 2500, dist: 1.2, torque: 180, hp: 110 },
    { speed: 85, rpm: 3000, dist: 3.5, torque: 200, hp: 130 },
    { speed: 70, rpm: 2200, dist: 5.8, torque: 150, hp: 90 },
    { speed: 50, rpm: 1800, dist: 8.2, torque: 100, hp: 50 },
  ];

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const sequenceTime = Math.floor((baseTime + i * 60000) / 1000); // 1 min entre leituras

    const payload = new URLSearchParams({
      vehicleId: VEHICLE_ID,
      key: SECRET_KEY,
      time: sequenceTime.toString(),
      kd: r.speed.toString(),
      kc: r.rpm.toString(),
      k4: "45",
      "Trip Distance(km)": r.dist.toString(),
      "Torque(Nm)": r.torque.toString(),
      "Horsepower (At the wheels)(hp)": r.hp.toString(),
      "Trip average(l/100km)": "6.5",
    });

    const fullUrl = `${CLOUD_URL}?${payload.toString()}`;
    console.log(
      `📡 Enviando leitura ${i + 1}/${readings.length} (Dist: ${r.dist}km)...`,
    );

    await new Promise((resolve, reject) => {
      https
        .get(fullUrl, (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        })
        .on("error", reject);
    });

    // Pequena pausa entre requests para não sobrecarregar
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(
    "✅ Todas as leituras enviadas. Aguardando 3s para o processamento do Trigger...",
  );
  await new Promise((r) => setTimeout(r, 3000));

  const db = admin.firestore();
  const tripSnap = await db
    .collection("veiculos")
    .doc(VEHICLE_ID)
    .collection("viagens")
    .orderBy("lastUpdate", "desc")
    .limit(1)
    .get();

  if (!tripSnap.empty) {
    const trip = tripSnap.docs[0].data();
    console.log("📊 RESUMO DA VIAGEM DETETADA:");
    console.log(`   - Distância Total: ${trip.distancia} km`);
    console.log(
      `   - Velocidade Média: ${Math.round(trip.velocidadeMedia)} km/h (Média dos pontos)`,
    );
    console.log(`   - RPM Médio: ${Math.round(trip.metricas.rpmMedio)} rpm`);
    console.log(
      `   - Estado: ${new Date(trip.lastUpdate).toLocaleTimeString()}`,
    );
    console.log(
      "\n🚀 VERIFICAÇÃO CONCLUÍDA: A UI deve mostrar agora as médias desta viagem!",
    );
  }
}

verifyTorqueFixes().catch(console.error);
