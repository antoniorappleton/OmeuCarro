// js/estatisticas.js

// manter tracks dos graficos para destruir antes de recriar
const chartInstances = {};

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    await initFilter();
    carregarEstatisticas(); // Carrega tudo inicialmente
  });
});

async function initFilter() {
  const select = document.getElementById("filter-vehicle");
  if (!select) return;

  try {
    const veiculos = await getVeiculosDoUtilizador();
    select.innerHTML = '<option value="">Todos os veículos</option>';

    veiculos.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.nome} (${v.marca})`;
      select.appendChild(opt);
    });

    // Listener
    select.addEventListener("change", () => {
      const vid = select.value;
      // Limpar gráficos antigos
      Object.keys(chartInstances).forEach((k) => destroyChart(k));
      carregarEstatisticas(vid);
    });
  } catch (e) {
    console.error("Erro ao carregar veiculos filtro:", e);
    select.innerHTML = '<option value="">Erro</option>';
  }
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

async function carregarEstatisticas(filterVeiculoId = null) {
  if (typeof Chart !== "undefined") {
    const isDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    Chart.defaults.color = isDark ? "#cbd5e1" : "#0f172a";
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.scale.grid.color = isDark ? "#334155" : "#e2e8f0";
  }

  try {
    let abastecimentos = await getTodosAbastecimentosDoUtilizador(1000);

    // FILTRO
    if (filterVeiculoId) {
      abastecimentos = abastecimentos.filter(
        (a) => a.veiculoId === filterVeiculoId
      );
    }

    abastecimentos.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

    // --- AGREGAÇÕES ---
    let totalGasto = 0;
    let totalLitros = 0;

    const porMes = {};
    const porTipo = {};
    const porPosto = {};

    let minOdo = null;
    let maxOdo = null;

    // Para calculo de eficiencia, vamos agrupar por veiculo para calcular deltas
    const registersByVehicle = {};
    abastecimentos.forEach((a) => {
      const vid = a.veiculoId || "unknown";
      if (!registersByVehicle[vid]) registersByVehicle[vid] = [];
      registersByVehicle[vid].push(a);
    });

    // 1. Processar cada veículo separadamente para garantir consistência de odómetros
    Object.values(registersByVehicle).forEach((listaVeiculo) => {
      // Ordenar esta sub-lista
      listaVeiculo.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

      let lastOdoLocal = null;

      listaVeiculo.forEach((abs) => {
        const litros = Number(abs.litros) || 0;
        const preco = Number(abs.precoPorLitro) || 0;
        const custo = litros * preco;
        const odo = Number(abs.odometro);

        // Globais
        totalLitros += litros;
        totalGasto += custo;

        // Mes
        let mesKey = null;
        const d = abs.data ? new Date(abs.data) : null;
        if (d && !isNaN(d.getTime())) {
          const ano = d.getFullYear();
          const mes = String(d.getMonth() + 1).padStart(2, "0");
          mesKey = `${ano}-${mes}`;
          if (!porMes[mesKey])
            porMes[mesKey] = { gasto: 0, litros: 0, kmPercorridos: 0 };

          porMes[mesKey].gasto += custo;
          porMes[mesKey].litros += litros;
        }

        // Tipo
        const tipo = abs.tipoCombustivel || "Outro";
        if (!porTipo[tipo]) porTipo[tipo] = { litros: 0 };
        porTipo[tipo].litros += litros;

        // Posto
        const posto =
          abs.posto && abs.posto.trim() ? abs.posto.trim() : "Sem posto";
        if (!porPosto[posto])
          porPosto[posto] = { visitas: 0, totalGasto: 0, litros: 0 };
        porPosto[posto].visitas += 1;
        porPosto[posto].totalGasto += custo;
        porPosto[posto].litros += litros;

        // Odometro (Min/Max apenas faz sentido se for UM veículo)
        if (!isNaN(odo)) {
          if (minOdo === null || odo < minOdo) minOdo = odo;
          if (maxOdo === null || odo > maxOdo) maxOdo = odo;

          // Delta Km
          if (lastOdoLocal !== null && odo > lastOdoLocal) {
            const delta = odo - lastOdoLocal;
            if (mesKey && porMes[mesKey]) {
              porMes[mesKey].kmPercorridos += delta;
            }
          }
          lastOdoLocal = odo;
        }
      });
    });

    // --- KPIs ---
    const totalGastoEl = document.getElementById("kpi-total-gasto");
    const totalLitrosEl = document.getElementById("kpi-total-litros");
    const precoMedioEl = document.getElementById("kpi-preco-medio");
    const eficienciaEl = document.getElementById("kpi-eficiencia");

    // Obter settings do utilizador
    const settings = await getUserSettings();

    const precoMedio = totalLitros > 0 ? totalGasto / totalLitros : 0;

    // Eficiência: soma de todos os km percorridos nos meses
    let totalKmPercorridos = 0;
    Object.values(porMes).forEach(
      (m) => (totalKmPercorridos += m.kmPercorridos)
    );

    let eficiencia = null;
    if (totalLitros > 0 && totalKmPercorridos > 0) {
      eficiencia = calculateEfficiency(
        totalKmPercorridos,
        totalLitros,
        settings.unidadeConsumo
      );
    }

    if (totalGastoEl)
      totalGastoEl.textContent = formatCurrency(totalGasto, settings.moeda);
    if (totalLitrosEl) totalLitrosEl.textContent = `${totalLitros.toFixed(0)}L`;
    if (precoMedioEl)
      precoMedioEl.textContent = formatCurrency(precoMedio, settings.moeda);
    if (eficienciaEl)
      eficienciaEl.textContent = eficiencia
        ? formatConsumption(eficiencia, settings.unidadeConsumo)
        : "--";

    // --- GRÁFICOS ---
    const allMonths = Object.keys(porMes).sort();
    const last12 = allMonths.slice(-12); // Mostrar ultimo ano

    const labelsMeses = last12.map((m) => {
      const [ano, mes] = m.split("-");
      return formatMesCurto(Number(mes));
    });

    const dataGasto = last12.map((m) => porMes[m].gasto);
    const dataLitros = last12.map((m) => porMes[m].litros);
    const dataKm = last12.map((m) => porMes[m].kmPercorridos);
    const dataCusto100 = last12.map((m) => {
      const g = porMes[m].gasto;
      const k = porMes[m].kmPercorridos;
      return k > 0 ? (g / k) * 100 : 0;
    });

    // Helper para criar ou atualizar chart
    function createOrUpdateChart(id, type, data, options) {
      destroyChart(id);
      const canvas = document.getElementById(id);
      if (canvas) {
        chartInstances[id] = new Chart(canvas, { type, data, options });
      }
    }

    // 1. GASTOS
    createOrUpdateChart(
      "chart-gastos-mensais",
      "bar",
      {
        labels: labelsMeses,
        datasets: [
          {
            label: `Total (${getCurrencySymbol(settings.moeda)})`,
            data: dataGasto,
            backgroundColor: "#0c8c78",
            borderRadius: 4,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }
    );

    // 2. LITROS
    createOrUpdateChart(
      "chart-litros-mensais",
      "bar",
      {
        labels: labelsMeses,
        datasets: [
          {
            label: "Litros",
            data: dataLitros,
            backgroundColor: "#3b82f6",
            borderRadius: 4,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }
    );

    // 3. PRECO (Timeline)
    const timelineLabels = [];
    const timelineValues = [];
    abastecimentos.forEach((a) => {
      if (a.data) {
        const d = new Date(a.data);
        timelineLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
        timelineValues.push(Number(a.precoPorLitro) || 0);
      }
    });

    createOrUpdateChart(
      "chart-preco",
      "line",
      {
        labels: timelineLabels,
        datasets: [
          {
            label: `Preço ${getCurrencySymbol(settings.moeda)}/L`,
            data: timelineValues,
            borderColor: "#1b9b82",
            backgroundColor: "rgba(27,155,130,0.1)",
            tension: 0.1,
            fill: true,
            pointRadius: 1,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }
    );

    // 4. TIPOS
    createOrUpdateChart(
      "chart-tipos",
      "doughnut",
      {
        labels: Object.keys(porTipo),
        datasets: [
          {
            data: Object.values(porTipo).map((v) => v.litros),
            backgroundColor: ["#0c8c78", "#f59e0b", "#3b82f6", "#64748b"],
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "right" } },
      }
    );

    // 5. POSTOS
    const postosSorted = Object.entries(porPosto)
      .map(([k, v]) => ({ nome: k, ...v }))
      .sort((a, b) => b.visitas - a.visitas)
      .slice(0, 5);

    createOrUpdateChart(
      "chart-postos",
      "bar",
      {
        labels: postosSorted.map((p) => p.nome),
        datasets: [
          {
            label: "Visitas",
            data: postosSorted.map((p) => p.visitas),
            backgroundColor: "#0c8c78",
            borderRadius: 4,
          },
        ],
      },
      {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }
    );

    // 6. KM MENSAIS
    createOrUpdateChart(
      "chart-km-mensais",
      "bar",
      {
        labels: labelsMeses,
        datasets: [
          {
            label: "Km",
            data: dataKm,
            backgroundColor: "#f59e0b",
            borderRadius: 4,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }
    );

    // 7. CUSTO/100KM
    createOrUpdateChart(
      "chart-custo-100km",
      "line",
      {
        labels: labelsMeses,
        datasets: [
          {
            label: `${getCurrencySymbol(settings.moeda)}/100km`,
            data: dataCusto100,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            tension: 0.3,
            fill: true,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }
    );

    // 8. POSTOS BARATOS
    const postosBaratos = Object.entries(porPosto)
      .map(([nome, dados]) => ({
        nome,
        precoMedio: dados.litros > 0 ? dados.totalGasto / dados.litros : 0,
        visitas: dados.visitas,
      }))
      .filter((p) => p.visitas > 0 && p.precoMedio > 0)
      .sort((a, b) => a.precoMedio - b.precoMedio)
      .slice(0, 5);

    createOrUpdateChart(
      "chart-postos-baratos",
      "bar",
      {
        labels: postosBaratos.map(
          (p) => `${p.nome} (${formatCurrency(p.precoMedio, settings.moeda)})`
        ),
        datasets: [
          {
            label: `${getCurrencySymbol(settings.moeda)}/L`,
            data: postosBaratos.map((p) => p.precoMedio),
            backgroundColor: "#10b981",
            borderRadius: 4,
          },
        ],
      },
      {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { min: 0 } },
      }
    );
  } catch (err) {
    console.error("Erro stats:", err);
  }
}

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
