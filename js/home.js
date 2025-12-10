// public/js/home.js

document.addEventListener("DOMContentLoaded", () => {
  // elementos das stats
  const statVeiculos = document.getElementById("stat-veiculos-value");
  const statGasto = document.getElementById("stat-gasto-value");
  const statLitros = document.getElementById("stat-litros-value");
  const statAbastecimentos = document.getElementById(
    "stat-abastecimentos-value"
  );

  // elementos da lista de veículos
  const listEl = document.getElementById("vehicles-list");
  const emptyEl = document.getElementById("vehicles-empty");

  // modal veículo
  const vehicleModalOverlay = document.getElementById("vehicle-modal-overlay");
  const vehicleModalForm = document.getElementById("vehicle-modal-form");
  const vehicleModalMessage = document.getElementById("vehicle-modal-message");
  const btnCloseVehicleModal = document.getElementById(
    "btn-close-vehicle-modal"
  );
  const btnCancelVehicleModal = document.getElementById(
    "btn-cancel-vehicle-modal"
  );

  const btnAdd = document.getElementById("btn-add-vehicle");
  const btnAddFirst = document.getElementById("btn-add-first-vehicle");

  // estado para saber se estamos a criar ou editar
  let currentVehicleId = null;

  // ------------- helpers UI -------------
  function showVehicleMessage(text, type) {
    if (!vehicleModalMessage) return;
    vehicleModalMessage.textContent = text || "";
    vehicleModalMessage.className = "form-message";
    if (type === "error")
      vehicleModalMessage.classList.add("form-message--error");
    if (type === "success")
      vehicleModalMessage.classList.add("form-message--success");
  }

  function openVehicleModal(
    { mode, veiculo } = { mode: "create", veiculo: null }
  ) {
    if (!vehicleModalOverlay) return;
    vehicleModalOverlay.classList.add("is-open");
    document.body.classList.add("modal-open");

    // título + botão
    const titleEl = document.getElementById("vehicle-modal-title");
    const submitBtn = vehicleModalForm.querySelector(
      "button[type='submit'] span"
    );
    if (mode === "edit") {
      currentVehicleId = veiculo.id;
      titleEl.textContent = "Editar veículo";
      submitBtn.textContent = "Guardar alterações";
      // preencher formulário
      document.getElementById("modal-vehicle-name").value = veiculo.nome || "";
      document.getElementById("modal-vehicle-brand").value =
        veiculo.marca || "";
      document.getElementById("modal-vehicle-model").value =
        veiculo.modelo || "";
      document.getElementById("modal-vehicle-plate").value =
        veiculo.matricula || "";
      document.getElementById("modal-vehicle-fuel").value =
        veiculo.combustivelPadrao || "";
      document.getElementById("modal-vehicle-odometer").value =
        veiculo.odometroInicial || "";
    } else {
      currentVehicleId = null;
      titleEl.textContent = "Adicionar veículo";
      submitBtn.textContent = "Guardar veículo";
      vehicleModalForm.reset();
    }

    showVehicleMessage("", null);
  }

  function closeVehicleModal() {
    if (!vehicleModalOverlay) return;
    vehicleModalOverlay.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    currentVehicleId = null;
  }

  // ------------- carregar dados da Firestore -------------
  async function carregarDashboard() {
    try {
      // VEÍCULOS
      const veiculos = await getVeiculosDoUtilizador();
      statVeiculos.textContent = veiculos.length || 0;

      // render lista de veículos
      listEl.innerHTML = "";
      if (!veiculos.length) {
        emptyEl.classList.remove("hidden");
      } else {
        emptyEl.classList.add("hidden");
      }

      veiculos.forEach((v) => {
        const card = document.createElement("article");
        card.className = "vehicle-card";
        card.innerHTML = `
          <div class="vehicle-card-header">
            <div>
              <div class="vehicle-card-title">${v.nome || ""}</div>
              <div class="vehicle-card-subtitle">${v.marca || ""} ${
          v.modelo || ""
        }</div>
            </div>

            <div class="vehicle-card-actions">
              <button class="vehicle-btn vehicle-btn-edit" title="Editar veículo">
                <svg class="icon" aria-hidden="true">
                  <use href="assets/icons.svg#icon-edit"></use>
                </svg>
              </button>
              <button class="vehicle-btn vehicle-btn-delete" title="Eliminar veículo">
                <svg class="icon" aria-hidden="true">
                  <use href="assets/icons.svg#icon-trash"></use>
                </svg>
              </button>
            </div>
          </div>

          <div class="vehicle-card-meta">
            <span>${v.matricula || "Sem matrícula"}</span>
            <span>${v.combustivelPadrao || "Combustível não definido"}</span>
          </div>

          <div class="vehicle-card-footer" id="vehicle-footer-${v.id}">
            <span>Abastecimentos: --</span>
            <span>Total: --</span>
          </div>
        `;

        // eventos de editar/eliminar
        const editBtn = card.querySelector(".vehicle-btn-edit");
        const deleteBtn = card.querySelector(".vehicle-btn-delete");

        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openVehicleModal({ mode: "edit", veiculo: v });
        });

        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const confirma = confirm(
            `Eliminar o veículo "${v.nome}"? Esta ação não pode ser anulada.`
          );
          if (!confirma) return;
          try {
            await deleteVeiculo(v.id);
            await carregarDashboard(); // recarregar tudo
          } catch (err) {
            console.error(err);
            alert("Erro ao eliminar veículo.");
          }
        });

        listEl.appendChild(card);
      });

      // ABASTECIMENTOS
      const abastecimentos = await getAbastecimentosDoUtilizador();

      statAbastecimentos.textContent = abastecimentos.length || 0;

      let totalLitros = 0;
      let totalGasto = 0;
      const totPorVeiculo = {};

      abastecimentos.forEach((abs) => {
        totalLitros += Number(abs.litros) || 0;
        const custoTotal =
          (Number(abs.litros) || 0) * (Number(abs.precoPorLitro) || 0);
        totalGasto += custoTotal;

        if (!totPorVeiculo[abs.veiculoId]) {
          totPorVeiculo[abs.veiculoId] = { count: 0, total: 0 };
        }
        totPorVeiculo[abs.veiculoId].count += 1;
        totPorVeiculo[abs.veiculoId].total += custoTotal;
      });

      statLitros.textContent = `${totalLitros.toFixed(1)} L`;
      statGasto.textContent = `€${totalGasto.toFixed(2)}`;

      // atualizar rodapé de cada cartão
      Object.keys(totPorVeiculo).forEach((vid) => {
        const el = document.getElementById(`vehicle-footer-${vid}`);
        if (el) {
          el.innerHTML = `
            <span>Abastecimentos: ${totPorVeiculo[vid].count}</span>
            <span>Total: €${totPorVeiculo[vid].total.toFixed(2)}</span>
          `;
        }
      });
    } catch (err) {
      console.error("Erro a carregar dashboard:", err);
    }
  }

  // ------------- eventos do modal -------------
  function handleAddVehicleClick(e) {
    e.preventDefault();
    openVehicleModal({ mode: "create" });
  }

  if (btnAdd) btnAdd.addEventListener("click", handleAddVehicleClick);
  if (btnAddFirst) btnAddFirst.addEventListener("click", handleAddVehicleClick);

  if (btnCloseVehicleModal) {
    btnCloseVehicleModal.addEventListener("click", (e) => {
      e.preventDefault();
      closeVehicleModal();
    });
  }

  if (btnCancelVehicleModal) {
    btnCancelVehicleModal.addEventListener("click", (e) => {
      e.preventDefault();
      closeVehicleModal();
    });
  }

  if (vehicleModalOverlay) {
    vehicleModalOverlay.addEventListener("click", (e) => {
      if (e.target === vehicleModalOverlay) {
        closeVehicleModal();
      }
    });
  }

  if (vehicleModalForm) {
    vehicleModalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showVehicleMessage("", null);

      const nome = document.getElementById("modal-vehicle-name").value.trim();
      const marca = document.getElementById("modal-vehicle-brand").value.trim();
      const modelo = document
        .getElementById("modal-vehicle-model")
        .value.trim();
      const matricula = document
        .getElementById("modal-vehicle-plate")
        .value.trim();
      const combustivelPadrao =
        document.getElementById("modal-vehicle-fuel").value;
      const odometroInicial = document
        .getElementById("modal-vehicle-odometer")
        .value.trim();

      try {
        if (!nome || !marca || !modelo) {
          throw new Error("Preencha pelo menos Nome, Marca e Modelo.");
        }

        const payload = {
          nome,
          marca,
          modelo,
          matricula,
          combustivelPadrao,
          odometroInicial,
        };

        if (!currentVehicleId) {
          await createVeiculo(payload);
          showVehicleMessage("Veículo criado com sucesso! ✅", "success");
        } else {
          await updateVeiculo(currentVehicleId, payload);
          showVehicleMessage("Veículo atualizado com sucesso! ✅", "success");
        }

        await carregarDashboard();
        setTimeout(() => closeVehicleModal(), 800);
      } catch (err) {
        console.error(err);
        showVehicleMessage(err.message || "Erro ao guardar veículo.", "error");
      }
    });
  }

  // ------------- Logout -------------
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await auth.signOut();
        window.location.href = "index.html";
      } catch (err) {
        console.error("Erro ao terminar sessão:", err);
      }
    });
  }

  // inicializar dashboard
  carregarDashboard();
});
