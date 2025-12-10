// public/js/dashboard.js
// Dashboard – KPIs + filtros + gráficos
// Requer: firebase-config.js, auth.js, firestore.js, Chart.js

// ---- Helpers de datas / filtros ----------------------------------------

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
      return null; // tratado à parte
  }

  return {
    inicio: inicio.toISOString().slice(0, 10), // YYYY-MM-DD
    fim: hoje.toISOString().slice(0, 10),
  };
}

// ---- Filtros ------------------------------------------------------------

async function carregarVeiculosNoFiltro() {
  const select = document.getElementById("filtro-veiculo");
  if (!select) return;

  // limpar mantendo a opção "Todos"
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

  // intervalo personalizado
  if (periodo === "custom") {
    const inicio = document.getElementById("filtro-data-inicio")?.value;
    const fim = document.getElementById("filtro-data-fim")?.value;
    if (inicio && fim) {
      intervalo = { inicio, fim };
    } else {
      intervalo = null; // não filtra por datas enquanto não houver as duas
    }
  }

  let abastecimentos = await getAbastecimentosDoUtilizador({
    veiculoId: veiculoId || null,
    limite: 500,
  });

  // filtro por período (datas em string "YYYY-MM-DD" → comparação segura)
  if (intervalo) {
    const { inicio, fim } = intervalo;
    abastecimentos = abastecimentos.filter(
      (ab) => ab.data >= inicio && ab.data <= fim
    );
  }

  return abastecimentos;
}

// ---- Gestão de instâncias Chart.js -------------------------------------

const charts = {
  consumo: null,
  preco: null,
  gastosMes: null,
  litrosMes: null,
  tipos: null,
};

function destroyChartIfExists(refName) {
  const chart = charts[refName];
  if (chart && typeof chart.destroy === "function") {
    chart.destroy();
  }
  charts[refName] = null;
}

// ---- Cálculo de KPIs ----------------------------------------------------

function calcularKPIs(abastecimentos) {
  if (!abastecimentos || abastecimentos.length === 0) {
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

  // Consumo médio e custo/km baseados em segmentos com abastecimento completo
  const ordenadosPorOdometro = [...abastecimentos].sort(
    (a, b) => (a.odometro || 0) - (b.odometro || 0)
  );

  let totalCombustivelSegmentos = 0;
  let totalDistancia = 0;
  let totalCustoSegmentos = 0;

  for (let i = 1; i < ordenadosPorOdometro.length; i++) {
    const anterior = ordenadosPorOdometro[i - 1];
    const atual = ordenadosPorOdometro[i];

    if (!atual.completo) continue;

    const odometroAnterior = Number(anterior.odometro);
    const odometroAtual = Number(atual.odometro);
    const litrosAtual = Number(atual.litros);
    const precoAtual = Number(atual.precoPorLitro) || 0;

    if (
      isNaN(odometroAnterior) ||
      isNaN(odometroAtual) ||
      isNaN(litrosAtual)
    ) {
      continue;
    }

    const distancia = odometroAtual - odometroAnterior;
    if (distancia <= 0 || litrosAtual <= 0) continue;

    totalCombustivelSegmentos += litrosAtual;
    totalDistancia += distancia;
    totalCustoSegmentos += litrosAtual * precoAtual;
  }

  let consumoMedioL100 = null;
  let custoPorKm = null;

  if (totalDistancia > 0 && totalCombustivelSegmentos > 0) {
    consumoMedioL100 =
      (totalCombustivelSegmentos * 100) / totalDistancia; // L/100km
    custoPorKm = totalCustoSegmentos / totalDistancia;
  }

  return {
    totalLitros,
    totalGastos,
    consumoMedioL100,
    custoPorKm,
  };
}

// ---- Gráficos -----------------------------------------------------------

function gerarGraficoConsumo(abastecimentos) {
  const canvas = document.getElementById("chart-consumo");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChartIfExists("consumo");

  const ordenadosPorOdometro = [...abastecimentos].sort(
    (a, b) => (a.odometro || 0) - (b.odometro || 0)
  );

  const labels = [];
  const valores = [];

  for (let i = 1; i < ordenadosPorOdometro.length; i++) {
    const anterior = ordenadosPorOdometro[i - 1];
    const atual = ordenadosPorOdometro[i];

    if (!atual.completo) continue;

    const odAnterior = Number(anterior.odometro);
    const odAtual = Number(atual.odometro);
    const litros = Number(atual.litros);

    if (isNaN(odAnterior) || isNaN(odAtual) || isNaN(litros)) continue;

    const distancia = odAtual - odAnterior;
    if (distancia <= 0 || litros <= 0) continue;

    const consumoL100 = (litros * 100) / distancia;
    labels.push(atual.data || "");
    valores.push(consumoL100);
  }

  if (labels.length === 0) return;

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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Abastecimentos (por data)" },
        },
        y: {
          title: { display: true, text: "L/100km" },
          beginAtZero: false,
        },
      },
    },
  });
}

