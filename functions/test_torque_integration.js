const admin = require("firebase-admin");
const https = require("https");
const http = require("http");

// Configuração
const VEHICLE_ID = "TEST_VEHICLE";
const SECRET_KEY = process.env.TORQUE_UPLOAD_KEY;
const TARGET_URL = process.env.TARGET_URL; // URL completo da função (Prod)

if (!SECRET_KEY) {
  console.error("❌ Erro: Env var TORQUE_UPLOAD_KEY em falta.");
  process.exit(1);
}

// Se não houver TARGET_URL, assumimos Emulador
const IS_EMULATOR = !TARGET_URL;

if (IS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.GCLOUD_PROJECT = "omeucarro";
  admin.initializeApp({ projectId: "omeucarro" });
} else {
  // Em prod, não inicializamos admin para setup/verify porque exige credenciais locais complexas
  // Apenas enviamos o request.
  console.log("🌍 Running in PRODUCTION mode (Send Only)");
}

const db = IS_EMULATOR ? admin.firestore() : null;

async function setup() {
  if (!IS_EMULATOR) {
    console.log("⚠️  Skipping SETUP in Prod (Please ensure vehicle exists manually or logic works without it)");
    return;
  }
  console.log("🛠️  Creating Test Vehicle...");
  await db.collection("veiculos").doc(VEHICLE_ID).set({
    nome: "Carro Teste",
    odometroAtual: 100000,
    nivelCombustivel: 50,
    pidMap: {
      odometer: "a6",
      fuelLevel: "2f"
    }
  });
  console.log("✅ Vehicle created.");
}

function sendRequest() {
  return new Promise((resolve, reject) => {
    console.log(`📡 Sending Torque Data to ${IS_EMULATOR ? "Emulator" : "Production"}...`);
    
    // Dados simulados
    const query = new URLSearchParams({
      vehicleId: VEHICLE_ID,
      key: SECRET_KEY,
      time: Date.now().toString(),
      kd: "50",    // Speed
      kc: "2200",  // RPM
      a6: "100120", // Odometer
      "2f": "67"   // Fuel
    });

    let reqUrl;
    if (IS_EMULATOR) {
      reqUrl = `http://127.0.0.1:5001/omeucarro/us-central1/uploadTorqueData?${query.toString()}`;
    } else {
      reqUrl = `${TARGET_URL}?${query.toString()}`;
    }
    
    const client = reqUrl.startsWith("https") ? https : http;

    const req = client.get(reqUrl, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200 && data.trim() === "OK") {
           console.log("✅ Request success: 200 OK");
           resolve();
        } else if (res.statusCode === 404) {
           console.error(`❌ Erro 404: Veículo não encontrado.`);
           console.error(`👉 Tens de criar o documento "TEST_VEHICLE" manualmente na consola:`);
           console.error(`   https://console.firebase.google.com/project/omeucarro-d3889/firestore/data/veiculos`);
           reject(new Error("Vehicle not found"));
        } else {
           console.error(`❌ Request failed: ${res.statusCode} ${data}`);
           reject(new Error("Request failed"));
        }
      });
    });

    req.on("error", reject);
  });
}

async function verify() {
  if (!IS_EMULATOR) {
    console.log("⚠️  Skipping VERIFY in Prod (Check Firestore Console manually)");
    return;
  }
  
  console.log("🔍 Verifying Firestore Updates...");
  await new Promise(r => setTimeout(r, 1000));

  const doc = await db.collection("veiculos").doc(VEHICLE_ID).get();
  const data = doc.data();

  if (data.odometroAtual !== 100120) throw new Error(`Odometer mismatch!`);
  
  console.log(`✅ Success! Data updated correctly.`);
}

async function run() {
  try {
    await setup();
    await sendRequest();
    await verify();
    process.exit(0);
  } catch (e) {
    console.error("❌ Test Failed:", e);
    process.exit(1);
  }
}

run();
