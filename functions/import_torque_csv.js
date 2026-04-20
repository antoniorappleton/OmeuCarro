const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { CSV_DATA } = require("./torque_data");

// ⚠️ CONFIGURATION ⚠️
const VEICULO_ID = "DPK7LP2GXiEibKmSQUVA";

// Simple CSV Parser (handles quotes roughly, assuming standard Torque export)
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === "-") continue;

    // Torque CSVs sometimes have a separator line like "-------"
    // But this user's data has rows starting with "-", so we must be specific.
    // Only skip if the line seems to be ONLY dashes (separator)
    if (line.startsWith("---")) continue;

    // Basic split by comma. Note: Torque export doesn't usually quote fields unless needed.
    // If complex parsing is needed, we'd use a library, but for this task, split is likely robust enough if no commas in values.
    const values = line.split(",");

    const row = {};
    headers.forEach((header, index) => {
      let val = values[index];
      if (val === "-") val = null; // Torque uses '-' for missing data
      row[header] = val;
    });
    results.push(row);
  }
  return results;
}

// Map CSV headers to Firestore fields (matching torque.js logic)
function mapRowToReading(row) {
  const getNum = (header) => {
    const val = row[header];
    if (!val) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  };

  // Date Parsing
  // Format: 06-fev.-2026 07:49:38.956
  // We attempt to parse natively, or custom parse if needed.
  // Replace 'fev.' with 'Feb' etc if needed?
  // Let's try native Date parse first after some cleanup.
  let dateStr = row["Device Time"];
  if (!dateStr) return null;

  // Quick fix for Portuguese months if standard Date() fails
  // 06-fev.-2026 -> 06 Feb 2026
  const ptMonths = {
    "jan.": "Jan",
    "fev.": "Feb",
    "mar.": "Mar",
    "abr.": "Apr",
    "mai.": "May",
    "jun.": "Jun",
    "jul.": "Jul",
    "ago.": "Aug",
    "set.": "Sep",
    "out.": "Oct",
    "nov.": "Nov",
    "dez.": "Dec",
  };
  for (const [pt, en] of Object.entries(ptMonths)) {
    if (dateStr.toLowerCase().includes(pt)) {
      dateStr = dateStr.toLowerCase().replace(pt, en);
      break;
    }
  }

  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) {
    console.warn("Invalid Date:", row["Device Time"], "->", dateStr);
    return null;
  }

  // Mapping
  // Headers from user content:
  // Speed (OBD)(km/h)
  // Engine RPM(rpm)
  // Odometer(from ECU)(km)
  // Fuel Level (From Engine ECU)(%)
  // Engine Coolant Temperature(°C) -> careful with encoding, might just search for 'Coolant'
  // Latitude, Longitude

  const findHeaderPriority = (exactList, fallbackList) => {
    for (const exact of exactList) {
      const found = Object.keys(row).find(
        (k) => k.toLowerCase().trim() === exact.toLowerCase(),
      );
      if (found) return found;
    }
    for (const fb of fallbackList) {
      const found = Object.keys(row).find((k) =>
        k.toLowerCase().includes(fb.toLowerCase()),
      );
      if (found) return found;
    }
    return null;
  };

  const odoKey = findHeaderPriority(
    ["Odometer(from ECU)(km)", "Odometer (from ECU)(km)", "Odometer (km)"],
    ["Odometer"],
  );
  const speedObdKey = findHeaderPriority(
    ["Speed (OBD)(km/h)", "Speed (OBB)(km/h)"],
    ["Speed (OBD)"],
  );
  const speedGpsKey = findHeaderPriority(
    [
      "Speed (GPS)(km/h)",
      "GPS Speed (Meters/second)",
      "Speed (GPS)(Meters/second)",
    ],
    ["Speed (GPS)", "GPS Speed"],
  );
  const rpmKey = findHeaderPriority(
    ["Engine RPM(rpm)", "Engine RPM (rpm)"],
    ["RPM", "Rotações"],
  );
  const fuelKey = findHeaderPriority(
    ["Fuel Level (From Engine ECU)(%)", "Fuel Level"],
    ["Fuel Level"],
  );
  const coolantKey = findHeaderPriority(
    ["Engine Coolant Temperature(°C)", "Engine Coolant Temperature"],
    ["Coolant", "Temperatura"],
  );
  const loadKey = findHeaderPriority(
    ["Engine Load(%)", "Engine Load"],
    ["Engine Load"],
  );
  const latKey = "Latitude";
  const lonKey = "Longitude";

  // Speed Logic: Priority OBD > GPS
  const sObd = getNum(speedObdKey);
  const sGps = getNum(speedGpsKey);
  let finalSpeed = sObd;
  if (finalSpeed === null && sGps !== null) {
    if (speedGpsKey && speedGpsKey.toLowerCase().includes("meters/second")) {
      finalSpeed = sGps * 3.6;
    } else {
      finalSpeed = sGps;
    }
  }

  const parsed = {
    speed: finalSpeed,
    rpm: getNum(rpmKey),
    odometer: getNum(odoKey),
    fuelLevel: getNum(fuelKey),
    coolant: getNum(coolantKey),
    engineLoad: getNum(loadKey),
    location: null,
  };

  const lat = getNum(latKey);
  const lon = getNum(lonKey);
  if (lat && lon) {
    parsed.location = new admin.firestore.GeoPoint(lat, lon);
  }

  return {
    vehicleId: VEICULO_ID,
    timestamp: timestamp,
    receivedAt: admin.firestore.Timestamp.fromMillis(timestamp),
    sessionId: "manual_import_" + new Date().toISOString().split("T")[0],
    deviceId: "manual_csv",
    email: "manual@import",
    raw: { ...row }, // Store original
    parsed: parsed,
  };
}

