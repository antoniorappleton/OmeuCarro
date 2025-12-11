// js/veiculo.js

document.addEventListener("DOMContentLoaded", () => {
  const el = {
    name: document.getElementById("vehicle-name"),
    subtitle: document.getElementById("vehicle-subtitle"),
    plate: document.getElementById("vehicle-plate"),
    fuel: document.getElementById("vehicle-fuel"),
    odo: document.getElementById("vehicle-odometer"),
    msg: document.getElementById("vehicle-message"),

    kpiGasto: document.getElementById("kpi-gasto"),
    kpiLitros: document.getElementById("kpi-litros"),
    kpiConsumo: document.getElementById("kpi-consumo"),
    kpiCustoKm: document.getElementById("kpi-custo-km"),
    kpiTotalReg: document.getElementById("kpi-total-registos"),

    fuelList: document.getElementById("fuel-list"),
    fuelEmpty: document.getElementById("fuel-empty"),
    btnAddFuel: document.getElementById("btn-add-fuel"),
  };

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function showMessage(text, type = "") {
    el.msg.textContent = text;
    el.msg.className = "form-message " + (type ? `form-message--${type}` : "");
  }

  async function init() {
    const id = getParam("id");
    if (!id) {
      showMessage("Nenhum veículo indicado.", "error");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showMessage("Sessão expirada.", "error");
      return;
    }

    // Carregar veículos
    const veiculos = await getVeiculosDoUtilizador();
    const v = veiculos.find((x) => x.id === id);
    if (!v) {
      showMessage("Veículo não encontrado.", "error");
      return;
    }

    // Preencher header
    el.name.textContent = v.nome;
    el.subtitle.textContent = `${v.marca} ${v.modelo}`;
    el.plate.textContent = v.matricula || "Sem matrícula";
    el.fuel.textContent = v.combustivelPadrao || "—";
    el.odo.textContent = `${v.odometroInicial} km`;

    // Botão "Novo abastecimento"
    el.btnAddFuel.onclick = () => {
      window.location.href = `abastecimentos.html?veiculoId=${id}`;
    };

    // Carregar abastecimentos
    const abs = await getAbastecimentosDoUtilizador({
      veiculoId: id,
      limite: 500,
    });

    // Se vazio
    if (abs.length === 0) {
      el.fuelEmpty.classList.remove("hidden");
      el.fuelList.innerHTML = "";
      el.kpiTotalReg.textContent = "0 registos";
      return;
    }

    el.fuelEmpty.classList.add("hidden");

    // KPIs
    let totalLitros = 0;
    let totalGasto = 0;

    abs.forEach((a) => {
      const L = Number(a.litros) || 0;
      const P = Number(a.precoPorLitro) || 0;
      totalLitros += L;
      totalGasto += L * P;
    });

    el.kpiGasto.textContent = "€" + totalGasto.toFixed(2);
    el.kpiLitros.textContent = totalLitros.toFixed(1) + " L";
    el.kpiTotalReg.textContent = abs.length + " registos";

    // Consumo médio e custo/km
    abs.sort((a, b) => (a.odometro || 0) - (b.odometro || 0));
    let km = 0;
    let litrosSeg = 0;
    let custoSeg = 0;

    for (let i = 1; i < abs.length; i++) {
      const d = abs[i].odometro - abs[i - 1].odometro;
      if (d > 0) {
        km += d;
        litrosSeg += abs[i].litros;
        custoSeg += abs[i].litros * abs[i].precoPorLitro;
      }
    }

    if (km > 0) {
      el.kpiConsumo.textContent =
        (litrosSeg / (km / 100)).toFixed(1) + " L/100km";
      el.kpiCustoKm.textContent = (custoSeg / km).toFixed(3) + " €/km";
    }

    // LISTA DE ABASTECIMENTOS
    el.fuelList.innerHTML = "";

    abs.forEach((a) => {
      const card = document.createElement("article");
      card.className = "card";
      card.style.cursor = "pointer";

      const custo = (a.litros * a.precoPorLitro).toFixed(2);

      card.innerHTML = `
        <div class="fuel-item">
          <div class="fuel-item-main">
            <div class="fuel-item-title">${a.data} • ${a.litros} L</div>
            <div class="fuel-item-sub">
              €${custo} — ${a.precoPorLitro.toFixed(3)} €/L — ${a.odometro} km
            </div>
            <div class="fuel-item-sub2">${a.tipoCombustivel || ""} ${
        a.posto || ""
      }</div>
          </div>
          <div class="fuel-item-actions">
            <button class="btn btn-outline btn-sm" data-edit="${
              a.id
            }">Editar</button>
            <button class="btn btn-outline btn-sm" data-del="${
              a.id
            }">Eliminar</button>
          </div>
        </div>
      `;

      el.fuelList.appendChild(card);
    });

    // Eventos editar / eliminar
    el.fuelList.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");

      if (edit) {
        const idAbs = edit.getAttribute("data-edit");
        window.location.href = `abastecimentos.html?id=${idAbs}&veiculoId=${id}`;
        return;
      }

      if (del) {
        const idAbs = del.getAttribute("data-del");
        if (!confirm("Eliminar este abastecimento?")) return;
        await deleteAbastecimento(idAbs);
        location.reload();
      }
    });
  }

  auth.onAuthStateChanged((user) => {
    if (!user) {
      showMessage("Sessão terminada.", "error");
      return;
    }
    init();
  });
});
