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
  // Configuração Global do Chart.js para alto contraste (com suporte a Dark Mode)
  if (typeof Chart !== "undefined") {
    const isDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    Chart.defaults.color = isDark ? "#cbd5e1" : "#0f172a"; // slate-300 vs slate-900
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.scale.grid.color = isDark ? "#334155" : "#e2e8f0";
  }

  try {
    const abastecimentos = await getTodosAbastecimentosDoUtilizador(500);

    // --- ORDENAR por Data ASC (para calcular deltas) ---
    abastecimentos.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

    // --- AGREGAÇÕES ---
    let totalGasto = 0;
    let totalLitros = 0;

    const porMes = {}; // "YYYY-MM": { gasto, litros, kmPercorridos }
    const porTipo = {}; // "Gasolina": { litros }
    const porPosto = {}; // "Galp": { visitas, totalGasto, litros, precosSum }

    // Variáveis para cálculo de eficiência global
    let minOdo = null;
    let maxOdo = null;

    // Variáveis para delta de odómetro
    let lastOdo = null;
    let lastVeiculoId = null; // Para não misturar km de carros diferentes se a query trouxer mistura (embora getTodos ordene, convém cuidado)

    abastecimentos.forEach((abs) => {
      const litros = Number(abs.litros) || 0;
      const preco = Number(abs.precoPorLitro) || 0;
      const custoTotal = litros * preco;
      const odo = Number(abs.odometro);
      const veiculoId = abs.veiculoId || "unknown"; // Se multi-carro

      totalLitros += litros;
      totalGasto += custoTotal;

      // 1. Agrupar por data (Mês)
      let mesKey = null;
      const d = abs.data ? new Date(abs.data) : null;
      if (d && !isNaN(d.getTime())) {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        mesKey = `${ano}-${mes}`;

        if (!porMes[mesKey]) {
          porMes[mesKey] = { gasto: 0, litros: 0, kmPercorridos: 0 };
        }
        porMes[mesKey].gasto += custoTotal;
        porMes[mesKey].litros += litros;
      }

      // 2. Agrupar por Tipo
      const tipo = abs.tipoCombustivel || "Outro";
      if (!porTipo[tipo]) porTipo[tipo] = { litros: 0 };
      porTipo[tipo].litros += litros;

      // 3. Agrupar por Posto
      const posto =
        abs.posto && abs.posto.trim() ? abs.posto.trim() : "Sem posto";
      if (!porPosto[posto])
        porPosto[posto] = {
          visitas: 0,
          totalGasto: 0,
          litros: 0,
          precosSum: 0,
        };
      porPosto[posto].visitas += 1;
      porPosto[posto].totalGasto += custoTotal;
      porPosto[posto].litros += litros;
      porPosto[posto].precosSum += preco; // Média simples dos registos (ou ponderada, aqui simples)

      // 4. Odómetro Global (Min/Max)
      if (!isNaN(odo)) {
        if (minOdo === null || odo < minOdo) minOdo = odo;
        if (maxOdo === null || odo > maxOdo) maxOdo = odo;
      }

      // 5. Delta Km (Mensal)
      // Nota: isto assume que os registos estão ordenados por data.
      // Se tivermos vários veículos, o ideal era separar, mas para simplificar assumimos
      // que se o utilizador tem 1 carro principal, o delta funciona.
      // Se quisermos ser robustos, resetamos lastOdo se mudar de veiculoId (se a lista vier misturada).
      // Como `getTodosAbastecimentosDoUtilizador` traz tudo, vamos tentar ser espertos:
      // Se não tivermos odo atual, ignoramos.
      if (!isNaN(odo)) {
        // Se mudou de carro ou é o primeiro registo deste carro neste loop (assumindo sort por data global),
        // resetamos ou tentamos manter tracking por veiculo.
        // Simplificação: Delta entre registo N e N-1
        if (lastOdo !== null && odo > lastOdo) {
          const delta = odo - lastOdo;
          // Atribuir este delta ao mês ATUAL (ou anterior? Geralmente ao atual)
          if (mesKey && porMes[mesKey]) {
            porMes[mesKey].kmPercorridos += delta;
          }
        }
        lastOdo = odo;
      }
    });

    // --- KPIs GLOBAIS ---
    const totalGastoEl = document.getElementById("kpi-total-gasto");
    const totalLitrosEl = document.getElementById("kpi-total-litros");
    const precoMedioEl = document.getElementById("kpi-preco-medio");
    const eficienciaEl = document.getElementById("kpi-eficiencia");

    const precoMedio = totalLitros > 0 ? totalGasto / totalLitros : 0;

    // Eficiência Global (Max Odo - Min Odo) / Litros Totais
    let eficiencia = 0;
    if (minOdo !== null && maxOdo !== null && totalLitros > 0) {
      const distTotal = maxOdo - minOdo;
      if (distTotal > 0) eficiencia = distTotal / totalLitros;
    }

    if (totalGastoEl) totalGastoEl.textContent = `€${totalGasto.toFixed(2)}`;
    if (totalLitrosEl) totalLitrosEl.textContent = `${totalLitros.toFixed(0)}L`;
    if (precoMedioEl) precoMedioEl.textContent = `€${precoMedio.toFixed(3)}`;
    if (eficienciaEl)
      eficienciaEl.textContent = `${eficiencia.toFixed(1)} km/L`;

    // --- PREPARAÇÃO DADOS GRÁFICOS (Últimos 6 Meses) ---
    const allMonths = Object.keys(porMes).sort();
    const last6 = allMonths.slice(-6);

    const labelsMeses = last6.map((m) => {
      const [ano, mes] = m.split("-");
      return formatMesCurto(Number(mes));
    });

    const dataGasto = last6.map((m) => porMes[m].gasto);
    const dataLitros = last6.map((m) => porMes[m].litros);
    const dataKm = last6.map((m) => porMes[m].kmPercorridos);

    // Custo por 100km mensal: (Gasto / Km) * 100
    const dataCusto100 = last6.map((m) => {
      const g = porMes[m].gasto;
      const k = porMes[m].kmPercorridos;
      if (k > 0) return (g / k) * 100;
      return 0;
    });

    // --- PREPARAÇÃO POSTOS MAIS BARATOS (Top 5 Menor Preço Médio) ---
    // Filtramos postos com > 1 visita para evitar outliers de uma só vez
    const postosBaratos = Object.entries(porPosto)
      .map(([nome, dados]) => {
        // Média de preço = somaPrecos / visitas
        // OU custo / litros (mais preciso se tivermos custo total e litros totais)
        let precoMedioReal = 0;
        if (dados.litros > 0) {
          precoMedioReal = dados.totalGasto / dados.litros;
        }
        return { nome, precoMedio: precoMedioReal, visitas: dados.visitas };
      })
      .filter((p) => p.visitas > 0 && p.precoMedio > 0)
      .sort((a, b) => a.precoMedio - b.precoMedio) // Do mais barato para o mais caro
      .slice(0, 5); // Top 5

    const labelsPostosBaratos = postosBaratos.map(
      (p) => `${p.nome} (€${p.precoMedio.toFixed(3)})`
    );
    const dataPostosBaratos = postosBaratos.map((p) => p.precoMedio);

    // #############################################
    // RENDER CHART.JS
    // #############################################

    const primaryColor = "#0c8c78"; // Teal
    const secondaryColor = "#1b9b82"; // Lighter Teal
    const accentColor = "#f59e0b"; // Orange/Amber
    const infoColor = "#3b82f6"; // Blue

    // 1. GASTOS MENSAIS
    new Chart(document.getElementById("chart-gastos-mensais"), {
      type: "bar",
      data: {
        labels: labelsMeses,
        datasets: [
          {
            label: "Total (€)",
            data: dataGasto,
            backgroundColor: primaryColor,
            borderRadius: 4,
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    // 2. CONSUMO LITROS (Mensal)
    new Chart(document.getElementById("chart-litros-mensais"), {
      type: "bar",
      data: {
        labels: labelsMeses,
        datasets: [
          {
            label: "Litros",
            data: dataLitros,
            backgroundColor: infoColor,
            borderRadius: 4,
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    // 3. EVOLUÇÃO PREÇO (Geral - todos os dados timeline)
    // Recriar array de timeline global para este gráfico específico
    const timelineLabels = [];
    const timelineValues = [];
    abastecimentos.forEach((abs) => {
      if (!abs.data) return;
      const d = new Date(abs.data);
      timelineLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      timelineValues.push(Number(abs.precoPorLitro) || 0);
    });

    new Chart(document.getElementById("chart-preco"), {
      type: "line",
      data: {
        labels: timelineLabels,
        datasets: [
          {
            label: "Preço €/L",
            data: timelineValues,
            borderColor: secondaryColor,
            backgroundColor: "rgba(27,155,130,0.1)",
            tension: 0.1,
            fill: true,
            pointRadius: 2,
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    // 4. DISTRIBUIÇÃO POR TIPO
    new Chart(document.getElementById("chart-tipos"), {
      type: "doughnut",
      data: {
        labels: Object.keys(porTipo),
        datasets: [
          {
            data: Object.keys(porTipo).map((k) => porTipo[k].litros),
            backgroundColor: [primaryColor, accentColor, infoColor, "#64748b"],
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: "right" } } },
    });

    // 5. POSTOS MAIS VISITADOS (mantido lógica antiga, recriada aqui simples)
    // Ordenar por visitas desc
    const postosVisitados = Object.entries(porPosto)
      .map(([n, d]) => ({ nome: n, visitas: d.visitas }))
      .sort((a, b) => b.visitas - a.visitas)
      .slice(0, 5);

    new Chart(document.getElementById("chart-postos"), {
      type: "bar",
      data: {
        labels: postosVisitados.map((p) => p.nome),
        datasets: [
          {
            label: "Visitas",
            data: postosVisitados.map((p) => p.visitas),
            backgroundColor: primaryColor,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
      },
    });

    // === NOVOS GRÁFICOS ===

    // 6. DISTÂNCIA MENSAL (km)
    new Chart(document.getElementById("chart-km-mensais"), {
      type: "bar",
      data: {
        labels: labelsMeses,
        datasets: [
          {
            label: "Km Percorridos",
            data: dataKm,
            backgroundColor: accentColor,
            borderRadius: 4,
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    // 7. CUSTO POR 100KM (€)
    new Chart(document.getElementById("chart-custo-100km"), {
      type: "line",
      data: {
        labels: labelsMeses,
        datasets: [
          {
            label: "€ / 100km",
            data: dataCusto100,
            borderColor: "#ef4444", // Redish
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    // 8. POSTOS MAIS BARATOS
    new Chart(document.getElementById("chart-postos-baratos"), {
      type: "bar",
      data: {
        labels: labelsPostosBaratos,
        datasets: [
          {
            label: "Preço Médio (€/L)",
            data: dataPostosBaratos,
            backgroundColor: "#10b981", // Emerald
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { min: 0 } }, // Pode ajustar min para focar na diferença de preços
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
