// js/veiculo.js
// DETALHE DE UM VEÍCULO + ABASTECIMENTOS (SUBCOLEÇÃO)
// + DOCUMENTOS (LINK EXTERNO / STORAGE) COM CATEGORIA + FILTRO + ÍCONES
// + TÍTULO (NOME) + NOTA
// + EDITAR INLINE

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
  
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll(".tab-btn[data-tab]"));
    const panels = {
      fuel: document.getElementById("tab-fuel"),
      docs: document.getElementById("tab-docs"),
      maint: document.getElementById("tab-maint"),
    };

    function setActive(key) {
      tabs.forEach((b) =>
        b.classList.toggle("is-active", b.dataset.tab === key)
      );
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle("hidden", k !== key);
      });
    }

    tabs.forEach((b) =>
      b.addEventListener("click", () => setActive(b.dataset.tab))
    );
    setActive("fuel");
  }

  function initReparacoesModal(veiculoId) {
    let editingId = null;
    const modal = document.getElementById("maint-modal");
    const openBtn = document.getElementById("btn-add-maint");
    const closeBtn = document.getElementById("maint-close");
    const cancelBtn = document.getElementById("rep-cancel");
    const saveBtn = document.getElementById("rep-save");
    const msg = document.getElementById("rep-msg");
    const linkEl = document.getElementById("rep-link");
    const descEl = document.getElementById("rep-desc");
    const dateEl = document.getElementById("rep-date");
    const kmEl = document.getElementById("rep-km");
    const costEl = document.getElementById("rep-cost");
    const shopEl = document.getElementById("rep-shop");

    function open() {
      modal.classList.remove("hidden");
      msg.textContent = "";
    }

    function close() {
      modal.classList.add("hidden");
      descEl.value = "";
      dateEl.value = "";
      kmEl.value = "";
      costEl.value = "";
      shopEl.value = "";
      linkEl.value = "";
      editingId = null; // ✅ MUITO IMPORTANTE
    }

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);

    saveBtn?.addEventListener("click", async () => {
      try {
        const descricao = descEl.value.trim();
        const data = dateEl.value;
        const link = linkEl.value.trim();

        if (!descricao || !data) {
          msg.textContent = "Descrição e data são obrigatórias.";
          return;
        }

        if (link && !/^https?:\/\/.+/i.test(link)) {
          msg.textContent = "Link inválido.";
          return;
        }

        msg.textContent = "A guardar...";

        const payload = {
          descricao,
          data,
          km: Number(kmEl.value) || null,
          custo: Number(costEl.value) || 0,
          oficina: shopEl.value.trim(),
          linkDocumento: link || null,
        };

        if (editingId) {
          await updateReparacaoDoVeiculo(veiculoId, editingId, payload);
        } else {
          await addReparacaoAoVeiculo(veiculoId, payload);
        }

        editingId = null;
        close();
        await renderReparacoes(veiculoId);

      } catch (e) {
        console.error(e);
        msg.textContent = "Erro ao guardar reparação.";
      }
    });
    window.openReparacaoForEdit = async (veiculoId, repId) => {
      const rep = await getReparacaoById(veiculoId, repId);
      if (!rep) return;

      editingId = repId;

      descEl.value = rep.descricao || "";
      dateEl.value = rep.data || "";
      kmEl.value = rep.km || "";
      costEl.value = rep.custo || "";
      shopEl.value = rep.oficina || "";
      linkEl.value = rep.linkDocumento || "";

      modal.classList.remove("hidden");
    };
  }

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

    // compat
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

  function enc(s) {
    return encodeURIComponent(s || "");
  }
  function dec(s) {
    try {
      return decodeURIComponent(s || "");
    } catch {
      return s || "";
    }
  }

  function safeJsonEnc(obj) {
    return enc(JSON.stringify(obj || {}));
  }
  function safeJsonDec(str) {
    try {
      return JSON.parse(dec(str || ""));
    } catch {
      return {};
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
        const tipo = (d.tipo || "Documento").trim();

        const preview =
          kind === "image" && openUrl
            ? `<img class="doc-preview-img" src="${openUrl}" alt="${escapeHtml(
                titulo || tipo
              )}" />`
            : `<div class="doc-preview-box">
                 <svg class="icon"><use href="assets/icons-unified.svg#icon-file"></use></svg>
               </div>`;

        const badgeKind =
          kind === "pdf" ? "PDF" : kind === "image" ? "Imagem" : "Link";

        const packed = safeJsonEnc({
          categoria,
          tipo,
          titulo,
          nota,
          linkExterno: openUrl,
        });

        return `
          <article class="card doc-card" data-open-url="${enc(
            openUrl
          )}" data-doc-id="${d.id}">
            <div class="doc-row">
              <div class="doc-left">
                ${preview}

                <div class="doc-meta">
                  <div class="doc-badges">
                    <span class="badge badge-secondary">${escapeHtml(
                      categoria
                    )}</span>
                    <span class="badge badge-outline">${escapeHtml(
                      badgeKind
                    )}</span>
                  </div>

                  <div class="doc-title">
                    ${escapeHtml(titulo || tipo || "Documento")}
                  </div>

                  ${
                    nota
                      ? `<div class="doc-note muted">${escapeHtml(nota)}</div>`
                      : ""
                  }

                  ${
                    openUrl
                      ? `<div class="doc-url muted">${escapeHtml(
                          openUrl
                        )}</div>`
                      : ""
                  }
                </div>
              </div>

              <div class="doc-actions">
                ${
                  openUrl
                    ? `<a class="icon-btn" href="${openUrl}" target="_blank" rel="noopener" aria-label="Abrir">
                         <svg class="icon"><use href="assets/icons-unified.svg#icon-link"></use></svg>
                       </a>`
                    : ""
                }

                <button class="icon-btn" type="button" data-doc-edit="${
                  d.id
                }" data-doc="${packed}" aria-label="Editar">
                  <svg class="icon"><use href="assets/icons-unified.svg#icon-edit"></use></svg>
                </button>

                <button class="icon-btn" type="button" data-doc-del="${
                  d.id
                }" aria-label="Apagar">
                  <svg class="icon"><use href="assets/icons-unified.svg#icon-trash"></use></svg>
                </button>
              </div>
            </div>

            <!-- Editor inline -->
            <div class="doc-editor" data-editor="${d.id}">
              <div class="doc-editor-grid">
                <label class="muted">Categoria
                  <select data-ed-cat>
                    <option value="Carro">Carro</option>
                    <option value="Seguro">Seguro</option>
                    <option value="Reparacao">Reparação</option>
                    <option value="Outros">Outros</option>
                  </select>
                </label>

                <label class="muted">Tipo
                  <input type="text" data-ed-tipo placeholder="Ex.: DUA, Seguro, Fatura" />
                </label>

                <label class="muted">Nome
                  <input type="text" data-ed-titulo placeholder="Ex.: Apólice 2025" />
                </label>

                <label class="muted">Nota
                  <input type="text" data-ed-nota placeholder="Opcional" />
                </label>

                <label class="muted" style="grid-column:1/-1;">Link
                  <input type="url" data-ed-url placeholder="https://..." inputmode="url" />
                </label>

                <div class="doc-editor-actions" style="grid-column:1/-1;">
                  <button type="button" class="btn btn-secondary" data-ed-cancel>Cancelar</button>
                  <button type="button" class="btn btn-primary" data-ed-save="${
                    d.id
                  }">Guardar</button>
                  <span class="muted" data-ed-msg></span>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    // Um único handler para tudo (abre/editar/apagar)
    list.onclick = async (e) => {
      const card = e.target.closest(".doc-card");

      // Abrir ao clicar no cartão (exceto em botões/links/editor)
      if (card && !e.target.closest("button, a, .doc-editor")) {
        const url = dec(card.getAttribute("data-open-url") || "");
        if (url) window.open(url, "_blank", "noopener");
        return;
      }

      // Apagar
      const delBtn = e.target.closest("[data-doc-del]");
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();

        const docId = delBtn.getAttribute("data-doc-del");
        if (!confirm("Apagar este documento?")) return;

        await deleteDocumentoDoVeiculo(veiculoId, docId);
        await renderDocumentos(veiculoId);
        return;
      }

      // Abrir/fechar editor
      const editBtn = e.target.closest("[data-doc-edit]");
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();

        const docId = editBtn.getAttribute("data-doc-edit");
        const editor = list.querySelector(`[data-editor="${docId}"]`);
        if (!editor) return;

        const data = safeJsonDec(editBtn.getAttribute("data-doc") || "");

        editor.classList.toggle("is-open");

        // preencher campos
        editor.querySelector("[data-ed-cat]").value = normalizeCategoria(
          data.categoria || "Outros"
        );
        editor.querySelector("[data-ed-tipo]").value = data.tipo || "Documento";
        editor.querySelector("[data-ed-titulo]").value = data.titulo || "";
        editor.querySelector("[data-ed-nota]").value = data.nota || "";
        editor.querySelector("[data-ed-url]").value = data.linkExterno || "";

        const msgEl = editor.querySelector("[data-ed-msg]");
        if (msgEl) msgEl.textContent = "";

        return;
      }

      // Cancelar editor
      const cancelBtn = e.target.closest("[data-ed-cancel]");
      if (cancelBtn) {
        e.preventDefault();
        e.stopPropagation();
        const editor = cancelBtn.closest(".doc-editor");
        editor?.classList.remove("is-open");
        return;
      }

      // Guardar edição
      const saveBtn = e.target.closest("[data-ed-save]");
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();

        const docId = saveBtn.getAttribute("data-ed-save");
        const editor = saveBtn.closest(".doc-editor");
        if (!editor) return;

        const msgEl = editor.querySelector("[data-ed-msg]");

        const categoria = normalizeCategoria(
          editor.querySelector("[data-ed-cat]").value
        );
        const tipo =
          (editor.querySelector("[data-ed-tipo]").value || "").trim() ||
          "Documento";
        const titulo = (
          editor.querySelector("[data-ed-titulo]").value || ""
        ).trim();
        const nota = (
          editor.querySelector("[data-ed-nota]").value || ""
        ).trim();
        const linkExterno = (
          editor.querySelector("[data-ed-url]").value || ""
        ).trim();

        if (!linkExterno || !/^https?:\/\/.+/i.test(linkExterno)) {
          if (msgEl) msgEl.textContent = "Link inválido (https://...)";
          return;
        }

        try {
          if (msgEl) msgEl.textContent = "A guardar...";

          await updateDocumentoDoVeiculo(veiculoId, docId, {
            categoria,
            tipo,
            titulo,
            nota,
            linkExterno,
          });

          if (msgEl) msgEl.textContent = "Guardado ✅";
          await renderDocumentos(veiculoId);
        } catch (err) {
          console.error(err);
          if (msgEl) msgEl.textContent = err.message || "Erro ao guardar";
        }
      }
    };
  }

  // =========================
  // REPARAÇÕES
  // =========================
  async function renderReparacoes(veiculoId) {
    const list = document.getElementById("maint-list");
    const empty = document.getElementById("maint-empty");
    if (!list) return;

    const reps = (await getReparacoesDoVeiculo(veiculoId)) || [];
    reps.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    if (!reps.length) {
      empty?.classList.remove("hidden");
      list.innerHTML = "";
      return;
    }

    empty?.classList.add("hidden");
    list.innerHTML = "";

    reps.forEach((r) => {
      const card = document.createElement("article");
      card.className = "record-card";
      card.innerHTML = `
        <div class="record-head">
          <strong>${r.descricao || "Reparação"}</strong>
          <span>€${(r.custo || 0).toFixed(2)}</span>
        </div>

        <div class="record-meta">
          ${r.data || ""} ${r.km ? "• " + r.km + " km" : ""}
        </div>

        <div class="record-row">
          Oficina: ${r.oficina || "—"}
        </div>
        ${
          r.linkDocumento
            ? `<div class="record-row">
                <a href="${r.linkDocumento}" target="_blank" rel="noopener">
                  <svg class="icon">
                    <use href="assets/icons-unified.svg#icon-link"></use>
                  </svg>
                  <span style="margin-left:6px;">Documento</span>
                </a>
              </div>`
            : ""
        }
        <div class="record-actions">
          <button class="icon-btn-sm" data-edit="${r.id}">
            <svg class="icon"><use href="assets/icons-unified.svg#icon-edit"></use></svg>
          </button>

          <button class="icon-btn-sm danger" data-del="${r.id}">
            <svg class="icon"><use href="assets/icons-unified.svg#icon-trash"></use></svg>
          </button>
        </div>
      `;

      list.appendChild(card);
    });

    list.onclick = async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");

  // ✏️ EDITAR
  if (editBtn) {
    const id = editBtn.dataset.edit;
    openReparacaoForEdit(veiculoId, id);
  }

  // 🗑️ ELIMINAR
  if (delBtn) {
    const id = delBtn.dataset.del;
    if (!confirm("Eliminar esta reparação?")) return;

    await deleteReparacaoDoVeiculo(veiculoId, id);
    await renderReparacoes(veiculoId);
  }
};

  }

  function initDocumentos(veiculoId) {
    const catEl = document.getElementById("ext-categoria");
    const tipoEl = document.getElementById("ext-tipo");
    const urlEl = document.getElementById("ext-url");
    const tituloEl = document.getElementById("ext-titulo");
    const notaEl = document.getElementById("ext-nota");

    const btn = document.getElementById("btn-ext-save");
    const msg = document.getElementById("ext-msg");
    const filterEl = document.getElementById("docs-filter");

    if (filterEl) {
      filterEl.addEventListener("change", () => renderDocumentos(veiculoId));
    }

    if (btn) {
      btn.addEventListener("click", async () => {
        try {
          if (msg) msg.textContent = "";

          const categoria = "Carro";
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
    // REPARAÇÕES
    renderReparacoes(veiculoId);
    initReparacoesModal(veiculoId);


// =========================
// ABASTECIMENTOS
// =========================
const abs = await getAbastecimentosDoVeiculo(veiculoId, 500);

if (!abs.length) {
  if (el.fuelEmpty) el.fuelEmpty.classList.remove("hidden");
  if (el.fuelList) el.fuelList.innerHTML = "";
  if (el.kpiTotalReg) el.kpiTotalReg.textContent = "0 registos";
} else {
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
        (Number(abs[i].litros) || 0) *
        (Number(abs[i].precoPorLitro) || 0);
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

  // LISTA
  if (el.fuelList) {
    el.fuelList.innerHTML = "";

    abs.forEach((a) => {
      const litros = Number(a.litros) || 0;
      const ppl = Number(a.precoPorLitro) || 0;
      const custo = (litros * ppl).toFixed(2);
      const kmTxt = `${Number(a.odometro) || 0} km`;
      const posto = a.posto ? escapeHtml(a.posto) : "—";

      const card = document.createElement("article");
      card.className = "record-card record-card--fuel";

      card.innerHTML = `
        <div class="record-head">
          <div class="record-title">
            <span class="record-icon">
              <svg class="icon"><use href="assets/icons-unified.svg#icon-receipt"></use></svg>
            </span>
            <span>Abastecimento</span>
          </div>

          <span class="record-badge record-badge--fuel">
            ${escapeHtml(a.tipoCombustivel || "—")}
          </span>
        </div>

        <div class="record-meta">
          <svg class="icon"><use href="assets/icons-unified.svg#icon-calendar"></use></svg>
          <span>${escapeHtml(a.data || "")}</span>
        </div>

        <div class="record-grid">
          <div class="record-kpi">
            <div class="record-kpi-label">Litros</div>
            <div class="record-kpi-value">${litros.toFixed(1)} L</div>
          </div>

          <div class="record-kpi">
            <div class="record-kpi-label">Total</div>
            <div class="record-kpi-value record-kpi-value--primary">€${custo}</div>
          </div>

          <div class="record-row">
            <div class="record-row-label">Preço/L</div>
            <div class="record-row-value">€${ppl.toFixed(3)}</div>
          </div>

          <div class="record-row">
            <div class="record-row-label">Quilometragem</div>
            <div class="record-row-value">${kmTxt}</div>
          </div>

          <div class="record-row">
            <div class="record-row-label">Posto</div>
            <div class="record-row-value">${posto}</div>
          </div>
        </div>

        <div class="record-actions">
          <button class="icon-btn-sm" type="button" data-edit="${a.id}">
            <svg class="icon"><use href="assets/icons-unified.svg#icon-edit"></use></svg>
          </button>

          <button class="icon-btn-sm danger" type="button" data-del="${a.id}">
            <svg class="icon"><use href="assets/icons-unified.svg#icon-trash"></use></svg>
          </button>
        </div>
      `;

      el.fuelList.appendChild(card);
    });
    el.fuelList.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");

      if (edit) {
        const idAbs = edit.getAttribute("data-edit");
        window.location.href = `abastecimentos.html?id=${encodeURIComponent(
          idAbs
        )}&veiculoId=${encodeURIComponent(veiculoId)}`;
      }

      if (del) {
        const idAbs = del.getAttribute("data-del");
        if (!confirm("Eliminar este abastecimento?")) return;
        await deleteAbastecimento(veiculoId, idAbs);
        location.reload();
      }
    });
  }
}

// ✅ ISTO TEM DE FICAR FORA DO IF/ELSE
initTabs();
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
