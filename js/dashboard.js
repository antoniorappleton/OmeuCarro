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

function calcularKPIs(abastecimentos, veiculoSelecionadoId = null, settings) {
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

  const eficiencia = calculateEfficiency(
    distTotalEficiencia,
    litrosTotalEficiencia,
    settings.unidadeConsumo
  );

  const custoPorKm =
    distTotalEficiencia > 0 ? custoTotalEficiencia / distTotalEficiencia : null;

  return {
    totalLitros,
    totalCusto,
    eficiencia,
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
function gerarGraficoConsumo(abastecimentos, settings) {
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
      valores.push(calculateEfficiency(d, litros, settings?.unidadeConsumo));
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
          label: `Consumo (${settings?.unidadeConsumo || "L/100km"})`,
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
function gerarGraficoPreco(abastecimentos, settings) {
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
      datasets: [
        {
          label: `Preço por Litro (${getCurrencySymbol(
            settings?.moeda || "EUR"
          )})`,
          data: valores,
          tension: 0.3,
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/* --- GRÁFICO 3: Gastos mensais --- */
function gerarGraficoGastosMensais(abastecimentos, settings) {
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
    data: {
      labels,
      datasets: [
        {
          label: `Gastos (${getCurrencySymbol(settings?.moeda || "EUR")})`,
          data: valores,
        },
      ],
    },
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

function gerarRankingPostos(abastecimentos, settings) {
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
        <span class="ranking-total">${formatCurrency(
          r.total,
          settings?.moeda
        )} gastos</span>
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

    // Configurar filtros iniciais se for o primeiro load e não houver seleção
    const periodSelect = document.getElementById("filtro-periodo");
    if (periodSelect && !periodSelect.dataset.initialized) {
      periodSelect.value = settings.dashboardPeriodo || "mes";
      periodSelect.dataset.initialized = "true";
      // Disparar change para atualizar UI de datas custom
      periodSelect.dispatchEvent(new Event("change"));
    }

    // Usar a função de obter filtrados (já lê o DOM, então o update acima afeta)
    const abastecimentos = await obterAbastecimentosFiltrados();

    // Sem dados → limpar
    if (!abastecimentos.length) {
      gastosEl.textContent = formatCurrency(0, settings.moeda);
      litrosEl.textContent = "0 L";
      precoMedioEl.textContent = "--";
      eficienciaEl.textContent = "--";
      Object.keys(charts).forEach(destroyChartIfExists);
      return;
    }

    // KPI globais
    const { totalLitros, totalCusto, eficiencia } = calcularKPIs(
      abastecimentos,
      null,
      settings
    );

    litrosEl.textContent = `${totalLitros.toFixed(1)} L`;
    gastosEl.textContent = formatCurrency(totalCusto, settings.moeda);

    // Preço Médio (Total Gasto / Total Litros) - simples
    const pm = totalLitros > 0 ? totalCusto / totalLitros : 0;
    precoMedioEl.textContent =
      pm > 0 ? formatCurrency(pm, settings.moeda) : "--";

    eficienciaEl.textContent =
      eficiencia != null
        ? formatConsumption(eficiencia, settings.unidadeConsumo)
        : "--";

    // KPI Visibility Check
    if (settings.dashboardKpis) {
      if (!settings.dashboardKpis.gastos)
        gastosEl.parentElement.style.display = "none";
      else gastosEl.parentElement.style.display = "";

      if (!settings.dashboardKpis.consumos)
        litrosEl.parentElement.style.display = "none";
      else litrosEl.parentElement.style.display = "";

      if (settings.dashboardKpis.distancias === false)
        eficienciaEl.parentElement.style.display = "none";
      else eficienciaEl.parentElement.style.display = "";
    }

    // Gráficos e ranking
    // Para gráficos, poderíamos passar a moeda também, mas vou simplificar
    gerarGraficoConsumo(abastecimentos, settings);
    gerarGraficoPreco(abastecimentos, settings);
    gerarGraficoGastosMensais(abastecimentos, settings);
    gerarGraficoLitrosMensais(abastecimentos);
    gerarGraficoTiposCombustivel(abastecimentos);
    gerarRankingPostos(abastecimentos, settings);
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

// ======================================================================
// MODAL DE ABASTECIMENTO (DASHBOARD)
// ======================================================================

function initDashboardRefuelModal() {
  const modal = document.getElementById("fuel-modal");
  const openBtn = document.getElementById("btn-quick-refuel"); // Updated ID
  const closeBtn = document.getElementById("fuel-close");
  const cancelBtn = document.getElementById("fuel-cancel");
  const saveBtn = document.getElementById("fuel-save");
  const msg = document.getElementById("fuel-msg");

  const vehicleSelect = document.getElementById("fuel-vehicle-select");
  const dateEl = document.getElementById("fuel-date");
  const typeEl = document.getElementById("fuel-type");
  const litersEl = document.getElementById("fuel-liters");
  const priceEl = document.getElementById("fuel-price");
  const kmEl = document.getElementById("fuel-km");
  const stationEl = document.getElementById("fuel-station");
  const notesEl = document.getElementById("fuel-notes");
  const fullEl = document.getElementById("fuel-full");

  async function open() {
    modal.classList.remove("hidden");
    msg.textContent = "";

    // Default Date
    if (!dateEl.value) {
      dateEl.value = new Date().toISOString().slice(0, 10);
    }

    // Default Fuel
    const settings = await getUserSettings();
    if (settings?.combustivelPadrao && typeEl && !typeEl.value) {
      typeEl.value = settings.combustivelPadrao;
    }

    // Load Vehicles...
    try {
      vehicleSelect.innerHTML = `<option value="">A carregar...</option>`;
      const veiculos = await getVeiculosDoUtilizador();

      if (!veiculos.length) {
        vehicleSelect.innerHTML = `<option value="">Sem veículos registados</option>`;
        return;
      }

      vehicleSelect.innerHTML = `<option value="">Selecione...</option>`;
      veiculos.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = `${v.nome} (${v.marca})`;
        vehicleSelect.appendChild(opt);
      });

      // Pre-select if only one
      if (veiculos.length === 1) {
        vehicleSelect.value = veiculos[0].id;
        updateVehicleDefaults(veiculos[0]);
      }
    } catch (e) {
      console.error(e);
      vehicleSelect.innerHTML = `<option value="">Erro ao carregar</option>`;
    }
  }

  function close() {
    modal.classList.add("hidden");
    // Clear fields if desired, or keep for convenience? Usually clear.
    dateEl.value = "";
    litersEl.value = "";
    priceEl.value = "";
    kmEl.value = "";
    stationEl.value = "";
    notesEl.value = "";
    if (fullEl) fullEl.checked = false;
    vehicleSelect.value = "";
  }

  // Update logic when vehicle changes (e.g. pre-fill fuel type or odometer)
  vehicleSelect?.addEventListener("change", async () => {
    const vid = vehicleSelect.value;
    if (!vid) return;
    // Optimization: we could store vehicles in memory to avoid refetch,
    // but getting single from cache is fast enough or finding in array if we had it.
    // Let's assume user picks. We can try to guess fuel type?
    // For now, simple.
  });

  function updateVehicleDefaults(v) {
    if (v.combustivelPadrao) {
      // Map backend values to select values if needed
      // "gasolina" -> "Gasolina" (Capitalized in select?)
      // The select has "Gasolina", "Gasóleo", etc.
      // v.combustivelPadrao might be lowercase.
      const val =
        v.combustivelPadrao.charAt(0).toUpperCase() +
        v.combustivelPadrao.slice(1);
      // Try to find matching option
      for (const opt of typeEl.options) {
        if (opt.value.toLowerCase() === val.toLowerCase()) {
          typeEl.value = opt.value;
          break;
        }
      }
    }
  }

  openBtn?.addEventListener("click", (e) => {
    e.preventDefault(); // Prevent link navigation if it was a link
    open();
  });

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);

  saveBtn?.addEventListener("click", async () => {
    try {
      const vid = vehicleSelect.value;
      if (!vid) {
        msg.textContent = "Selecione um veículo.";
        return;
      }
      if (!dateEl.value || !litersEl.value || !priceEl.value || !kmEl.value) {
        msg.textContent = "Preenche os campos obrigatórios.";
        return;
      }

      msg.textContent = "A guardar...";

      const payload = {
        data: dateEl.value,
        tipoCombustivel: typeEl.value,
        litros: Number(litersEl.value),
        precoPorLitro: Number(priceEl.value),
        odometro: Number(kmEl.value),
        posto: stationEl.value.trim(),
        observacoes: notesEl.value.trim(),
        completo: fullEl ? fullEl.checked : false,
      };

      await createAbastecimento(vid, payload);

      close();
      // Reload dashboard stats
      await carregarDashboard();

      // Optional toast?
      // alert("Guardado!");
    } catch (e) {
      console.error(e);
      msg.textContent = e.message || "Erro ao guardar.";
    }
  });

}

// ======================================================================
// TOGGLE AÇÕES RÁPIDAS
// ======================================================================
function initDashboardQuickActions() {
    const header = document.getElementById("header-quick-actions");
    const content = document.getElementById("quick-actions-content");
    const icon = document.getElementById("icon-quick-toggle");

    if (!header || !content || !icon) return;

    header.addEventListener("click", () => {
        // Toggle Hidden/Visible
        // If maxHeight is empty (default) OR not "0px", it is considered OPEN.
        const currentHeight = content.style.maxHeight;
        const isOpen = !currentHeight || currentHeight !== "0px";
        
        if (isOpen) {
            // Collapse
            content.style.maxHeight = "0px";
            content.style.opacity = "0";
            content.style.padding = "0";
            icon.style.transform = "rotate(180deg)"; // Chevron down
        } else {
            // Expand
            content.style.maxHeight = content.scrollHeight + "px";
            content.style.opacity = "1";
            content.style.padding = ""; // Reset padding if needed
            icon.style.transform = "rotate(0deg)"; // Chevron up
        }
    });

    // Initialize as expanded (optional, or match HTML state)
    // HTML has standard div. Let's set initial state to expanded explicitly if needed or rely on CSS.
    // To animate correctly from start, we might need to set standard height.
    content.style.maxHeight = content.scrollHeight + "px";
}

window.addEventListener("load", () => {
  const unsub = auth.onAuthStateChanged(async (u) => {
    if (!u) return;
    await carregarVeiculosNoFiltro();
    configurarEventosFiltro();
    carregarDashboard();
    initDashboardRefuelModal(); // Initialize Modal
    initDashboardQuickActions(); // Initialize Quick Actions Toggle
    // === NOTIFICAÇÕES (FCM) ===
    // 1. Ouvir mensagens em foreground (já configurado no notifications.js)
    if (window.listenToForegroundMessages) {
        window.listenToForegroundMessages();
    }

    // 2. Configurar Botão de Ativar Notificações (se existir na UI, ou criar um)
    // Vamos adicionar um botão "sino" no cabeçalho se não existir
    const headerActions = document.querySelector('.app-header-actions');
    if (headerActions && !document.getElementById('btn-notifs')) {
        const btnNotifs = document.createElement('button');
        btnNotifs.id = 'btn-notifs';
        btnNotifs.className = 'icon-btn';
        btnNotifs.title = 'Ativar Notificações';
        btnNotifs.innerHTML = `
            <svg class="icon" aria-hidden="true">
                <use href="assets/icons-unified.svg#icon-bell"></use>
            </svg>
        `;
        
        // Inserir antes do logout
        const btnLogout = document.getElementById('btn-logout');
        headerActions.insertBefore(btnNotifs, btnLogout);

        btnNotifs.addEventListener('click', async () => {
            try {
                // Tenta pedir permissão
                const token = await window.requestNotificationPermissionAndSaveToken();
                alert(`Notificações ativadas com sucesso!\nToken: ${token.slice(0, 10)}...`);
            } catch (err) {
                console.error(err);
                alert("Erro ao ativar notificações: " + err.message);
            }
        });
    }

    unsub();
  });
});
