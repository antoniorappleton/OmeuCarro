// js/estatisticas.js

document.addEventListener("DOMContentLoaded", () => {
  // garantir que só corre com utilizador autenticado
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    carregarEstatisticas();
  });
});

async function carregarEstatisticas() {
  try {
    const abastecimentos = await getAbastecimentosDoUtilizador({
      limite: 500,
    });

    // --- agregações base ---
    let totalGasto = 0;
    let totalLitros = 0;
    let totalAbastecimentos = abastecimentos.length;

    const porMes = {}; // { "2024-01": {gasto, litros} }
    const porTipo = {}; // { gasolina: {litros} }
    const porPosto = {}; // { "Galp": {visitas,total} }

    let minOdo = null;
    let maxOdo = null;

    abastecimentos.forEach((abs) => {
      const litros = Number(abs.litros) || 0;
      const preco = Number(abs.precoPorLitro) || 0;
      const custoTotal = litros * preco;

      totalLitros += litros;
      totalGasto += custoTotal;

      // datas
      const d = abs.data ? new Date(abs.data) : null;
      if (d && !isNaN(d.getTime())) {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        const key = `${ano}-${mes}`;

        if (!porMes[key]) porMes[key] = { gasto: 0, litros: 0 };
        porMes[key].gasto += custoTotal;
        porMes[key].litros += litros;
      }

      // tipo combustível
      const tipo = abs.tipoCombustivel || "Outro";
      if (!porTipo[tipo]) porTipo[tipo] = { litros: 0 };
      porTipo[tipo].litros += litros;

      // posto
      const posto =
        abs.posto && abs.posto.trim() ? abs.posto.trim() : "Sem posto";
      if (!porPosto[posto]) porPosto[posto] = { visitas: 0, total: 0 };
      porPosto[posto].visitas += 1;
      porPosto[posto].total += custoTotal;

      // odómetro para eficiência estimada
      const odo = Number(abs.odometro);
      if (!isNaN(odo)) {
        if (minOdo === null || odo < minOdo) minOdo = odo;
        if (maxOdo === null || odo > maxOdo) maxOdo = odo;
      }
    });

    // --- KPIs ---
    const totalGastoEl = document.getElementById("kpi-total-gasto");
    const totalLitrosEl = document.getElementById("kpi-total-litros");
    const precoMedioEl = document.getElementById("kpi-preco-medio");
    const eficienciaEl = document.getElementById("kpi-eficiencia");

    const precoMedio = totalLitros > 0 ? totalGasto / totalLitros : 0;
    let eficiencia = 0;
    if (minOdo !== null && maxOdo !== null && totalLitros > 0) {
      const kmPercorridos = maxOdo - minOdo;
      if (kmPercorridos > 0) {
        eficiencia = kmPercorridos / totalLitros;
      }
    }

    if (totalGastoEl) totalGastoEl.textContent = `€${totalGasto.toFixed(2)}`;
    if (totalLitrosEl) totalLitrosEl.textContent = `${totalLitros.toFixed(0)}L`;
    if (precoMedioEl) precoMedioEl.textContent = `€${precoMedio.toFixed(3)}`;
    if (eficienciaEl)
      eficienciaEl.textContent = `${eficiencia.toFixed(1)} km/L`;

    // (por enquanto, trends ficam a 0 – depois podemos calcular vs mês anterior)

    // --- preparar dados por mês (últimos 6 meses) ---
    const chavesMes = Object.keys(porMes).sort(); // ascendente
    const ultimas6 = chavesMes.slice(-6);

    const labelsMeses = ultimas6.map((key) => {
      const [ano, mes] = key.split("-");
      return formatMesCurto(Number(mes));
    });

    const dadosGastoMes = ultimas6.map((key) => porMes[key].gasto);
    const dadosLitrosMes = ultimas6.map((key) => porMes[key].litros);

    // --- dados para preço ao longo do tempo (usa todos) ---
    const dadosPrecoLabels = [];
    const dadosPrecoValores = [];
    abastecimentos
      .slice()
      .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
      .forEach((abs) => {
        if (!abs.data) return;
        const d = new Date(abs.data);
        if (isNaN(d.getTime())) return;
        const label = `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;
        dadosPrecoLabels.push(label);
        dadosPrecoValores.push(Number(abs.precoPorLitro) || 0);
      });

    // --- dados por tipo ---
    const tiposLabels = Object.keys(porTipo);
    const tiposValores = tiposLabels.map((t) => porTipo[t].litros);

    // --- dados por posto (ordenar por visitas desc, top 4) ---
    const postosArray = Object.entries(porPosto).map(([nome, obj]) => ({
      nome,
      visitas: obj.visitas,
      total: obj.total,
    }));
    postosArray.sort((a, b) => b.visitas - a.visitas);
    const topPostos = postosArray.slice(0, 4);

    const postosLabels = topPostos.map((p) => p.nome);
    const postosVisitas = topPostos.map((p) => p.visitas);
    const postosTotais = topPostos.map((p) => p.total);

    // --- criar gráficos Chart.js ---

    const primaryColor = "#0c8c78";
    const secondaryColor = "#1b9b82";
    const accentColor = "#f59e0b";

    // Gastos mensais
    const ctxGastos = document
      .getElementById("chart-gastos-mensais")
      .getContext("2d");
    new Chart(ctxGastos, {
      type: "bar",
      data: {
        labels: labelsMeses,
        datasets: [
          {
            label: "Gastos (€)",
            data: dadosGastoMes,
            backgroundColor: primaryColor,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
      },
    });

    // Evolução do preço
    const ctxPreco = document.getElementById("chart-preco").getContext("2d");
    new Chart(ctxPreco, {
      type: "line",
      data: {
        labels: dadosPrecoLabels,
        datasets: [
          {
            label: "Preço €/L",
            data: dadosPrecoValores,
            borderColor: secondaryColor,
            backgroundColor: "rgba(27,155,130,0.15)",
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
      },
    });

    // Distribuição por tipo
    const ctxTipos = document.getElementById("chart-tipos").getContext("2d");
    new Chart(ctxTipos, {
      type: "doughnut",
      data: {
        labels: tiposLabels,
        datasets: [
          {
            data: tiposValores,
            backgroundColor: [
              primaryColor,
              secondaryColor,
              accentColor,
              "#4b5563",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "right" } },
      },
    });

    // Postos mais visitados (barras horizontais)
    const ctxPostos = document.getElementById("chart-postos").getContext("2d");
    new Chart(ctxPostos, {
      type: "bar",
      data: {
        labels: postosLabels,
        datasets: [
          {
            label: "Visitas",
            data: postosVisitas,
            backgroundColor: primaryColor,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
      },
    });

    // Consumo mensal (litros)
    const ctxLitros = document
      .getElementById("chart-litros-mensais")
      .getContext("2d");
    new Chart(ctxLitros, {
      type: "bar",
      data: {
        labels: labelsMeses,
        datasets: [
          {
            label: "Litros",
            data: dadosLitrosMes,
            backgroundColor: secondaryColor,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
      },
    });
  } catch (err) {
    console.error("Erro a carregar estatísticas:", err);
    alert("Erro ao carregar estatísticas.");
  }
}

// helper para traduzir número do mês em "Set", "Out", etc.
function formatMesCurto(m) {
  const nomes = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return nomes[m - 1] || "";
}
