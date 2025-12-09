// public/js/dashboard.js
// Dashboard L100 – KPIs + gráfico de consumo
// Requer:
//  - firebase-config.js
//  - auth.js
//  - firestore.js
//  - Chart.js incluído no HTML

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
      return null; // handled separately
  }

  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: hoje.toISOString().slice(0, 10),
  };
}

async function carregarVeiculosNoFiltro() {
  const select = document.getElementById("filtro-veiculo");
  const veiculos = await getVeiculosDoUtilizador();

  veiculos.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.nome} (${v.marca})`;
    select.appendChild(opt);
  });
}

async function obterAbastecimentosFiltrados() {
  const veiculoId = document.getElementById("filtro-veiculo").value;
  const periodo = document.getElementById("filtro-periodo").value;

  let intervalo = calcularIntervalo(periodo);

  // Custom range
  if (periodo === "custom") {
    const inicio = document.getElementById("filtro-data-inicio").value;
    const fim = document.getElementById("filtro-data-fim").value;
    if (inicio && fim) {
      intervalo = { inicio, fim };
    }
  }

  let abastecimentos = await getAbastecimentosDoUtilizador({
    veiculoId: veiculoId || null,
    limite: 500,
  });

  // Filtro de período
  if (intervalo) {
    abastecimentos = abastecimentos.filter(ab => {
      return ab.data >= intervalo.inicio && ab.data <= intervalo.fim;
    });
  }

  return abastecimentos;
}

function gerarGraficoPreco(abastecimentos) {
  const ctx = document.getElementById("chart-preco").getContext("2d");

  const labels = abastecimentos.map(a => a.data);
  const valores = abastecimentos.map(a => a.precoPorLitro);

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Preço por Litro (€)",
        data: valores,
        tension: 0.3
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function gerarGraficoGastosMensais(abastecimentos) {
  const ctx = document.getElementById("chart-gastos-mes").getContext("2d");

  const mapa = {};

  abastecimentos.forEach(ab => {
    const mes = ab.data.slice(0, 7); // YYYY-MM
    const gasto = ab.litros * ab.precoPorLitro;
    mapa[mes] = (mapa[mes] || 0) + gasto;
  });

  const labels = Object.keys(mapa).sort();
  const valores = labels.map(m => mapa[m]);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Gastos por Mês (€)",
        data: valores,
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}


async function carregarDashboard() {
  const consumoEl = document.getElementById("kpi-consumo");
  const custoKmEl = document.getElementById("kpi-custo-km");
  const litrosEl = document.getElementById("kpi-litros");
  const gastosEl = document.getElementById("kpi-gastos");
  const chartCanvas = document.getElementById("chart-consumo");

  if (!consumoEl || !custoKmEl || !litrosEl || !gastosEl || !chartCanvas) {
    console.warn("[dashboard] Elementos da dashboard não encontrados.");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    console.warn("[dashboard] Utilizador não autenticado.");
    // opcional: redirecionar para login/home
    // window.location.href = "index.html";
    return;
  }

  try {
    // 1) Buscar abastecimentos do utilizador (todos veículos, últimos 500)
    const abastecimentos = await getAbastecimentosDoUtilizador({
      veiculoId: null,
      limite: 500,
    });

    if (!abastecimentos || abastecimentos.length === 0) {
      consumoEl.textContent = "--";
      custoKmEl.textContent = "--";
      litrosEl.textContent = "0,0 L";
      gastosEl.textContent = "€0,00";
      console.info("[dashboard] Sem abastecimentos para este utilizador.");
      return;
    }

    // 2) Totais simples: litros e gastos (todos os abastecimentos)
    let totalLitros = 0;
    let totalGastos = 0;

    abastecimentos.forEach((ab) => {
      const litros = Number(ab.litros) || 0;
      const preco = Number(ab.precoPorLitro) || 0;
      totalLitros += litros;
      totalGastos += litros * preco;
    });

    // 3) Ordenar por odómetro para calcular consumo entre abastecimentos
    const ordenadosPorOdometro = [...abastecimentos].sort(
      (a, b) => (a.odometro || 0) - (b.odometro || 0)
    );

    let totalCombustivelSegmentos = 0; // combustível usado nos segmentos considerados
    let totalDistancia = 0;            // soma das distâncias úteis
    let totalCustoSegmentos = 0;       // custo associado aos segmentos

    const labelsConsumo = [];
    const valoresConsumoL100 = [];

    for (let i = 1; i < ordenadosPorOdometro.length; i++) {
      const anterior = ordenadosPorOdometro[i - 1];
      const atual = ordenadosPorOdometro[i];

      // Só contabilizamos se ESTE abastecimento foi "completo"
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

      const consumoL100 = (litrosAtual * 100) / distancia; // L/100km
      const custoSegmento = litrosAtual * precoAtual;

      totalCombustivelSegmentos += litrosAtual;
      totalDistancia += distancia;
      totalCustoSegmentos += custoSegmento;

      labelsConsumo.push(atual.data || "");
      valoresConsumoL100.push(consumoL100);
    }

    // 4) KPIs derivados dos segmentos
    let consumoMedioTexto = "--";
    let custoKmTexto = "--";

    if (totalDistancia > 0 && totalCombustivelSegmentos > 0) {
      const consumoMedioL100 =
        (totalCombustivelSegmentos * 100) / totalDistancia;
      const custoPorKm = totalCustoSegmentos / totalDistancia;

      consumoMedioTexto = consumoMedioL100.toLocaleString("pt-PT", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + " L/100km";

      custoKmTexto = "€" + custoPorKm.toLocaleString("pt-PT", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }) + "/km";
    }

    const litrosTexto =
      totalLitros.toLocaleString("pt-PT", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + " L";

    const gastosTexto =
      "€" +
      totalGastos.toLocaleString("pt-PT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // 5) Atualizar DOM
    consumoEl.textContent = consumoMedioTexto;
    custoKmEl.textContent = custoKmTexto;
    litrosEl.textContent = litrosTexto;
    gastosEl.textContent = gastosTexto;

    // 6) Gráfico de consumo (Chart.js)
    if (typeof Chart !== "undefined" && labelsConsumo.length > 0) {
      const ctx = chartCanvas.getContext("2d");

      // eslint-disable-next-line no-unused-vars
      const consumoChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: labelsConsumo,
          datasets: [
            {
              label: "Consumo (L/100km)",
              data: valoresConsumoL100,
              tension: 0.3,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Abastecimentos (por data)",
              },
            },
            y: {
              title: {
                display: true,
                text: "L/100km",
              },
              beginAtZero: false,
            },
          },
        },
      });
    } else {
      console.info(
        "[dashboard] Sem dados suficientes para o gráfico ou Chart.js não carregado."
      );
    }
  } catch (err) {
    console.error("[dashboard] Erro ao carregar dashboard:", err);
  }
}

function configurarEventosFiltro() {
  const veiculoSelect = document.getElementById("filtro-veiculo");
  const periodoSelect = document.getElementById("filtro-periodo");
  const customDiv = document.getElementById("filtro-custom-datas");
  const inicio = document.getElementById("filtro-data-inicio");
  const fim = document.getElementById("filtro-data-fim");

  periodoSelect.addEventListener("change", () => {
    const periodo = periodoSelect.value;
    customDiv.style.display = periodo === "custom" ? "block" : "none";
    carregarDashboard(); 
  });

  veiculoSelect.addEventListener("change", carregarDashboard);
  inicio.addEventListener("change", carregarDashboard);
  fim.addEventListener("change", carregarDashboard);
}

// Lidar com autenticação + carregar dashboard
window.addEventListener("load", () => {
  // Garante que o auth já está inicializado
  const unsubscribe = auth.onAuthStateChanged((user) => {
    if (!user) {
      console.warn("[dashboard] Utilizador não autenticado.");
      // opcional: redirecionar
      // window.location.href = "index.html";
      return;
    }
    carregarDashboard();
    unsubscribe(); // já não precisamos ouvir mais
    configurarEventosFiltro();

  });
});
