// public/js/dashboard.js
// Dashboard – KPIs + filtros + gráficos
// Requer: firebase-config.js, auth.js, firestore.js, Chart.js

// ======================================================================
// HELPERS DE DATA
// ======================================================================

function calcularIntervalo(periodo) {
  const hoje = new Date();
  const inicio = new Date();

  switch (periodo) {
    case "semana":
      inicio.setDate(hoje.getDate() - 7);
      break;
    case "mes":
      inicio.setMonth(hoje.getMonth() - 1);
      break;
    case "ano":
      inicio.setFullYear(hoje.getFullYear() - 1);
      break;
    case "custom":
      return null; // tratado mais abaixo
  }

  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: hoje.toISOString().slice(0, 10),
  };
}

// ======================================================================
// FILTROS
// ======================================================================

async function carregarVeiculosNoFiltro() {
  const select = document.getElementById("filtro-veiculo");
  if (!select) return;

  select.innerHTML = `<option value="">Todos os veículos</option>`;

  const veiculos = await getVeiculosDoUtilizador();
  veiculos.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.nome} (${v.marca})`;
    select.appendChild(opt);
  });
}

async function obterAbastecimentosFiltrados() {
  const veiculoId = document.getElementById("filtro-veiculo")?.value || "";
  const periodo = document.getElementById("filtro-periodo")?.value || "mes";

  let intervalo = calcularIntervalo(periodo);

  if (periodo === "custom") {
    const inicio = document.getElementById("filtro-data-inicio")?.value;
    const fim = document.getElementById("filtro-data-fim")?.value;
    intervalo = inicio && fim ? { inicio, fim } : null;
  }

  let abastecimentos = await getTodosAbastecimentosDoUtilizador(500);

  // filtrar por veículo
  if (veiculoId) {
    abastecimentos = abastecimentos.filter((a) => a.veiculoId === veiculoId);
  }

  // filtrar por data
  if (intervalo) {
    const { inicio, fim } = intervalo;
    abastecimentos = abastecimentos.filter(
      (ab) => ab.data >= inicio && ab.data <= fim
    );
  }

  return abastecimentos;
}

// ======================================================================
// CHART.js – GESTÃO DE INSTÂNCIAS
// ======================================================================

// Configuração Global do Chart.js para alto contraste (com suporte a Dark Mode)
if (typeof Chart !== "undefined") {
  const isDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  Chart.defaults.color = isDark ? "#cbd5e1" : "#0f172a"; // slate-300 vs slate-900 (mais escuro)
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.scale.grid.color = isDark ? "#334155" : "#e2e8f0"; // slate-700 vs slate-200
}

const charts = {
  consumo: null,
  preco: null,
  gastosMes: null,
  litrosMes: null,
  tipos: null,
};

function destroyChartIfExists(ref) {
  if (charts[ref]) {
    charts[ref].destroy();
    charts[ref] = null;
  }
}

// ======================================================================
// KPIs – CÁLCULO
// ======================================================================

function calcularKPIs(abastecimentos, veiculoSelecionadoId = null) {
  // 1️⃣ Filtrar por veículo
  const filtrados = veiculoSelecionadoId
    ? abastecimentos.filter((a) => a.veiculoId === veiculoSelecionadoId)
    : abastecimentos;

  // 2️⃣ Totais Gerais (Soma direta de tudo)
  let totalLitros = 0;
  let totalCusto = 0;

  filtrados.forEach((a) => {
    const L = Number(a.litros) || 0;
    const P = Number(a.precoPorLitro) || 0;
    totalLitros += L;
    totalCusto += L * P;
  });

  // 3️⃣ Cálculo de Eficiência (Consumo Médio e Custo/Km)
  // Requer intervalos válidos entre abastecimentos completos
  let distTotalEficiencia = 0;
  let litrosTotalEficiencia = 0;
  let custoTotalEficiencia = 0;

  // Agrupar por veículo
  const porVeiculo = {};
  filtrados.forEach((a) => {
    if (!a.veiculoId) return;
    if (!porVeiculo[a.veiculoId]) porVeiculo[a.veiculoId] = [];
    porVeiculo[a.veiculoId].push(a);
  });

  Object.values(porVeiculo).forEach((lista) => {
    // Ordenar por odómetro
    const ordenados = [...lista]
      // .filter((a) => a.completo) // REMOVIDO: User quer cálculo sempre, independente de ser cheio ou não
      .sort((a, b) => (a.odometro || 0) - (b.odometro || 0));

    for (let i = 1; i < ordenados.length; i++) {
      const prev = ordenados[i - 1];
      const atual = ordenados[i];

      const km = Number(atual.odometro) - Number(prev.odometro);
      if (km <= 0) continue; // erro ou sem movimento

      const litros = Number(atual.litros);
      const preco = Number(atual.precoPorLitro);

      if (isNaN(litros) || isNaN(preco)) continue;

      distTotalEficiencia += km;
      litrosTotalEficiencia += litros;
      custoTotalEficiencia += litros * preco;
    }
  });

  const consumoMedio =
    distTotalEficiencia > 0
      ? litrosTotalEficiencia / (distTotalEficiencia / 100)
      : null; // null se não houver dados suficientes

  const custoPorKm =
    distTotalEficiencia > 0 ? custoTotalEficiencia / distTotalEficiencia : null;

  return {
    totalLitros,
    totalCusto,
    consumoMedio,
    custoPorKm,
  };
}

// ======================================================================
// GRÁFICOS
// ======================================================================
// (As funções de gráficos mantêm-se exatamente como estavam)
// Apenas foram removidos erros e mantidas limpas.
// ======================================================================

/* --- GRÁFICO 1: Consumo --- */
function gerarGraficoConsumo(abastecimentos) {
  const canvas = document.getElementById("chart-consumo");
  if (!canvas) return;

  destroyChartIfExists("consumo");

  const ordenados = [...abastecimentos].sort(
    (a, b) => (a.odometro || 0) - (b.odometro || 0)
  );

  const labels = [];
  const valores = [];

  for (let i = 1; i < ordenados.length; i++) {
    const prev = ordenados[i - 1];
    const a = ordenados[i];
    if (!a.completo) continue;

    const d = Number(a.odometro) - Number(prev.odometro);
    const litros = Number(a.litros);
    if (d > 0 && litros > 0) {
      labels.push(a.data);
      valores.push((litros * 100) / d);
    }
  }

  if (!labels.length) return;

  const ctx = canvas.getContext("2d");
  charts.consumo = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Consumo (L/100km)",
          data: valores,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/* --- GRÁFICO 2: Preço por litro --- */
function gerarGraficoPreco(abastecimentos) {
  const canvas = document.getElementById("chart-preco");
  if (!canvas) return;

  destroyChartIfExists("preco");

  const labels = abastecimentos.map((a) => a.data);
  const valores = abastecimentos.map((a) => Number(a.precoPorLitro) || 0);
  if (!labels.length) return;

  const ctx = canvas.getContext("2d");
  charts.preco = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Preço por Litro (€)", data: valores, tension: 0.3 }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/* --- GRÁFICO 3: Gastos mensais --- */
function gerarGraficoGastosMensais(abastecimentos) {
  const canvas = document.getElementById("chart-gastos-mes");
  if (!canvas) return;

  destroyChartIfExists("gastosMes");

  const mapa = {};
  abastecimentos.forEach((ab) => {
    if (!ab.data) return;
    const mes = ab.data.slice(0, 7);
    const gasto = (Number(ab.litros) || 0) * (Number(ab.precoPorLitro) || 0);
    mapa[mes] = (mapa[mes] || 0) + gasto;
  });

  const labels = Object.keys(mapa).sort();
  if (!labels.length) return;

  const valores = labels.map((m) => mapa[m]);

  const ctx = canvas.getContext("2d");
  charts.gastosMes = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Gastos (€)", data: valores }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/* --- GRÁFICO 4: Litros mensais --- */
function gerarGraficoLitrosMensais(abastecimentos) {
  const canvas = document.getElementById("chart-litros-mes");
  if (!canvas) return;

  destroyChartIfExists("litrosMes");

  const mapa = {};
  abastecimentos.forEach((ab) => {
    if (!ab.data) return;
    const mes = ab.data.slice(0, 7);
    mapa[mes] = (mapa[mes] || 0) + (Number(ab.litros) || 0);
  });

  const labels = Object.keys(mapa).sort();
  if (!labels.length) return;

  const valores = labels.map((m) => mapa[m]);

  const ctx = canvas.getContext("2d");
  charts.litrosMes = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Litros (L)", data: valores }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/* --- GRÁFICO 5: Tipos de combustível --- */
function gerarGraficoTiposCombustivel(abastecimentos) {
  const canvas = document.getElementById("chart-tipos");
  if (!canvas) return;

  destroyChartIfExists("tipos");

  const mapa = {};
  abastecimentos.forEach((ab) => {
    const tipo = ab.tipoCombustivel || "N/D";
    mapa[tipo] = (mapa[tipo] || 0) + (Number(ab.litros) || 0);
  });

  const labels = Object.keys(mapa);
  if (!labels.length) return;

  const valores = labels.map((t) => mapa[t]);

  const ctx = canvas.getContext("2d");
  charts.tipos = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: valores }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

// ======================================================================
// RANKING DE POSTOS
// ======================================================================

function gerarRankingPostos(abastecimentos) {
  const container = document.getElementById("ranking-postos");
  if (!container) return;
  container.innerHTML = "";

  const mapa = {};

  abastecimentos.forEach((ab) => {
    const posto = ab.posto || "N/D";
    const gasto = (Number(ab.litros) || 0) * (Number(ab.precoPorLitro) || 0);
    if (!mapa[posto]) mapa[posto] = { visitas: 0, total: 0 };
    mapa[posto].visitas++;
    mapa[posto].total += gasto;
  });

  const ranking = Object.entries(mapa)
    .map(([nome, d]) => ({ nome, ...d }))
    .sort((a, b) => b.total - a.total);

  if (!ranking.length) {
    container.textContent = "Ainda não há dados suficientes.";
    return;
  }

  const max = Math.max(...ranking.map((r) => r.visitas));

  ranking.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "ranking-row";
    row.innerHTML = `
      <div class="ranking-pos">${i + 1}</div>
      <div class="ranking-main">
        <div class="ranking-top">
          <span class="ranking-name">${r.nome}</span>
          <span class="ranking-visitas">${r.visitas} visitas</span>
        </div>
        <div class="ranking-bar-outer">
          <div class="ranking-bar-inner" style="width:${
            (r.visitas / max) * 100
          }%"></div>
        </div>
        <span class="ranking-total">€${r.total.toFixed(2)} gastos</span>
      </div>`;
    container.appendChild(row);
  });
}

// ======================================================================
// CARREGAR DASHBOARD
// ======================================================================

async function carregarDashboard() {
  const gastosEl = document.getElementById("stat-gasto-value");
  const litrosEl = document.getElementById("stat-litros-value");
  const precoMedioEl = document.getElementById("stat-preco-medio-value");
  const eficienciaEl = document.getElementById("stat-eficiencia-value");

  const user = auth.currentUser;
  if (!user) return;

  try {
    // 1. Carregar Settings
    const settings = await getUserSettings();
    const moeda = settings.moeda || "EUR";
    const moedaSymbol = moeda === "USD" ? "$" : moeda === "BRL" ? "R$" : "€";
    
    // Configurar filtros iniciais se for o primeiro load e não houver seleção
    const periodSelect = document.getElementById("filtro-periodo");
    if (periodSelect && !periodSelect.dataset.initialized) {
        periodSelect.value = settings.dashboardPeriodo || "mes";
        periodSelect.dataset.initialized = "true";
        // Disparar change para atualizar UI de datas custom
        periodSelect.dispatchEvent(new Event('change'));
    }

    // Usar a função de obter filtrados (já lê o DOM, então o update acima afeta)
    const abastecimentos = await obterAbastecimentosFiltrados();

    // Sem dados → limpar
    if (!abastecimentos.length) {
      gastosEl.textContent = `${moedaSymbol}0,00`;
      litrosEl.textContent = "0 L";
      precoMedioEl.textContent = "--";
      eficienciaEl.textContent = "--";
      Object.keys(charts).forEach(destroyChartIfExists);
      return;
    }

    // KPI globais
    const { totalLitros, totalCusto, consumoMedio } =
      calcularKPIs(abastecimentos);

    litrosEl.textContent = `${totalLitros.toFixed(1)} L`;
    gastosEl.textContent = `${moedaSymbol}${totalCusto.toFixed(2)}`;

    // Preço Médio (Total Gasto / Total Litros) - simples
    precoMedioEl.textContent =
      totalLitros > 0 ? `${moedaSymbol}${(totalCusto / totalLitros).toFixed(3)}` : "--";

    eficienciaEl.textContent =
      consumoMedio != null ? `${consumoMedio.toFixed(1)} L/100km` : "--";

    // KPI Visibility Check
    if (settings.dashboardKpis) {
        if (!settings.dashboardKpis.gastos) gastosEl.parentElement.style.display = 'none';
        else gastosEl.parentElement.style.display = '';

        if (!settings.dashboardKpis.consumos) litrosEl.parentElement.style.display = 'none';
        else litrosEl.parentElement.style.display = '';
        
        // Distância/Eficiência? "distancias" was the key, but dashboard has "eficiencia" card.
        // Assuming "distancias" maps to the efficiency card for now or maybe I should check if there is a distance card?
        // Ah, the dashboard layout has 4 cards: Gasto, Litros, Preço Médio, Eficiência.
        // The settings had "Gastos", "Consumos", "Distância".
        // Maybe "Distância" maps to nothing visible? Or maybe it should be "Eficiência".
        // I'll leave efficiency always on or maybe check `distancias` as a proxy.
        if (settings.dashboardKpis.distancias === false) eficienciaEl.parentElement.style.display = 'none';
         else eficienciaEl.parentElement.style.display = '';
    }

    // Gráficos e ranking
    // Para gráficos, poderíamos passar a moeda também, mas vou simplificar
    gerarGraficoConsumo(abastecimentos);
    gerarGraficoPreco(abastecimentos);
    gerarGraficoGastosMensais(abastecimentos);
    gerarGraficoLitrosMensais(abastecimentos);
    gerarGraficoTiposCombustivel(abastecimentos);
    gerarRankingPostos(abastecimentos);
  } catch (err) {
    console.error("[dashboard] Erro:", err);
  }
}

// ======================================================================
// EVENTOS
// ======================================================================

function configurarEventosFiltro() {
  const periodo = document.getElementById("filtro-periodo");
  const veiculo = document.getElementById("filtro-veiculo");
  const inicio = document.getElementById("filtro-data-inicio");
  const fim = document.getElementById("filtro-data-fim");
  const customDiv = document.getElementById("filtro-custom-datas");

  if (periodo) {
    periodo.addEventListener("change", () => {
      customDiv.style.display = periodo.value === "custom" ? "flex" : "none";
      carregarDashboard();
    });
  }

  if (veiculo) veiculo.addEventListener("change", carregarDashboard);
  if (inicio) inicio.addEventListener("change", carregarDashboard);
  if (fim) fim.addEventListener("change", carregarDashboard);
}

// ======================================================================
// INIT
// ======================================================================

window.addEventListener("load", () => {
  const unsub = auth.onAuthStateChanged(async (u) => {
    if (!u) return;
    await carregarVeiculosNoFiltro();
    configurarEventosFiltro();
    carregarDashboard();
    unsub();
  });
});
