window.addEventListener("load", async () => {
  const user = auth.currentUser;

  if (!user) return;

  const snapshot = await getUserDocuments("abastecimentos");

  let litros = 0;
  let gastos = 0;

  snapshot.forEach(doc => {
    const d = doc.data();
    litros += d.litros;
    gastos += d.litros * d.precoPorLitro;
  });

  document.getElementById("kpi-litros").textContent = litros.toFixed(1) + " L";
  document.getElementById("kpi-gastos").textContent = "€" + gastos.toFixed(2);
});
