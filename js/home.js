document.addEventListener("DOMContentLoaded", async () => {
  const user = auth.currentUser;
  if (!user) return;

  // ELEMENTOS DO HTML
  const statVeiculos = document.getElementById("stat-veiculos-value");
  const statGasto = document.getElementById("stat-gasto-value");
  const statLitros = document.getElementById("stat-litros-value");
  const statAbastecimentos = document.getElementById(
    "stat-abastecimentos-value"
  );

  const listEl = document.getElementById("vehicles-list");
  const emptyEl = document.getElementById("vehicles-empty");

  // ---------------------------------------------------------
  // 1) CARREGAR VEÍCULOS DO UTILIZADOR
  // ---------------------------------------------------------

  const veiculos = await getVeiculosDoUtilizador();

  statVeiculos.textContent = veiculos.length;

  if (!veiculos.length) {
    emptyEl.classList.remove("hidden");
  } else {
    emptyEl.classList.add("hidden");
  }

  // render cards
  listEl.innerHTML = "";
  veiculos.forEach((v) => {
    const card = document.createElement("article");
    card.className = "vehicle-card";
    card.innerHTML = `
      <div class="vehicle-card-header">
        <div>
          <div class="vehicle-card-title">${v.nome}</div>
          <div class="vehicle-card-subtitle">${v.marca} ${v.modelo}</div>
        </div>
        <span class="vehicle-card-meta">${v.matricula || ""}</span>
      </div>

      <div class="vehicle-card-meta">
        ${v.odometroInicial || ""} km • ${v.combustivelPadrao || ""}
      </div>

      <div class="vehicle-card-footer" id="vehicle-footer-${v.id}">
        <span>Abastecimentos: --</span>
        <span>Total: --</span>
      </div>
    `;
    listEl.appendChild(card);
  });

  // ---------------------------------------------------------
  // 2) CARREGAR ABASTECIMENTOS
  // ---------------------------------------------------------

  const abastecimentos = await getAbastecimentosDoUtilizador();

  statAbastecimentos.textContent = abastecimentos.length;

  let totalLitros = 0;
  let totalGasto = 0;

  const totPorVeiculo = {};

  abastecimentos.forEach((abs) => {
    totalLitros += abs.litros;
    const custoTotal = abs.litros * abs.precoPorLitro;
    totalGasto += custoTotal;

    if (!totPorVeiculo[abs.veiculoId]) {
      totPorVeiculo[abs.veiculoId] = { count: 0, total: 0 };
    }

    totPorVeiculo[abs.veiculoId].count++;
    totPorVeiculo[abs.veiculoId].total += custoTotal;
  });

  statLitros.textContent = `${totalLitros.toFixed(1)} L`;
  statGasto.textContent = `€${totalGasto.toFixed(2)}`;

  // atualizar cada cartão com totals reais
  Object.keys(totPorVeiculo).forEach((vid) => {
    const el = document.getElementById(`vehicle-footer-${vid}`);
    if (el) {
      el.innerHTML = `
        <span>Abastecimentos: ${totPorVeiculo[vid].count}</span>
        <span>Total: €${totPorVeiculo[vid].total.toFixed(2)}</span>
      `;
    }
  });

  // ---------------------------------------------------------
  // 3) MODAL "Adicionar Veículo" (igual ao teu código)
  // ---------------------------------------------------------
  // Mantém o teu código original daqui para baixo.
});
