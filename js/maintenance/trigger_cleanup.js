const https = require("https");

const URL =
  "https://us-central1-omeucarro-d3889.cloudfunctions.net/cleanupManualRecords";

console.log(`A iniciar pedido de limpeza para: ${URL}`);

https
  .get(URL, (res) => {
    let data = "";

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      console.log(`\nStatus Code: ${res.statusCode}`);
      console.log("Resposta:", data);

      if (res.statusCode === 200) {
        console.log("\n✅ Limpeza concluída com sucesso!");
      } else {
        console.error(
          "\n❌ Erro na limpeza. Verifica os logs da Cloud Function.",
        );
      }
    });
  })
  .on("error", (err) => {
    console.error("Erro no pedido:", err.message);
  });