function gerarGraficoPreco(abastecimentos) {
  const canvas = document.getElementById("chart-preco");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChartIfExists("preco");

  const labels = abastecimentos.map((a) => a.data);
  const valores = abastecimentos.map((a) => Number(a.precoPorLitro) || 0);

  if (labels.length === 0) return;

  const ctx = canvas.getContext("2d");
  charts.preco = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Preço por Litro (€)",
          data: valores,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Data" } },
        y: { title: { display: true, text: "€/L" } },
      },
    },
  });
}

function gerarGraficoGastosMensais(abastecimentos) {
  const canvas = document.getElementById("chart-gastos-mes");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChartIfExists("gastosMes");

  const mapa = {}; // { "YYYY-MM": totalGasto }

  abastecimentos.forEach((ab) => {
    if (!ab.data) return;
    const mes = ab.data.slice(0, 7);
    const gasto = (Number(ab.litros) || 0) * (Number(ab.precoPorLitro) || 0);
    mapa[mes] = (mapa[mes] || 0) + gasto;
  });

  const labels = Object.keys(mapa).sort();
  const valores = labels.map((m) => mapa[m]);

  if (labels.length === 0) return;

  const ctx = canvas.getContext("2d");
  charts.gastosMes = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Gastos por Mês (€)",
          data: valores,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Mês" } },
        y: { title: { display: true, text: "€" } },
      },
    },
  });
}

function gerarGraficoLitrosMensais(abastecimentos) {
  const canvas = document.getElementById("chart-litros-mes");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChartIfExists("litrosMes");

  const mapa = {}; // { "YYYY-MM": litrosTotais }

  abastecimentos.forEach((ab) => {
    if (!ab.data) return;
    const mes = ab.data.slice(0, 7);
    const litros = Number(ab.litros) || 0;
    mapa[mes] = (mapa[mes] || 0) + litros;
  });

  const labels = Object.keys(mapa).sort();
  const valores = labels.map((m) => mapa[m]);

  if (labels.length === 0) return;

  const ctx = canvas.getContext("2d");
  charts.litrosMes = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Consumo Mensal (L)",
          data: valores,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Mês" } },
        y: { title: { display: true, text: "Litros" } },
      },
    },
  });
}

function gerarGraficoTiposCombustivel(abastecimentos) {
  const canvas = document.getElementById("chart-tipos");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChartIfExists("tipos");

  const mapa = {}; // { tipoCombustivel: litrosTotais }

  abastecimentos.forEach((ab) => {
    const tipo = ab.tipoCombustivel || "N/D";
    const litros = Number(ab.litros) || 0;
    mapa[tipo] = (mapa[tipo] || 0) + litros;
  });

  const labels = Object.keys(mapa);
  const valores = labels.map((t) => mapa[t]);

  if (labels.length === 0) return;

  const ctx = canvas.getContext("2d");
  charts.tipos = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          label: "Distribuição por Tipo (L)",
          data: valores,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function gerarRankingPostos(abastecimentos) {
  const container = document.getElementById("ranking-postos");
  if (!container) return;

  container.innerHTML = "";

  const mapa = {}; // { posto: { visitas, total } }

  abastecimentos.forEach((ab) => {
    const posto = ab.posto || "N/D";
    const gasto = (Number(ab.litros) || 0) * (Number(ab.precoPorLitro) || 0);
    if (!mapa[posto]) {
      mapa[posto] = { visitas: 0, total: 0 };
    }
    mapa[posto].visitas += 1;
    mapa[posto].total += gasto;
  });

  const ranking = Object.entries(mapa)
    .map(([nome, stats]) => ({ nome, ...stats }))
    .sort((a, b) => b.total - a.total);

  if (ranking.length === 0) {
    container.textContent = "Ainda não há dados suficientes.";
    return;
  }

  const maxVisitas = Math.max(...ranking.map((r) => r.visitas));

  ranking.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "ranking-row";

    row.innerHTML = `
      <div class="ranking-pos">${index + 1}</div>
      <div class="ranking-main">
        <div class="ranking-top">
          <span class="ranking-name">${item.nome}</span>
          <span class="ranking-visitas">${item.visitas} visitas</span>
        </div>
        <div class="ranking-bar-outer">
          <div class="ranking-bar-inner" style="width: ${
            (item.visitas / maxVisitas) * 100
          }%"></div>
        </div>
        <span class="ranking-total">€${item.total.toFixed(2)} gastos</span>
      </div>
    `;

    container.appendChild(row);
  });
}

