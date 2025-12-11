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
      const [veiculos, abastecimentos] = await Promise.all([
        getVeiculosDoUtilizador(),
        getAbastecimentosDoUtilizador({ limite: 500 }),
      ]);

      if (!veiculos.length) {
        // não há veículos → mostra estado vazio
        emptyEl.classList.remove("hidden");
        return;
      }

      // construir mapa de stats por veículo (count + total gasto)
      const statsPorVeiculo = {};
      abastecimentos.forEach((abs) => {
        const vid = abs.veiculoId;
        const litros = Number(abs.litros) || 0;
        const preco = Number(abs.precoPorLitro) || 0;
        const custoTotal = litros * preco;

        if (!statsPorVeiculo[vid]) {
          statsPorVeiculo[vid] = { count: 0, total: 0 };
        }
        statsPorVeiculo[vid].count += 1;
        statsPorVeiculo[vid].total += custoTotal;
      });

      veiculos.forEach((v) => {
        const stats = statsPorVeiculo[v.id] || { count: 0, total: 0 };

        const card = document.createElement("article");
        card.className = "vehicle-card vehicle-card-modern";
        card.dataset.veiculoId = v.id;

        const matricula = v.matricula || "Sem matrícula";
        const combustivel = v.combustivelPadrao || "Combustível não definido";
        const odometroInicial = v.odometroInicial || 0;

        card.innerHTML = `
          <div class="vehicle-card-header-modern">
            <div class="vehicle-card-main">
              <div class="vehicle-avatar">
                <svg class="icon" aria-hidden="true">
                  <use href="assets/icons.svg#icon-car"></use>
                </svg>
              </div>
              <div>
                <h3 class="vehicle-title">${v.nome || "Veículo"}</h3>
                <p class="vehicle-subtitle">
                  ${v.marca || ""} ${v.modelo || ""}
                </p>
                <div class="vehicle-badges">
                  <span class="badge badge-outline">${matricula}</span>
                  <span class="badge badge-secondary">${combustivel}</span>
                </div>
              </div>
            </div>
            <div class="vehicle-arrow">
              ›
            </div>
          </div>

          <div class="vehicle-card-stats-grid">
            <div class="vehicle-stat">
              <div class="vehicle-stat-label">Abastecimentos</div>
              <div class="vehicle-stat-value">${stats.count}</div>
            </div>
            <div class="vehicle-stat">
              <div class="vehicle-stat-label">Total Gasto</div>
              <div class="vehicle-stat-value">€${stats.total.toFixed(0)}</div>
            </div>
            <div class="vehicle-stat">
              <div class="vehicle-stat-label">Odómetro inicial</div>
              <div class="vehicle-stat-value">${odometroInicial} km</div>
            </div>
          </div>

          <div class="vehicle-card-footer-modern">
            <a href="veiculo.html?id=${encodeURIComponent(
              v.id
            )}" class="link-secondary">
              Ver detalhes do veículo
            </a>
          </div>
        `;

        // clique no cartão → vai para o detalhe do veículo
        card.addEventListener("click", (e) => {
          if (e.target.closest("a")) return; // não intercepta o clique no link
          const id = card.dataset.veiculoId;
          if (!id) return;
          window.location.href = "veiculo.html?id=" + encodeURIComponent(id);
        });

        listEl.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      showMessage(err.message || "Erro ao carregar veículos.", "error");
    }
  }

  // -------------------------------------------------------------------
  // SUBMISSÃO DO FORMULÁRIO (apenas em veiculos.html)
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

        showMessage("Veículo guardado com sucesso! ✅", "success");
        form.reset();
        loadVeiculos();
      } catch (err) {
        console.error(err);
        showMessage(err.message || "Erro ao guardar veículo.", "error");
      }
    });
  }

  // -------------------------------------------------------------------
  // BOTÕES "ADICIONAR VEÍCULO" NO DASHBOARD
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
  // AUTENTICAÇÃO → SÓ CARREGA VEÍCULOS QUANDO auth.currentUser EXISTE
  // -------------------------------------------------------------------
  if (
    typeof auth !== "undefined" &&
    auth &&
    typeof auth.onAuthStateChanged === "function"
  ) {
    auth.onAuthStateChanged((user) => {
      if (!user) {
        // não autenticado → mostra estado vazio
        if (listEl) listEl.innerHTML = "";
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      // utilizador autenticado → carregar veículos
      loadVeiculos();
    });
  } else {
    // fallback (por segurança)
    loadVeiculos();
  }
});
