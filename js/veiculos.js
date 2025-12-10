// js/veiculos.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("vehicle-form");
  const msgEl = document.getElementById("vehicle-message");
  const listEl = document.getElementById("vehicles-list");
  const emptyEl = document.getElementById("vehicles-empty");

  function showMessage(text, type) {
    if (!msgEl) return;
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
      const veiculos = await getVeiculosDoUtilizador();

      if (!veiculos.length) {
        emptyEl.classList.remove("hidden");
        return;
      }

      veiculos.forEach((v) => {
        const card = document.createElement("article");
        card.className = "vehicle-card";
        card.innerHTML = `
          <div class="vehicle-card-header">
            <div>
              <div class="vehicle-card-title">${v.nome || ""}</div>
              <div class="vehicle-card-subtitle">
                ${v.marca || ""} ${v.modelo || ""}
              </div>
            </div>
            <span class="vehicle-card-meta">
              ${v.matricula || ""}
            </span>
          </div>
          <div class="vehicle-card-meta">
            ${v.combustivelPadrao || "Combustível não definido"}
          </div>
          <div class="vehicle-card-footer">
            <span>Odómetro inicial: ${v.odometroInicial || 0} km</span>
            <a href="abastecimentos.html" class="link-secondary">
              Ver abastecimentos
            </a>
          </div>
        `;
        listEl.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      showMessage(err.message || "Erro ao carregar veículos.", "error");
    }
  }

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

  loadVeiculos();
});
