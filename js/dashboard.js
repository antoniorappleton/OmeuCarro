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

  // Período personalizado
  if (periodo === "custom") {
    const inicio = document.getElementById("filtro-data-inicio")?.value;
    const fim = document.getElementById("filtro-data-fim")?.value;
    intervalo = inicio && fim ? { inicio, fim } : null;
  }

  let abastecimentos = await getAbastecimentosDoUtilizador({
    veiculoId: veiculoId || null,
    limite: 500,
  });

  // Filtro por data
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

function calcularKPIs(abastecimentos) {
  if (!abastecimentos.length) {
    return {
      totalLitros: 0,
      totalGastos: 0,
      consumoMedioL100: null,
      custoPorKm: null,
    };
  }

  let totalLitros = 0;
  let totalGastos = 0;

  abastecimentos.forEach((ab) => {
    const litros = Number(ab.litros) || 0;
    const preco = Number(ab.precoPorLitro) || 0;
    totalLitros += litros;
    totalGastos += litros * preco;
  });

  // Segmentado por abastecimentos completos
  const ordenados = [...abastecimentos].sort(
    (a, b) => (a.odometro || 0) - (b.odometro || 0)
  );

  let totalComb = 0;
  let totalDist = 0;
  let totalCustoSeg = 0;

  for (let i = 1; i < ordenados.length; i++) {
    const prev = ordenados[i - 1];
    const atual = ordenados[i];

    if (!atual.completo) continue;

    const od0 = Number(prev.odometro);
    const od1 = Number(atual.odometro);
    const litros = Number(atual.litros);
    const preco = Number(atual.precoPorLitro);

    if (isNaN(od0) || isNaN(od1) || isNaN(litros)) continue;

    const dist = od1 - od0;
    if (dist <= 0) continue;

    totalComb += litros;
    totalDist += dist;
    totalCustoSeg += litros * preco;
  }

  return {
    totalLitros,
    totalGastos,
    consumoMedioL100: totalDist > 0 ? (totalComb * 100) / totalDist : null,
    custoPorKm: totalDist > 0 ? totalCustoSeg / totalDist : null,
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
    const abastecimentos = await obterAbastecimentosFiltrados();

    // Sem dados → limpar
    if (!abastecimentos.length) {
      gastosEl.textContent = "€0,00";
      litrosEl.textContent = "0 L";
      precoMedioEl.textContent = "--";
      eficienciaEl.textContent = "--";
      Object.keys(charts).forEach(destroyChartIfExists);
      return;
    }

    // KPI globais
    const { totalLitros, totalGastos, consumoMedioL100 } =
      calcularKPIs(abastecimentos);

    litrosEl.textContent = `${totalLitros.toFixed(1)} L`;
    gastosEl.textContent = `€${totalGastos.toFixed(2)}`;
    precoMedioEl.textContent =
      totalLitros > 0 ? `€${(totalGastos / totalLitros).toFixed(3)}` : "--";
    eficienciaEl.textContent =
      consumoMedioL100 != null
        ? `${consumoMedioL100.toFixed(1)} L/100km`
        : "--";

    // Gráficos e ranking
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