exports.importTorqueCsv = onRequest(async (req, res) => {
  const db = admin.firestore();

  try {
    // 1. Parsing
    console.log("Parsing CSV data...");
    const rawRows = parseCSV(CSV_DATA); // Using the imported data file
    console.log(`Parsed ${rawRows.length} rows.`);

    // 2. Mapping
    const readings = [];
    for (const row of rawRows) {
      const reading = mapRowToReading(row);
      if (reading) readings.push(reading);
    }
    console.log(`Mapped ${readings.length} valid readings.`);

    if (readings.length === 0) {
      return res.send("No valid readings found to import.");
    }

    // 3. Batch Write
    // Firestore batch limit is 500
    const chunks = [];
    while (readings.length > 0) {
      chunks.push(readings.splice(0, 450));
    }

    let stats = { success: 0, batches: 0 };

    for (const chunk of chunks) {
      const batch = db.batch();
      const collectionRef = db
        .collection("veiculos")
        .doc(VEICULO_ID)
        .collection("leiturasObd");

      for (const r of chunk) {
        const docRef = collectionRef.doc(); // Auto-ID or construct one from timestamp? Auto is safer.
        batch.set(docRef, r);
      }

      await batch.commit();
      stats.success += chunk.length;
      stats.batches++;
    }

    // 4. Update Vehicle Last State
    // We want the Dashboard to reflect the imported data immediately.
    // Find the reading with the latest timestamp.
    readings.sort((a, b) => b.timestamp - a.timestamp);
    const latest = readings[0];

    if (latest && latest.parsed) {
      console.log("Updating vehicle state with latest reading:", latest.parsed);
      const updatePayload = {};

      if (latest.parsed.odometer > 0)
        updatePayload.odometroAtual = latest.parsed.odometer;
      if (latest.parsed.fuelLevel > 0)
        updatePayload.nivelCombustivel = latest.parsed.fuelLevel;
      if (latest.parsed.location)
        updatePayload.localizacao = latest.parsed.location;

      // Always update the 'lastObdUpdate' timestamp
      updatePayload.ultimaLeituraObd =
        admin.firestore.FieldValue.serverTimestamp();

      await db.collection("veiculos").doc(VEICULO_ID).update(updatePayload);
    }

    res.send({
      status: "Success",
      importedRecords: stats.success,
      batches: stats.batches,
      vehicleId: VEICULO_ID,
      sampleDate: rawRows[0] ? rawRows[0]["Device Time"] : "N/A",
    });
  } catch (error) {
    console.error("Import Error:", error);
    res.status(500).send("Error: " + error.message);
  }
});
