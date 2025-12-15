// js/veiculo.js
// DETALHE DE UM VEÍCULO + ABASTECIMENTOS (SUBCOLEÇÃO)

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
    if (!el.msg) return;
    el.msg.textContent = text || "";
    el.msg.className = "form-message " + (type ? `form-message--${type}` : "");
  }


  async function init() {
    const veiculoId = getParam("id");
    if (!veiculoId) {
      showMessage("Nenhum veículo indicado.", "error");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showMessage("Sessão expirada.", "error");
      return;
      
    }

    // =================================================
    // VEÍCULO
    // =================================================
    const veiculos = await getVeiculosDoUtilizador();
    const v = veiculos.find((x) => x.id === veiculoId);

    if (!v) {
      showMessage("Veículo não encontrado.", "error");
      return;
    }

    el.name.textContent = v.nome;
    el.subtitle.textContent = `${v.marca} ${v.modelo}`;
    el.plate.textContent = v.matricula || "Sem matrícula";
    el.fuel.textContent = v.combustivelPadrao || "—";
    el.odo.textContent = `${v.odometroInicial} km`;

    // =================================================
    // BOTÃO NOVO ABASTECIMENTO
    // =================================================
    el.btnAddFuel.onclick = () => {
      window.location.href = `abastecimentos.html?veiculoId=${encodeURIComponent(
        veiculoId
      )}`;
    };
      initDocumentos(veiculoId);

    // =================================================
    // ABASTECIMENTOS (SUBCOLEÇÃO)
    // =================================================
    const abs = await getAbastecimentosDoVeiculo(veiculoId, 500);

    if (!abs.length) {
      el.fuelEmpty.classList.remove("hidden");
      el.fuelList.innerHTML = "";
      if (el.kpiTotalReg) {
        if (el.kpiTotalReg) {
          el.kpiTotalReg.textContent = `${abs.length} registos`;
        }

      }

      return;
    }

    el.fuelEmpty.classList.add("hidden");

    // =================================================
    // KPIs
    // =================================================
    let totalLitros = 0;
    let totalGasto = 0;

    abs.forEach((a) => {
      const L = Number(a.litros) || 0;
      const P = Number(a.precoPorLitro) || 0;
      totalLitros += L;
      totalGasto += L * P;
    });

    el.kpiGasto.textContent = `€${totalGasto.toFixed(2)}`;
    el.kpiLitros.textContent = `${totalLitros.toFixed(1)} L`;
    if (el.kpiTotalReg) {
      el.kpiTotalReg.textContent = `${abs.length} registos`;
    }


    // consumo médio e custo/km
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

    if (el.kpiConsumo) {
      el.kpiConsumo.textContent =
        km > 0
          ? (litrosSeg / (km / 100)).toFixed(1) + " L/100km"
          : "—";
    }

    if (el.kpiCustoKm) {
      el.kpiCustoKm.textContent =
        km > 0
          ? (custoSeg / km).toFixed(3) + " €/km"
          : "—";
    }
    // =================================================
    // LISTA DE ABASTECIMENTOS
    // =================================================
    el.fuelList.innerHTML = "";

    abs.forEach((a) => {
      const card = document.createElement("article");
      card.className = "fuel-card";

      const custo = (a.litros * a.precoPorLitro).toFixed(2);

      card.innerHTML = `
        <div class="fuel-item">
          <div class="fuel-item-main">
            <div class="fuel-item-title">${a.data} • ${a.litros} L</div>

            <div class="fuel-item-sub">
              €${custo} — ${a.precoPorLitro.toFixed(3)} €/L — ${a.odometro} km
            </div>

            <div class="fuel-item-sub2">
              ${a.tipoCombustivel || ""} ${a.posto ? "— " + a.posto : ""}
            </div>
          </div>

          <div class="fuel-item-actions">
            <!-- EDITAR -->
            <button class="icon-btn-sm" type="button" data-edit="${a.id}" aria-label="Editar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0-4-4L4 16v4z"
                  stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <!-- ELIMINAR -->
            <button class="icon-btn-sm danger" type="button" data-del="${a.id}" aria-label="Eliminar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6v12M16 6v12M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"
                  stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      el.fuelList.appendChild(card);
    });

    // =================================================
    // EDITAR / ELIMINAR
    // =================================================
    el.fuelList.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");

      if (edit) {
        const idAbs = edit.getAttribute("data-edit");
        window.location.href = `abastecimentos.html?id=${encodeURIComponent(
          idAbs
        )}&veiculoId=${encodeURIComponent(veiculoId)}`;
        return;
      }

      if (del) {
        const idAbs = del.getAttribute("data-del");
        if (!confirm("Eliminar este abastecimento?")) return;
        await deleteAbastecimento(veiculoId, idAbs);
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


  function escapeHtml(s) {
    return (s || "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        }[m])
    );
  }

  async function renderDocumentos(veiculoId) {
    const list = document.getElementById("docs-list");
    const msg = document.getElementById("doc-msg");
    if (!list) return;

    list.innerHTML = "A carregar...";
    if (msg) msg.textContent = "";

    const docs = await getDocumentosDoVeiculo(veiculoId, 100);

    if (!docs.length) {
      list.innerHTML = `<div class="muted">Sem documentos.</div>`;
      return;
    }

    list.innerHTML = docs
      .map(
        (d) => `
    <article class="doc-item" style="border:1px solid rgba(0,0,0,.08); border-radius:12px; padding:12px;">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <img src="${d.downloadURL}" alt="${escapeHtml(d.tipo)}"
             style="width:96px; height:96px; object-fit:cover; border-radius:10px; border:1px solid rgba(0,0,0,.08);" />
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHtml(
            d.tipo || "Documento"
          )}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(
            d.nomeOriginal || ""
          )}</div>
          ${
            d.descricao
              ? `<div style="margin-top:6px;">${escapeHtml(d.descricao)}</div>`
              : ""
          }
          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <a href="${d.downloadURL}" target="_blank" rel="noopener">Abrir</a>
            <button type="button" data-doc-del="${
              d.id
            }" class="danger">Apagar</button>
          </div>
        </div>
      </div>
    </article>
  `
      )
      .join("");

    // bind deletes
    list.querySelectorAll("[data-doc-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const docId = btn.getAttribute("data-doc-del");
        if (!confirm("Apagar este documento?")) return;
        await deleteDocumentoDoVeiculo(veiculoId, docId);
        await renderDocumentos(veiculoId);
      });
    });
  }

  function initDocumentos(veiculoId) {
    const fileEl = document.getElementById("doc-file");
    const tipoEl = document.getElementById("doc-tipo");
    const btn = document.getElementById("btn-doc-upload");
    const msg = document.getElementById("doc-msg");

    if (!fileEl || !btn) return;

    btn.addEventListener("click", async () => {
      try {
        msg.textContent = "";
        const file = fileEl.files?.[0];
        const tipo = tipoEl?.value || "Documento";
        if (!file) {
          msg.textContent = "Seleciona/tira uma fotografia primeiro.";
          return;
        }

        btn.disabled = true;
        msg.textContent = "A guardar...";

        console.log("Bucket:", firebase.app().options.storageBucket);
        console.log("UID:", auth.currentUser && auth.currentUser.uid);

        await uploadDocumentoVeiculo(veiculoId, file, { tipo });

        fileEl.value = "";
        msg.textContent = "Guardado ✅";

        await renderDocumentos(veiculoId);
      } catch (e) {
        console.error(e);
        msg.textContent = e.message || "Erro ao guardar.";
      } finally {
        btn.disabled = false;
      }
    });

    // carregar lista inicial
    renderDocumentos(veiculoId);

    // se vier do atalho #docs
    if (window.location.hash === "#docs") {
      setTimeout(() => {
        document.getElementById("docs")?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    }
  }



});
