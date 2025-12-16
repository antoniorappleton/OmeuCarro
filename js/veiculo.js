// js/veiculo.js
// DETALHE DE UM VEÍCULO + ABASTECIMENTOS (SUBCOLEÇÃO)
// + DOCUMENTOS (LINK EXTERNO / STORAGE) COM CATEGORIA + FILTRO + ÍCONES
// + TÍTULO (NOME) + NOTA NO DOCUMENTO

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // ELEMENTOS BASE
  // =========================
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

  // =========================
  // HELPERS
  // =========================
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function showMessage(text, type = "") {
    if (!el.msg) return;
    el.msg.textContent = text || "";
    el.msg.className = "form-message " + (type ? `form-message--${type}` : "");
  }

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

  function normalizeCategoria(c) {
    const v = (c || "").trim();
    if (!v) return "Outros";

    // compat com opções antigas
    if (v === "Manutenção / Reparações") return "Reparacao";
    if (v === "Manutencao") return "Reparacao";

    return v; // Carro | Seguro | Reparacao | Outros (ou outras)
  }

  function detectKind(url = "", mimeType = "") {
    const u = (url || "").toLowerCase();
    const mt = (mimeType || "").toLowerCase();
    if (mt.includes("pdf") || u.endsWith(".pdf") || u.includes("pdf"))
      return "pdf";
    if (mt.startsWith("image/") || u.match(/\.(jpg|jpeg|png|webp)$/))
      return "image";
    return "link";
  }

  function encodeDataUrl(url) {
    // evita problemas com & ? etc em data-attributes
    return encodeURIComponent(url || "");
  }

  function decodeDataUrl(enc) {
    try {
      return decodeURIComponent(enc || "");
    } catch {
      return enc || "";
    }
  }

  // =========================
  // DOCUMENTOS
  // =========================
  async function renderDocumentos(veiculoId) {
    const list = document.getElementById("docs-list");
    if (!list) return;

    const filterEl = document.getElementById("docs-filter");
    const filtro = (filterEl?.value || "Todos").trim();

    list.innerHTML = `<div class="muted">A carregar...</div>`;

    let docs = [];
    try {
      docs = await getDocumentosDoVeiculo(veiculoId, 200);
    } catch (e) {
      console.error(e);
      list.innerHTML = `<div class="muted">Erro a carregar documentos.</div>`;
      return;
    }

    const filtered = docs.filter((d) => {
      if (filtro === "Todos") return true;
      return normalizeCategoria(d.categoria || "Outros") === filtro;
    });

    if (!filtered.length) {
      list.innerHTML = `<div class="muted">Sem documentos.</div>`;
      return;
    }

    list.innerHTML = filtered
      .map((d) => {
        const openUrl = (d.linkExterno || d.downloadURL || "").trim();
        const kind = detectKind(openUrl, d.mimeType || "");
        const categoria = normalizeCategoria(d.categoria || "Outros");

        const titulo = (d.titulo || "").trim();
        const nota = (d.nota || "").trim();

        const preview =
          kind === "image" && openUrl
            ? `<img src="${openUrl}" alt="${escapeHtml(
                titulo || d.tipo || "Documento"
              )}"
                style="width:64px;height:64px;object-fit:cover;border-radius:12px;border:1px solid rgba(0,0,0,.08);" />`
            : `<div style="width:64px;height:64px;border-radius:12px;border:1px solid rgba(0,0,0,.08);
                        display:flex;align-items:center;justify-content:center;">
                <svg class="icon"><use href="assets/icons.svg#icon-file"></use></svg>
              </div>`;

        const badgeKind =
          kind === "pdf" ? "PDF" : kind === "image" ? "Imagem" : "Link";

        return `
          <article class="card doc-card"
                  data-open-url="${encodeDataUrl(openUrl)}"
                  style="margin:0; padding:14px; cursor:${
                    openUrl ? "pointer" : "default"
                  };">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
              <div style="display:flex; gap:12px; align-items:flex-start;">
                ${preview}
                <div>
                  <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <span class="badge badge-secondary">${escapeHtml(
                      categoria
                    )}</span>
                    <span class="badge badge-outline">${escapeHtml(
                      badgeKind
                    )}</span>
                  </div>

                  <div style="margin-top:6px; font-weight:600;">
                    ${escapeHtml(titulo || d.tipo || "Documento")}
                  </div>

                  ${
                    nota
                      ? `<div class="muted" style="font-size:12px; margin-top:4px;">
                           ${escapeHtml(nota)}
                         </div>`
                      : ""
                  }

                  ${
                    openUrl
                      ? `<div class="muted" style="font-size:12px; margin-top:4px; word-break:break-all;">
                           ${escapeHtml(openUrl)}
                         </div>`
                      : ""
                  }
                </div>
              </div>

              <div style="display:flex; gap:10px; align-items:center;">
                ${
                  openUrl
                    ? `<a class="icon-btn" href="${openUrl}" target="_blank" rel="noopener" aria-label="Abrir">
                        <svg class="icon"><use href="assets/icons.svg#icon-link"></use></svg>
                      </a>`
                    : ""
                }
                <button class="icon-btn" type="button" data-doc-del="${
                  d.id
                }" aria-label="Apagar">
                  <svg class="icon"><use href="assets/icons.svg#icon-trash"></use></svg>
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    // Abrir ao clicar no cartão (exceto em botões/links)
    list.querySelectorAll(".doc-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button, a")) return;

        const enc = card.getAttribute("data-open-url");
        const url = decodeDataUrl(enc);
        if (!url) return;

        window.open(url, "_blank", "noopener");
      });
    });

    // Apagar
    list.querySelectorAll("[data-doc-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation(); // evita abrir o card ao apagar

        const docId = btn.getAttribute("data-doc-del");
        if (!confirm("Apagar este documento?")) return;
        await deleteDocumentoDoVeiculo(veiculoId, docId);
        await renderDocumentos(veiculoId);
      });
    });
  }

  function initDocumentos(veiculoId) {
    const catEl = document.getElementById("ext-categoria");
    const tipoEl = document.getElementById("ext-tipo");
    const urlEl = document.getElementById("ext-url");

    // NOVOS campos
    const tituloEl = document.getElementById("ext-titulo");
    const notaEl = document.getElementById("ext-nota");

    const btn = document.getElementById("btn-ext-save");
    const msg = document.getElementById("ext-msg");
    const filterEl = document.getElementById("docs-filter");

    if (!btn || !urlEl || !catEl || !tipoEl) {
      console.warn("initDocumentos(): elementos não encontrados", {
        btn,
        urlEl,
        catEl,
        tipoEl,
        tituloEl,
        notaEl,
      });
    }

    if (filterEl) {
      filterEl.addEventListener("change", () => renderDocumentos(veiculoId));
    }

    if (btn) {
      btn.addEventListener("click", async () => {
        try {
          if (msg) msg.textContent = "";

          const categoria = normalizeCategoria(catEl?.value || "Outros");
          const tipo = (tipoEl?.value || "Documento").trim();
          const url = (urlEl?.value || "").trim();

          const titulo = (tituloEl?.value || "").trim();
          const nota = (notaEl?.value || "").trim();

          if (!url || !/^https?:\/\/.+/i.test(url)) {
            if (msg) msg.textContent = "Coloca um link válido (https://...).";
            return;
          }

          btn.disabled = true;
          if (msg) msg.textContent = "A guardar...";

          // Usa a função do firestore.js (recomendado)
          await addDocumentoLinkExterno(veiculoId, {
            categoria,
            tipo,
            url,
            titulo,
            nota,
          });

          urlEl.value = "";
          if (tituloEl) tituloEl.value = "";
          if (notaEl) notaEl.value = "";

          if (msg) msg.textContent = "Link guardado ✅";
          await renderDocumentos(veiculoId);
        } catch (e) {
          console.error(e);
          if (msg) msg.textContent = e.message || "Erro ao guardar.";
        } finally {
          btn.disabled = false;
        }
      });
    }

    renderDocumentos(veiculoId);
  }

  // =========================
  // INIT PRINCIPAL
  // =========================
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

    // VEÍCULO
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

    // BOTÃO NOVO ABASTECIMENTO
    if (el.btnAddFuel) {
      el.btnAddFuel.onclick = () => {
        window.location.href = `abastecimentos.html?veiculoId=${encodeURIComponent(
          veiculoId
        )}`;
      };
    }

    // DOCUMENTOS
    initDocumentos(veiculoId);

    // ABASTECIMENTOS
    const abs = await getAbastecimentosDoVeiculo(veiculoId, 500);

    if (!abs.length) {
      if (el.fuelEmpty) el.fuelEmpty.classList.remove("hidden");
      if (el.fuelList) el.fuelList.innerHTML = "";
      if (el.kpiTotalReg) el.kpiTotalReg.textContent = `${abs.length} registos`;
      return;
    }

    if (el.fuelEmpty) el.fuelEmpty.classList.add("hidden");

    // KPIs
    let totalLitros = 0;
    let totalGasto = 0;

    abs.forEach((a) => {
      const L = Number(a.litros) || 0;
      const P = Number(a.precoPorLitro) || 0;
      totalLitros += L;
      totalGasto += L * P;
    });

    if (el.kpiGasto) el.kpiGasto.textContent = `€${totalGasto.toFixed(2)}`;
    if (el.kpiLitros) el.kpiLitros.textContent = `${totalLitros.toFixed(1)} L`;
    if (el.kpiTotalReg) el.kpiTotalReg.textContent = `${abs.length} registos`;

    // consumo médio e custo/km
    abs.sort((a, b) => (a.odometro || 0) - (b.odometro || 0));

    let km = 0;
    let litrosSeg = 0;
    let custoSeg = 0;

    for (let i = 1; i < abs.length; i++) {
      const d = (abs[i].odometro || 0) - (abs[i - 1].odometro || 0);
      if (d > 0) {
        km += d;
        litrosSeg += Number(abs[i].litros) || 0;
        custoSeg +=
          (Number(abs[i].litros) || 0) * (Number(abs[i].precoPorLitro) || 0);
      }
    }

    if (el.kpiConsumo) {
      el.kpiConsumo.textContent =
        km > 0 ? (litrosSeg / (km / 100)).toFixed(1) + " L/100km" : "—";
    }

    if (el.kpiCustoKm) {
      el.kpiCustoKm.textContent =
        km > 0 ? (custoSeg / km).toFixed(3) + " €/km" : "—";
    }

    // LISTA DE ABASTECIMENTOS
    if (!el.fuelList) return;
    el.fuelList.innerHTML = "";

    abs.forEach((a) => {
      const card = document.createElement("article");
      card.className = "fuel-card";

      const litros = Number(a.litros) || 0;
      const ppl = Number(a.precoPorLitro) || 0;
      const custo = (litros * ppl).toFixed(2);

      card.innerHTML = `
        <div class="fuel-item">
          <div class="fuel-item-main">
            <div class="fuel-item-title">${escapeHtml(
              a.data
            )} • ${litros} L</div>

            <div class="fuel-item-sub">
              €${custo} — ${ppl.toFixed(3)} €/L — ${Number(a.odometro) || 0} km
            </div>

            <div class="fuel-item-sub2">
              ${escapeHtml(a.tipoCombustivel || "")} ${
        a.posto ? "— " + escapeHtml(a.posto) : ""
      }
            </div>
          </div>

          <div class="fuel-item-actions">
            <button class="icon-btn-sm" type="button" data-edit="${
              a.id
            }" aria-label="Editar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0-4-4L4 16v4z"
                  stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <button class="icon-btn-sm danger" type="button" data-del="${
              a.id
            }" aria-label="Eliminar">
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

    // EDITAR / ELIMINAR
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

  // =========================
  // AUTH / START
  // =========================
  auth.onAuthStateChanged((user) => {
    if (!user) {
      showMessage("Sessão terminada.", "error");
      return;
    }
    init();
  });
});
