// Script AUTÓNOMO para importar CSV do Torque (usa HTTPS, sem dependências)
// Uso: node standalone_csv_import.js caminho/para/ficheiro.csv

const fs = require("fs");
const https = require("https");
const readline = require("readline");

const CONFIG = {
  url: "https://us-central1-omeucarro-d3889.cloudfunctions.net/uploadTorqueData",
  vehicleId: "DPK7LP2GXiEibKmSQUVA",
  key: "79051526",
};

// Envia dados para Cloud Function
function uploadData(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      vehicleId: CONFIG.vehicleId,
      key: CONFIG.key,
      ...params,
    }).toString();

    const url = `${CONFIG.url}?${query}`;

    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          res.statusCode === 200
            ? resolve(data)
            : reject(new Error(`HTTP ${res.statusCode}`)),
        );
      })
      .on("error", reject);
  });
}

// Parse linha CSV (handle quotes básico)
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

async function importCSV(filePath) {
  console.log(`\n📂 CSV: ${filePath}\n`);

  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;
  let total = 0,
    success = 0,
    skipped = 0,
    errors = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    // Primeira linha = headers
    if (!headers) {
      headers = parseCSVLine(line);
      console.log(`✅ ${headers.length} colunas encontradas`);
      console.log(`\n📋 Campos chave identificados:`);
      const keyFields = [
        "Engine RPM(rpm)",
        "Speed (OBD)(km/h)",
        "Engine Coolant Temperature",
      ];
      headers
        .filter((h) => keyFields.some((k) => h.includes(k)))
        .forEach((h) => console.log(`   • ${h}`));
      console.log(`\n🚀 A enviar para Firebase...\n`);
      continue;
    }

    total++;
    const values = parseCSVLine(line);

    // Build object
    const row = {};
    headers.forEach((h, i) => {
      const val = values[i];
      if (val && val !== "-" && val.trim() !== "") {
        row[h] = val;
      }
    });

    // Skip se não tem dados relevantes
    if (!row["Engine RPM(rpm)"] && !row["Speed (OBD)(km/h)"]) {
      skipped++;
      continue;
    }

    // Upload
    try {
      await uploadData(row);
      success++;

      if (success % 5 === 0) {
        process.stdout.write(`\r✅ ${success} | ⏭ ${skipped} | ❌ ${errors}`);
      }
    } catch (err) {
      errors++;
      if (errors <= 2) console.error(`\n❌ Erro:`, err.message);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`\n\n📊 RESULTADO:`);
  console.log(`   Total: ${total}`);
  console.log(`   ✅ Enviados: ${success}`);
  console.log(`   ⏭  Ignorados (sem RPM/Speed): ${skipped}`);
  console.log(`   ❌ Erros: ${errors}`);
}

// Execução
const csvPath = process.argv[2];
if (!csvPath) {
  console.error("\n❌ Uso: node standalone_csv_import.js ficheiro.csv\n");
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`\n❌ Ficheiro não encontrado: ${csvPath}\n`);
  process.exit(1);
}

importCSV(csvPath)
  .then(() => console.log("\n✅ Import concluído! Verifica a app agora.\n"))
  .catch((err) => {
    console.error("\n❌ Erro fatal:", err.message);
    process.exit(1);
  });