// ---- Carregar Dashboard -------------------------------------------------

async function carregarDashboard() {
  const consumoEl = document.getElementById("kpi-consumo");
  const custoKmEl = document.getElementById("kpi-custo-km");
  const litrosEl = document.getElementById("kpi-litros");
  const gastosEl = document.getElementById("kpi-gastos");

  if (!consumoEl || !custoKmEl || !litrosEl || !gastosEl) {
    console.warn("[dashboard] Elementos de KPI não encontrados.");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    console.warn("[dashboard] Utilizador não autenticado.");
    return;
  }

  try {
    const abastecimentos = await obterAbastecimentosFiltrados();

    if (!abastecimentos || abastecimentos.length === 0) {
      consumoEl.textContent = "--";
      custoKmEl.textContent = "--";
      litrosEl.textContent = "0,0 L";
      gastosEl.textContent = "€0,00";

      // Limpar gráficos / ranking
      Object.keys(charts).forEach(destroyChartIfExists);
      const ranking = document.getElementById("ranking-postos");
      if (ranking) ranking.innerHTML = "Ainda não há registos.";
      return;
    }

    // KPIs
    const {
      totalLitros,
      totalGastos,
      consumoMedioL100,
      custoPorKm,
    } = calcularKPIs(abastecimentos);

    litrosEl.textContent =
      totalLitros.toLocaleString("pt-PT", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + " L";

    gastosEl.textContent =
      "€" +
      totalGastos.toLocaleString("pt-PT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    consumoEl.textContent =
      consumoMedioL100 != null
        ? consumoMedioL100.toLocaleString("pt-PT", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }) + " L/100km"
        : "--";

    custoKmEl.textContent =
      custoPorKm != null
        ? "€" +
          custoPorKm.toLocaleString("pt-PT", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          }) +
          "/km"
        : "--";

    // Gráficos + ranking
    gerarGraficoConsumo(abastecimentos);
    gerarGraficoPreco(abastecimentos);
    gerarGraficoGastosMensais(abastecimentos);
    gerarGraficoLitrosMensais(abastecimentos);
    gerarGraficoTiposCombustivel(abastecimentos);
    gerarRankingPostos(abastecimentos);
  } catch (err) {
    console.error("[dashboard] Erro ao carregar dashboard:", err);
  }
}

// ---- Eventos de filtro / inicialização ---------------------------------

function configurarEventosFiltro() {
  const veiculoSelect = document.getElementById("filtro-veiculo");
  const periodoSelect = document.getElementById("filtro-periodo");
  const customDiv = document.getElementById("filtro-custom-datas");
  const inicio = document.getElementById("filtro-data-inicio");
  const fim = document.getElementById("filtro-data-fim");

  if (!periodoSelect) return;

  periodoSelect.addEventListener("change", () => {
    const periodo = periodoSelect.value;
    if (customDiv) {
      customDiv.style.display = periodo === "custom" ? "flex" : "none";
    }
    carregarDashboard();
  });

  if (veiculoSelect) veiculoSelect.addEventListener("change", carregarDashboard);
  if (inicio) inicio.addEventListener("change", carregarDashboard);
  if (fim) fim.addEventListener("change", carregarDashboard);
}

// Autenticação + bootstrap da página
window.addEventListener("load", () => {
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn("[dashboard] Utilizador não autenticado.");
      // opcional: redirecionar para login
      // window.location.href = "index.html";
      return;
    }

    await carregarVeiculosNoFiltro();
    configurarEventosFiltro();
    carregarDashboard();
    unsubscribe();
  });
});
