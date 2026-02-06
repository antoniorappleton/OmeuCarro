const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// ⚠️ HARDCODED DATA ⚠️
// User has not provided data yet, so leaving this array empty but ready.
const IMPORT_PAYLOAD = {
  veiculoId: "DPK7LP2GXiEibKmSQUVA", 
  data: [
    // EXAMPLE:
    // { data: "2024-01-01", odometro: 100000, litros: 50, precoPorLitro: 1.60, posto: "Exemplo", observacoes: "Import" },
  ]
};

exports.importFuelData = onRequest(async (req, res) => {
  // Allow simple GET for browser testing or POST for programmatic
  const method = req.method;
  
  if (method === 'GET' && req.query.run !== 'true') {
     res.send(`
       <h1>Manual Import Tool</h1>
       <p>Vehicle: <strong>${IMPORT_PAYLOAD.veiculoId}</strong></p>
       <p>Records to Import: <strong>${IMPORT_PAYLOAD.data.length}</strong></p>
       <p>To execute, add <code>?run=true</code> to the URL.</p>
     `);
     return;
  }

  const db = admin.firestore();
  const batch = db.batch();
  const collectionRef = db.collection("veiculos").doc(IMPORT_PAYLOAD.veiculoId).collection("abastecimentos");

  try {
    let count = 0;
    for (const item of IMPORT_PAYLOAD.data) {
       const docRef = collectionRef.doc();
       
       // Sanitize
       const payload = {
         data: item.data, // YYYY-MM-DD
         odometro: Number(item.odometro),
         litros: Number(item.litros),
         precoPorLitro: Number(item.precoPorLitro || 0),
         tipoCombustivel: item.tipoCombustivel || "Gasolina 95",
         posto: item.posto || "Import",
         observacoes: item.observacoes || "Imported via HTTP",
         completo: true,
         criadoEm: admin.firestore.FieldValue.serverTimestamp(),
         importadoEm: admin.firestore.FieldValue.serverTimestamp(),
       };

       batch.set(docRef, payload);
       count++;
    }

    if (count > 0) {
      await batch.commit();
      res.send(`✅ Success! Imported ${count} records for vehicle ${IMPORT_PAYLOAD.veiculoId}.`);
    } else {
      res.send("⚠️ No records found in IMPORT_PAYLOAD.data array.");
    }

  } catch (error) {
    console.error(error);
    res.status(500).send(`Error: ${error.message}`);
  }
});
