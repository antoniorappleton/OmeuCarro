// js/home.js / js/veiculos.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("vehicle-form");
  const msgEl = document.getElementById("vehicle-message");
  const listEl = document.getElementById("vehicles-list");
  const emptyEl = document.getElementById("vehicles-empty");

  // Botões do dashboard (header + estado vazio)
  const btnAddVehicle = document.getElementById("btn-add-vehicle");
  const btnAddFirstVehicle = document.getElementById("btn-add-first-vehicle");

  function showMessage(text, type) {
    if (!msgEl) return; // no dashboard não existe msgEl, só em veiculos.html
    msgEl.textContent = text || "";
    msgEl.className = "form-message";
    if (type === "error") msgEl.classList.add("form-message--error");
    if (type === "success") msgEl.classList.add("form-message--success");
  }

  async function loadVeiculos() {
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = "";
    emptyEl.classList.add("hidden");

    try {
      // Carregar settings para saber a moeda
      const [veiculos, abastecimentos, settings] = await Promise.all([
        getVeiculosDoUtilizador(),
        getTodosAbastecimentosDoUtilizador(500),
        getUserSettings()
      ]);

      // ðŸ”¹ FETCH ANALYTICS (Parallel)
      // We need to fetch analytics for each vehicle to determine alert status
      let analyticsMap = {};
      if (window.getVehicleAnalytics && veiculos.length > 0) {
          try {
              const analyticsResults = await Promise.all(
                  veiculos.map(v => window.getVehicleAnalytics(v.id))
              );
              veiculos.forEach((v, index) => {
                  analyticsMap[v.id] = analyticsResults[index];
              });
          } catch (err) {
              console.warn("Could not fetch analytics for cards:", err);
          }
      }
      
      const moeda = settings?.moeda || "EUR";
      const moedaSymbol = moeda === "USD" ? "$" : moeda === "BRL" ? "R$" : "€";

      if (!veiculos.length) {
        emptyEl.classList.remove("hidden");
        return;
      }

      // stats por veículo
      const statsPorVeiculo = {};

      abastecimentos.forEach((abs) => {
        const vid = abs.veiculoId;
        const litros = Number(abs.litros) || 0;
        const preco = Number(abs.precoPorLitro) || 0;
        const total = litros * preco;

        if (!statsPorVeiculo[vid]) {
          statsPorVeiculo[vid] = { count: 0, total: 0 };
        }

        statsPorVeiculo[vid].count++;
        statsPorVeiculo[vid].total += total;
      });

      veiculos.forEach((v) => {
        const stats = statsPorVeiculo[v.id] || { count: 0, total: 0 };
        const analytics = analyticsMap[v.id];

        // Status Logic
        let statusClass = "";
        let statusIcon = "";
        let statusBadge = "";
        
        if (analytics) {
            const level = analytics.alertaFuelNivel; // warning | critical | none
            if (level === "critical") {
                statusClass = "border-status-critical"; // We will need to define this CSS or use inline style
                statusBadge = `<span class="badge" style="background:var(--color-error); color:white; border:none;">⚠️ Reserva</span>`;
            } else if (level === "warning") {
                statusClass = "border-status-warning";
                statusBadge = `<span class="badge" style="background:var(--color-warning); color:var(--text-on-warning, #000); border:none;">Combustível Baixo</span>`;
            }
        }
        
        // Use styled border if active
        // Inline style for border if CSS class not exists, but cleaner to use class. 
        // I'll assume CSS allows custom styles or I add specific style attribute.
        const borderStyle = statusClass === "border-status-critical" ? "border: 2px solid var(--color-error);" : 
                            statusClass === "border-status-warning" ? "border: 2px solid var(--color-warning);" : "";

        const card = document.createElement("article");
        card.className = "vehicle-card vehicle-card-modern";
        card.dataset.veiculoId = v.id;
        if (borderStyle) card.setAttribute("style", borderStyle);

        const matricula = v.matricula || "Sem matrícula";
        const combustivel = v.combustivelPadrao || "N/D";
        const ano = v.ano || "";
        
        // Additional info from analytics (optional: Range)
        let rangeInfo = "";
        if (analytics && analytics.kmAteReservaEstimado !== null && analytics.alertaFuelNivel !== 'none') {
             rangeInfo = `<div style="font-size:0.75rem; color:var(--color-text-secondary); margin-top:4px;">
                ~${analytics.kmAteReservaEstimado} km até reserva
             </div>`;
        }

        card.innerHTML = `
          <div class="vehicle-card-top">
            <div class="vehicle-left">
              <div class="vehicle-avatar">
                <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-car"></use></svg>
              </div>

              <div class="vehicle-text">
                <h3 class="vehicle-title">${v.nome}</h3>
                <p class="vehicle-subtitle">${v.marca} ${v.modelo}</p>

                <div class="vehicle-badges">
                  <span class="badge badge-outline">${matricula}</span>
                  ${statusBadge}
                </div>
                ${rangeInfo}
              </div>
            </div>

            <div class="vehicle-arrow">
              <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-chevron-right"></use></svg>
            </div>
          </div>

          <div class="vehicle-divider"></div>

          <div class="vehicle-bottom">
            <div class="metric">
              <div class="metric-value">${stats.count}</div>
              <div class="metric-label">Abastecimentos</div>
            </div>

            <div class="metric metric-center">
              <div class="metric-value metric-value-primary">${moedaSymbol}${stats.total.toFixed(
                0
              )}</div>
              <div class="metric-label">Total gasto</div>
            </div>

            <span class="fuel-pill">${combustivel}</span>
          </div>
        `;

        card.addEventListener("click", () => {
          window.location.href = `veiculo.html?id=${v.id}`;
        });

        listEl.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      showMessage("Erro ao carregar veículos.", "error");
    }
  }


  // -------------------------------------------------------------------
  // SUBMISSíƒO DO FORMULíRIO (apenas em veiculos.html)
  // -------------------------------------------------------------------
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage("", null);

      const nome = document.getElementById("vehicle-name").value.trim();
      const marca = document.getElementById("vehicle-brand").value.trim();
      const modelo = document.getElementById("vehicle-model").value.trim();
      const matricula = document.getElementById("vehicle-plate").value.trim();
      const combustivelPadrao = document.getElementById("vehicle-fuel").value;
      const odometroInicial = document
        .getElementById("vehicle-odometer")
        .value.trim();

      try {
        if (!nome || !marca || !modelo) {
          throw new Error("Preencha pelo menos nome, marca e modelo.");
        }

        await createVeiculo({
          nome,
          marca,
          modelo,
          matricula,
          combustivelPadrao,
          odometroInicial,
        });

        showMessage("Veículo guardado com sucesso! âœ…", "success");
        form.reset();
        loadVeiculos();
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Erro ao guardar veículo.", "error");
      }
    });
  }

  // -------------------------------------------------------------------
  // BOTí•ES "ADICIONAR VEíCULO" NO DASHBOARD
  // -------------------------------------------------------------------

  // botão no header
  if (btnAddVehicle) {
    btnAddVehicle.addEventListener("click", () => {
      // leva para o ecrã de gestão/adicionar veículos
      window.location.href = "veiculos.html";
    });
  }

  // botão no estado vazio "Adicionar primeiro veículo"
  if (btnAddFirstVehicle) {
    btnAddFirstVehicle.addEventListener("click", () => {
      window.location.href = "veiculos.html";
    });
  }

  // -------------------------------------------------------------------
  // AUTENTICAí‡íƒO ←’ Sí“ CARREGA VEíCULOS QUANDO auth.currentUser EXISTE
  // -------------------------------------------------------------------
  if (
    typeof auth !== "undefined" &&
    auth &&
    typeof auth.onAuthStateChanged === "function"
  ) {
    auth.onAuthStateChanged((user) => {
      if (!user) {
        // não autenticado ←’ mostra estado vazio
        if (listEl) listEl.innerHTML = "";
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      // utilizador autenticado ←’ carregar veículos
      loadVeiculos();
    });
  } else {
    // fallback (por segurança)
    loadVeiculos();
  }
});
