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
        b.classList.toggle("is-active", b.dataset.tab === key),
      );
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle("hidden", k !== key);
      });
    }

    tabs.forEach((b) =>
      b.addEventListener("click", () => setActive(b.dataset.tab)),
    );
    setActive("fuel");
  }

  async function renderReparacoes(veiculoId, settings) {
    const list = document.getElementById("maint-list");
    const empty = document.getElementById("maint-empty");
    if (!list) return;

    list.innerHTML = '<div class="spinner"></div>';

    try {
      const reps = await getReparacoesDoVeiculo(veiculoId);
      list.innerHTML = "";

      if (!reps || !reps.length) {
        if (empty) empty.classList.remove("hidden");
        return;
      }
      if (empty) empty.classList.add("hidden");

      reps.forEach((r) => {
        const el = document.createElement("article");
        el.className = "record-card";

        const custoFormatted = r.custo
          ? formatCurrency(r.custo, settings?.moeda || "EUR")
          : "—";
        const dateFormatted = new Date(r.data).toLocaleDateString();

        el.innerHTML = `
                <div class="record-icon-box maint">
                    <svg class="icon"><use href="assets/icons-unified.svg#icon-wrench"></use></svg>
                </div>
                <div class="record-content">
                    <div class="record-header-row">
                        <strong class="record-title">${escapeHtml(
                          r.descricao,
                        )}</strong>
                        <span class="badge badge-outline">${custoFormatted}</span>
                    </div>
                    <div class="record-meta-row">
                        <div class="record-meta-item">
                            ${
                              r.km ? `<span>${formatDistance(r.km)}</span>` : ""
                            }
                            <span>${dateFormatted}</span>
                        </div>
                        ${
                          r.oficina
                            ? `<div class="record-meta-item"><small>${escapeHtml(
                                r.oficina,
                              )}</small></div>`
                            : ""
                        }
                    </div>
                </div>
                <div class="record-actions">
                     ${
                       r.linkDocumento
                         ? `<a href="${r.linkDocumento}" target="_blank" class="icon-btn-sm" title="Ver documento"><svg class="icon"><use href="assets/icons-unified.svg#icon-file"></use></svg></a>`
                         : ""
                     }
                     <button class="icon-btn-sm" data-edit-rep="${
                       r.id
                     }"><svg class="icon"><use href="assets/icons-unified.svg#icon-edit"></use></svg></button>
                     <button class="icon-btn-sm danger" data-del-rep="${
                       r.id
                     }"><svg class="icon"><use href="assets/icons-unified.svg#icon-trash"></use></svg></button>
                </div>
            `;

        el.querySelector("[data-edit-rep]").onclick = () =>
          window.openReparacaoForEdit(veiculoId, r.id);
        el.querySelector("[data-del-rep]").onclick = async () => {
          if (confirm("Apagar registo?")) {
            await deleteReparacaoDoVeiculo(veiculoId, r.id);
            renderReparacoes(veiculoId, settings);
          }
        };

        list.appendChild(el);
      });
    } catch (err) {
      console.error(err);
      list.textContent = "Erro ao carregar reparações.";
    }
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

  function initDocumentosModal(veiculoId) {
    const modal = document.getElementById("doc-modal");
    const openBtn = document.getElementById("btn-add-doc");
    const closeBtn = document.getElementById("doc-close");
    const cancelBtn = document.getElementById("doc-cancel");
    const saveBtn = document.getElementById("doc-save");
    const msg = document.getElementById("doc-msg");

    const tipoEl = document.getElementById("doc-tipo");
    const tituloEl = document.getElementById("doc-titulo");
    const urlEl = document.getElementById("doc-url");
    const notaEl = document.getElementById("doc-nota");

    function open() {
      modal.classList.remove("hidden");
      msg.textContent = "";
    }

    function close() {
      modal.classList.add("hidden");
      tipoEl.value = "Documento";
      tituloEl.value = "";
      urlEl.value = "";
      notaEl.value = "";
    }

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);

    saveBtn?.addEventListener("click", async () => {
      try {
        const url = urlEl.value.trim();
        if (!url || !/^https?:\/\/.+/i.test(url)) {
          msg.textContent = "Coloca um link válido (https://...)";
          return;
        }

        msg.textContent = "A guardar...";

        await addDocumentoLinkExterno(veiculoId, {
          categoria: "Carro",
          tipo: tipoEl.value,
          titulo: tituloEl.value.trim(),
          nota: notaEl.value.trim(),
          url,
        });

        close();
        await renderDocumentos(veiculoId);
      } catch (e) {
        console.error(e);
        msg.textContent = "Erro ao guardar documento.";
      }
    });
  }

  function setupTabsToggle(vehicleId) {
    const btn = document.getElementById("btn-toggle-tabs");
    const container = document.querySelector("main");

    if (!btn || !container) return;

    const storageKey = `l100_vehicle_tabsCollapsed_${vehicleId}`;
    let isCollapsed = localStorage.getItem(storageKey) === "true";

    function update() {
      if (isCollapsed) {
        container.classList.add("tabs-collapsed");
        btn.setAttribute("aria-expanded", "false");
        btn.innerHTML = `<svg class="icon"><use href="assets/icons-unified.svg#icon-chevron-down"></use></svg>`;
      } else {
        container.classList.remove("tabs-collapsed");
        btn.setAttribute("aria-expanded", "true");
        btn.innerHTML = `<svg class="icon"><use href="assets/icons-unified.svg#icon-chevron-up"></use></svg>`;
      }
    }

    // Apply initial state
    update();

    btn.addEventListener("click", () => {
      isCollapsed = !isCollapsed;
      localStorage.setItem(storageKey, String(isCollapsed));
      update();
    });
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
        })[m],
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
  // LOGIC: RESPONSABILIDADES (ALARMES)
  // =========================
  function setupAlertsConfig(v) {
    const btnSave = document.getElementById("btn-save-alert-settings");
    if (!btnSave) return;

    // Elements
    const togSeguro = document.getElementById("toggle-alert-seguro");
    const togIuc = document.getElementById("toggle-alert-iuc");
    const togInsp = document.getElementById("toggle-alert-inspecao");
    const selAnt = document.getElementById("select-alert-antecedencia");

    // Load current values safely
    const prefs = v.alertasAtivos || {};
    if (togSeguro) togSeguro.checked = prefs.seguro !== false;
    if (togIuc) togIuc.checked = prefs.iuc !== false;
    if (togInsp) togInsp.checked = prefs.inspecao !== false;
    if (selAnt) selAnt.value = prefs.antecedencia || "30";

    // Save
    btnSave.addEventListener("click", async (e) => {
      e.preventDefault();
      btnSave.disabled = true;
      btnSave.textContent = "A guardar...";

      const newPrefs = {
        seguro: togSeguro ? togSeguro.checked : true,
        iuc: togIuc ? togIuc.checked : true,
        inspecao: togInsp ? togInsp.checked : true,
        antecedencia: Number(selAnt ? selAnt.value : 30),
      };

      try {
        // Use set with merge: true to avoid overwriting the entire document if updateVeiculo is buggy
        await db
          .collection("veiculos")
          .doc(v.id)
          .set({ alertasAtivos: newPrefs }, { merge: true });
        location.reload();
      } catch (err) {
        console.error(err);
        alert("Erro ao guardar preferências.");
        btnSave.disabled = false;
        btnSave.textContent = "Guardar Preferências";
      }
    });
  }

  function updateResponsibilities(v, settings) {
    // Show FAB Button (Floating Mode)
    const btnFloat = document.getElementById("btn-float-alerts");
    if (btnFloat) btnFloat.classList.remove("hidden");

    // Helpers
    function getDaysDiff(targetDate) {
      if (!targetDate) return null;
      const now = new Date();
      // Reset hours for fair comp
      now.setHours(0, 0, 0, 0);
      const tgt = new Date(
        targetDate.toDate ? targetDate.toDate() : targetDate,
      );
      tgt.setHours(0, 0, 0, 0);

      const diffTime = tgt - now;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    function setStatus(elId, valId, dateObj, labelWhenNull) {
      // IDs: status element (indicator), value element (date), text element (txt-...)
      // The elId passed is usually "card-alert-seguro" or similar in old code, but I need to adapt.
      // Calling code uses: setStatus("resp-seguro", "val-seguro", ...)
      // In my new HTML:
      // Indicator ID = "status-seguro" (was previously the text span)
      // Date ID = "val-seguro"
      // Text ID = "txt-seguro"

      // I need to map the "old" elId (which might be used for scoping) to the specific new IDs.
      // Actually, the caller passes "resp-seguro" which is NOT the ID of the indicator anymore in my HTML calls?
      // Wait, in previous step I saw: setStatus("resp-seguro", "val-seguro", ...)
      // But in HTML I have `id="status-seguro"` for the indicator.
      // Let's assume I hardcode theSuffix since the logic is specific.

      const flavor = valId.replace("val-", ""); // seguro, iuc, inspecao
      const indicatorEl = document.getElementById(`status-${flavor}`);
      const valEl = document.getElementById(`val-${flavor}`);
      const txtEl = document.getElementById(`txt-${flavor}`);

      // Check preferences
      const prefs = v.alertasAtivos || {};
      // Default to true if undefined
      const isEnabled = prefs[flavor] !== false;
      const warnDays = Number(prefs.antecedencia) || 30;

      if (!valEl) return;

      if (!dateObj) {
        valEl.textContent = labelWhenNull || "Não definido";
        if (txtEl) txtEl.textContent = "";
        if (indicatorEl)
          indicatorEl.className = "alert-status-indicator status-neutral";
        return;
      }

      // Formatar data
      const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
      valEl.textContent = date.toLocaleDateString("pt-PT");

      // Dias restantes
      const days = getDaysDiff(dateObj);
      let statusClass = "status-green";
      let statusText = `(${days} dias)`;

      // Logic with preferences
      if (!isEnabled) {
        statusClass = "status-neutral";
        // Keep days visible but neutral
      } else {
        if (days < 0) {
          statusText = `Expirou há ${Math.abs(days)} dias`;
          statusClass = "status-red";
        } else if (days <= warnDays) {
          statusText = `Expira em ${days} dias`;
          statusClass = "status-yellow";
        } else {
          statusText = `Válido (${days} dias)`;
        }
      }

      if (txtEl) txtEl.textContent = statusText;
      if (indicatorEl)
        indicatorEl.className = `alert-status-indicator ${statusClass}`;
    }

    // 1. SEGURO
    setStatus("unused", "val-seguro", v.seguro?.validade, "Sem data");

    // 2. IUC
    setStatus("unused", "val-iuc", v.iuc?.dataLimite, "Sem data");
    // Opcional: mostrar valor do IUC se existir
    if (v.iuc?.valor) {
      const valEl = document.getElementById("val-iuc");
      if (valEl)
        valEl.textContent += ` (${formatCurrency(
          v.iuc.valor,
          settings?.moeda,
        )})`;
    }

    // 3. INSPEÇÃO
    setStatus("unused", "val-inspecao", v.inspecao?.proximaData, "Sem data");
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
            ? `<div class="record-icon-box is-doc" style="background-image:url('${openUrl}'); background-size:cover; background-position:center;"></div>`
            : `<div class="record-icon-box is-doc">
                 <svg class="icon"><use href="assets/icons-unified.svg#icon-file"></use></svg>
               </div>`;

        const badgeKind =
          kind === "pdf" ? "PDF" : kind === "image" ? "IMG" : "LINK";
        const packed = safeJsonEnc({
          categoria,
          tipo,
          titulo,
          nota,
          linkExterno: openUrl,
        });

        return `
          <article class="record-card doc-card clickable-card" data-open-url="${enc(
            openUrl,
          )}" data-doc-id="${d.id}" style="cursor: pointer;">
            
            ${preview}

            <div class="record-content">
              <div class="record-header-row">
                <span class="record-title">${escapeHtml(
                  titulo || tipo || "Documento",
                )}</span>
                <span class="badge badge-secondary">${escapeHtml(
                  categoria,
                )}</span>
                <span class="badge badge-outline">${escapeHtml(
                  badgeKind,
                )}</span>
              </div>
              
              ${
                nota
                  ? `<div class="record-subtitle">${escapeHtml(nota)}</div>`
                  : ""
              }
              ${
                nota
                  ? `<div class="record-subtitle">${escapeHtml(nota)}</div>`
                  : ""
              }
            </div>

            <div class="record-actions">
              <!-- Link button hidden as per request (click card to open) -->

              <button class="icon-btn-sm" type="button" data-doc-edit="${
                d.id
              }" data-doc="${packed}" aria-label="Editar">
                <svg class="icon"><use href="assets/icons-unified.svg#icon-edit"></use></svg>
              </button>

              <button class="icon-btn-sm danger" type="button" data-doc-del="${
                d.id
              }" aria-label="Apagar">
                <svg class="icon"><use href="assets/icons-unified.svg#icon-trash"></use></svg>
              </button>
            </div>
            
            <!-- Editor inline (mantido oculto mas presente) -->
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
                <label class="muted">Tipo <input type="text" data-ed-tipo placeholder="Ex.: DUA..." /></label>
                <label class="muted">Nome <input type="text" data-ed-titulo placeholder="Ex.: Apólice 2025" /></label>
                <label class="muted">Nota <input type="text" data-ed-nota placeholder="Opcional" /></label>
                <label class="muted" style="grid-column:1/-1;">Link <input type="url" data-ed-url placeholder="https://" /></label>
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
          data.categoria || "Outros",
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
          editor.querySelector("[data-ed-cat]").value,
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
  async function renderReparacoes(veiculoId, settings) {
    const list = document.getElementById("maint-list");
    const empty = document.getElementById("maint-empty");
    if (!list) return;

    // Se settings nao vier (chamada inicial s/ await init?), tenta obter
    if (!settings) settings = await getUserSettings();

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
      card.className = "record-card"; // Nova classe unificada
      card.innerHTML = `
        <div class="record-icon-box is-repair">
          <svg class="icon"><use href="assets/icons-unified.svg#icon-wrench"></use></svg>
        </div>

        <div class="record-content">
          <div class="record-header-row">
            <span class="record-title">${escapeHtml(
              r.descricao || "Reparação",
            )}</span>
            <span class="badge badge-secondary">Oficina: ${escapeHtml(
              r.oficina || "—",
            )}</span>
          </div>
          
          <div class="record-meta-row">
            <div class="record-meta-item">
              <svg class="icon"><use href="assets/icons-unified.svg#icon-calendar"></use></svg>
              <span>${escapeHtml(r.data || "—")}</span>
            </div>
            ${
              r.km
                ? `
            <div class="record-meta-item" style="margin-left:8px;">
               <svg class="icon"><use href="assets/icons-unified.svg#icon-car"></use></svg>
               <span>${r.km} km</span>
            </div>`
                : ""
            }
          </div>
          
          <div class="record-grid">
             <div class="record-grid-item">
               <span class="record-grid-label">Custo</span>
               <span class="record-grid-value">${formatCurrency(
                 r.custo || 0,
                 settings?.moeda,
               )}</span>
             </div>
             ${
               r.linkDocumento
                 ? `
             <div class="record-grid-item">
               <span class="record-grid-label">Documento</span>
               <a href="${r.linkDocumento}" target="_blank" class="record-grid-value" style="text-decoration:underline;">Ver anexo</a>
             </div>`
                 : ""
             }
          </div>
        </div>

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

  function initAbastecimentoModal(veiculoId, settings) {
    let editingId = null;

    const modal = document.getElementById("fuel-modal");
    const openBtn = document.getElementById("btn-add-fuel");
    const closeBtn = document.getElementById("fuel-close");
    const cancelBtn = document.getElementById("fuel-cancel");
    const saveBtn = document.getElementById("fuel-save");
    const msg = document.getElementById("fuel-msg");

    const dateEl = document.getElementById("fuel-date");
    const typeEl = document.getElementById("fuel-type");
    const litersEl = document.getElementById("fuel-liters");
    const priceEl = document.getElementById("fuel-price");
    const kmEl = document.getElementById("fuel-km");
    const stationEl = document.getElementById("fuel-station");
    const notesEl = document.getElementById("fuel-notes");
    const fullEl = document.getElementById("fuel-full");

    function open() {
      modal.classList.remove("hidden");
      msg.textContent = "";

      // Pre-fill default fuel if empty/new
      if (
        !editingId &&
        settings?.combustivelPadrao &&
        typeEl &&
        !typeEl.value
      ) {
        typeEl.value = settings.combustivelPadrao;
        // Fallback if value doesn't match option values (e.g. Case sensitivity)
        // Our options are: Gasolina, Gasóleo, GPL, Elétrico
        // If settings has "Gasolina 95", we might need mapping or strict values.
        // Let's assume standard values derived from <select>.
      }
    }

    function close() {
      modal.classList.add("hidden");
      dateEl.value = "";
      litersEl.value = "";
      priceEl.value = "";
      kmEl.value = "";
      stationEl.value = "";
      notesEl.value = "";
      if (fullEl) fullEl.checked = false;
      editingId = null;
    }

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);

    saveBtn?.addEventListener("click", async () => {
      try {
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
          completo: fullEl ? fullEl.checked : false, // NEW
        };

        if (editingId) {
          await updateAbastecimento(veiculoId, editingId, payload);
        } else {
          await createAbastecimento(veiculoId, payload);
        }

        close();
        location.reload(); // simples e seguro
      } catch (e) {
        console.error(e);
        msg.textContent = e.message || "Erro ao guardar.";
      }
    });

    // Expor para edição futura
    window.openAbastecimentoForEdit = async (veiculoId, absId) => {
      const a = await getAbastecimentoDoVeiculoById(veiculoId, absId);
      if (!a) return;

      editingId = absId;

      dateEl.value = a.data || "";
      typeEl.value = a.tipoCombustivel || "Gasolina";
      litersEl.value = a.litros || "";
      priceEl.value = a.precoPorLitro || "";
      kmEl.value = a.odometro || "";
      stationEl.value = a.posto || "";
      notesEl.value = a.observacoes || "";
      if (fullEl) fullEl.checked = !!a.completo;

      modal.classList.remove("hidden");
    };
  }

  async function renderMaintenanceAlerts(veiculoId, v) {
    const container = document.getElementById("alerts-maintenance-list");
    if (!container) return;

    try {
      const planos = await getManutencoesPlaneadas(veiculoId);
      if (!planos || !planos.length) {
        container.innerHTML =
          '<div class="muted" style="font-size:0.9rem; padding: 4px 0;">Tudo em dia.</div>';
        return;
      }

      const currentOdo = v.odometroAtual || v.odometroInicial || 0;

      const alerts = planos
        .map((p) => {
          // USAR A MESMA LÓGICA DA TABELA
          const status = calculateMaintenanceStatus(
            currentOdo,
            p.ultimoKm,
            p.intervaloKm,
            p.ultimaData,
            p.intervaloMeses,
          );

          let urgency = 999999;
          let badgeClass = "badge-success";
          let label = "OK";

          // Calcular urgência para ordenação (menor diffKm ou menor diffDays)
          // Vamos priorizar Km para sorting se existir, senão dias.
          if (status.nextKm) {
            urgency = status.diffKm;
          } else if (status.nextDate) {
            urgency = status.diffDays * 100; // Peso para misturar?
          }

          if (status.status === "delayed") {
            badgeClass = "badge-danger";
            label = "ATRASADA";
          } else if (status.status === "warning") {
            badgeClass = "badge-warning";
            label = "PRÓXIMA";
          }

          // Override label com detalhe se possível
          if (status.status !== "ok") {
            if (status.diffKm < 0)
              label = `Passou ${Math.abs(status.diffKm).toFixed(1)} km`;
            else if (status.diffKm < 2000 && status.nextKm) {
              console.log("DEBUG: DiffKm formatted:", status.diffKm.toFixed(1));
              label = `Faltam aprox. ${status.diffKm.toFixed(1)} km`;
            } else if (status.diffDays < 0) label = `Passou data`;
            else if (status.diffDays < 30 && status.nextDate)
              label = `Faltam ${status.diffDays} dias`;
          }

          return { p, urgency, status: status.status, label, badgeClass };
        })
        .filter((x) => x.status !== "ok")
        .sort((a, b) => a.urgency - b.urgency)
        .slice(0, 3);

      if (alerts.length === 0) {
        container.innerHTML =
          '<div class="muted" style="font-size:0.9rem; padding: 4px 0;">Tudo em dia.</div>';
        return;
      }

      container.innerHTML = alerts
        .map(
          (item) => `
              <div class="alert-item" style="cursor:pointer;" onclick="openPlanModalForEdit('${veiculoId}', '${safeJsonEnc(item.p)}')">
                 <div class="alert-status-indicator ${item.status === "delayed" ? "bg-danger" : "bg-warning"}" 
                      style="background-color: var(--color-${item.status === "delayed" ? "danger" : "warning"});">
                 </div>
                 <div class="alert-info">
                    <span class="alert-label">${escapeHtml(item.p.titulo)}</span>
                    <span class="alert-value">
                        <span class="badge ${item.badgeClass}" style="font-size:0.75rem; padding: 2px 6px;">${item.label}</span>
                    </span>
                 </div>
              </div>
          `,
        )
        .join("");
    } catch (err) {
      console.error("Erro renderMaintenanceAlerts", err);
      container.innerHTML = '<div class="muted">Erro ao carregar</div>';
    }
  }

  // =========================
  // MANUTENÇÕES PLANEADAS
  // =========================
  async function renderPlanos(veiculoId, veiculo, settings) {
    const container = document.getElementById("plan-list");
    const empty = document.getElementById("plan-empty");
    if (!container) return;

    const planos = await getManutencoesPlaneadas(veiculoId);

    if (!planos.length) {
      container.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    container.innerHTML = planos
      .map((p) => {
        // Calcular status
        const status = calculateMaintenanceStatus(
          veiculo.odometroAtual || veiculo.odometroInicial || 0,
          p.ultimoKm,
          p.intervaloKm,
          p.ultimaData,
          p.intervaloMeses,
        );

        let badgeClass = "badge-secondary"; // ok
        let statusLabel = "OK";

        if (status.status === "delayed") {
          badgeClass = "badge-danger";
          statusLabel = "ATRASADA";
        } else if (status.status === "warning") {
          badgeClass = "badge-warning";
          statusLabel = "PRÓXIMA";
        }

        const encoded = safeJsonEnc(p);

        return `
            <article class="record-card clickable-card" style="cursor:pointer;" onclick="openPlanModalForEdit('${veiculoId}', '${encoded}')">
                <div class="record-content">
                    <div class="record-header-row">
                        <span class="record-title">${escapeHtml(p.tipo)}</span>
                        <span class="badge ${badgeClass}">${statusLabel}</span>
                    </div>
                    
                    <div class="record-meta-row">
                        ${
                          status.nextKm
                            ? `
                        <div class="record-meta-item">
                            <span>Próx:</span>
                            <span class="record-value ${
                              status.status !== "ok" ? "is-primary" : ""
                            }">${status.nextKm} ${
                              settings?.unidadeDistancia || "km"
                            }</span>
                            <span class="muted">(${
                              status.diffKm > 0 ? "falta" : "passou"
                            } ${Math.abs(status.diffKm).toFixed(1)})</span>
                        </div>`
                            : ""
                        }
                        
                        ${
                          status.nextDate
                            ? `
                        <div class="record-meta-item">
                            <span>Data:</span>
                            <span class="record-value">${status.nextDate.toLocaleDateString()}</span>
                        </div>`
                            : ""
                        }
                    </div>
                </div>
            </article>
          `;
      })
      .join("");
  }

  window.openPlanModalForEdit = (vid, encoded) => {
    const data = safeJsonDec(encoded);
    initPlanModal(vid, data);
  };

  function initPlanModal(veiculoId, editData = null) {
    const modal = document.getElementById("plan-modal");
    if (!modal) return;

    const closeBtn = document.getElementById("plan-close");
    const cancelBtn = document.getElementById("plan-cancel");
    const saveBtn = document.getElementById("plan-save");
    const delBtn = document.getElementById("plan-delete");
    const msg = document.getElementById("plan-msg");

    // Inputs
    const typeEl = document.getElementById("plan-type");
    const kmIntEl = document.getElementById("plan-int-km");
    const monthIntEl = document.getElementById("plan-int-months");
    const lastKmEl = document.getElementById("plan-last-km");
    const lastDateEl = document.getElementById("plan-last-date");

    const openBtn = document.getElementById("btn-add-plan"); // Header button

    function open() {
      modal.classList.remove("hidden");
      msg.textContent = "";

      if (editData) {
        typeEl.value = editData.tipo || "";
        kmIntEl.value = editData.intervaloKm || "";
        monthIntEl.value = editData.intervaloMeses || "";
        lastKmEl.value = editData.ultimoKm || "";
        lastDateEl.value = editData.ultimaData || "";
        delBtn.classList.remove("hidden");
      } else {
        // New
        typeEl.value = "";
        kmIntEl.value = "";
        monthIntEl.value = "";
        lastKmEl.value = ""; // Could pre-fill with current odo? user might want that.
        lastDateEl.value = new Date().toISOString().slice(0, 10);
        delBtn.classList.add("hidden");
      }
    }

    function close() {
      modal.classList.add("hidden");
    }

    // Handlers (remove old to prevent dupes if called multiple times? logic here is simple init)
    // A better pattern is to separate init from open, but I'll stick to simple binding.
    if (openBtn)
      openBtn.onclick = () => {
        editData = null;
        open();
      };
    if (editData) open(); // If called with data, open immediately

    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    saveBtn.onclick = async () => {
      try {
        if (!typeEl.value) {
          msg.textContent = "Nome do serviço obrigatório.";
          return;
        }
        const payload = {
          tipo: typeEl.value,
          intervaloKm: Number(kmIntEl.value) || 0,
          intervaloMeses: Number(monthIntEl.value) || 0,
          ultimoKm: Number(lastKmEl.value) || 0,
          ultimaData: lastDateEl.value || "",
        };

        msg.textContent = "A guardar...";
        if (editData && editData.id) {
          await updateManutencaoPlaneada(veiculoId, editData.id, payload);
        } else {
          await addManutencaoPlaneada(veiculoId, payload);
        }
        location.reload();
      } catch (e) {
        msg.textContent = "Erro: " + e.message;
      }
    };

    delBtn.onclick = async () => {
      if (!editData) return;
      if (!confirm("Apagar este plano?")) return;
      try {
        await deleteManutencaoPlaneada(veiculoId, editData.id);
        location.reload();
      } catch (e) {
        msg.textContent = e.message;
      }
    };
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

    // Obter settings do utilizador
    const settings = await getUserSettings();

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

    el.fuel.textContent = v.combustivelPadrao || "—";

    // 🔹 ODÓMETRO
    const currentOdo = v.odometroAtual || v.odometroInicial || 0;

    // 1. Set Display Value
    const odoValEl = document.getElementById("vehicle-odometer-val");
    if (odoValEl) {
      odoValEl.textContent = currentOdo.toLocaleString();
    }

    // 2. Bind Edit Events
    const btnEditOdo = document.getElementById("btn-edit-odo-hero");
    const wrapperOdo = document.getElementById("vehicle-odometer-wrapper");
    const formOdo = document.getElementById("vehicle-odometer-edit-form");
    const inputOdo = document.getElementById("odo-input-hero");
    const btnSaveOdo = document.getElementById("btn-save-odo-hero");
    const btnCancelOdo = document.getElementById("btn-cancel-odo-hero");

    if (btnEditOdo && wrapperOdo && formOdo && inputOdo) {
      // Open
      btnEditOdo.onclick = () => {
        wrapperOdo.classList.add("hidden");
        formOdo.classList.remove("hidden");
        inputOdo.value = currentOdo;
        inputOdo.focus();
      };

      // Cancel
      btnCancelOdo.onclick = () => {
        formOdo.classList.add("hidden");
        wrapperOdo.classList.remove("hidden");
      };

      // Save
      btnSaveOdo.onclick = async () => {
        const newVal = Number(inputOdo.value);
        const initial = v.odometroInicial || 0;

        if (!newVal || newVal < 0) {
          alert("Valor inválido.");
          return;
        }

        if (newVal < initial) {
          alert(
            `Erro: O odómetro não pode ser inferior ao valor inicial (${initial.toLocaleString()} km).`,
          );
          return;
        }

        // Allow updates at any time, but warn/block regression if critical?
        // User requested "at any moment, must be editable".
        // I'll keep the regression check for safety but basic.
        if (newVal < currentOdo) {
          if (
            !confirm(
              `O novo valor (${newVal}) é inferior ao atual (${currentOdo}). Tem a certeza?`,
            )
          ) {
            return;
          }
        }

        btnSaveOdo.disabled = true;
        try {
          await updateVeiculo(veiculoId, { odometroAtual: newVal });
          location.reload();
        } catch (err) {
          console.error(err);
          alert("Erro ao guardar odómetro.");
          btnSaveOdo.disabled = false;
        }
      };
    }

    // DOCUMENTOS
    initDocumentosModal(veiculoId);
    await renderDocumentos(veiculoId);

    // REPARAÇÕES
    renderReparacoes(veiculoId, settings);
    initReparacoesModal(veiculoId);
    initAbastecimentoModal(veiculoId, settings);

    // MANUTENÇÕES PLANEADAS (Passando Current Odo explicitamente se necessário, ou v)
    // Vamos garantir que v tem a propriedade que o renderPlanos espera
    v.odometroAtual = currentOdo;
    renderPlanos(veiculoId, v, settings);
    renderMaintenanceAlerts(veiculoId, v); // <-- NEW: Render alerts summary
    initPlanModal(veiculoId);

    // RESPONSABILIDADES (ALARMES)
    setupAlertsConfig(v);
    updateResponsibilities(v, settings);

    // Listener para o botão Editar Datas
    const btnEditDates = document.getElementById("btn-edit-dates");
    if (btnEditDates) {
      btnEditDates.onclick = () => {
        // Como o modal de edição completo está na veiculos.html,
        // podemos redirecionar para lá com um param para abrir o modal,
        // ou simplesmente informar. Vamos tentar ser prestáveis:
        // "Por favor edite os dados na lista de veículos."
        alert(
          "Para editar estas datas, utilize o botão 'Editar' no topo da lista de veículos.",
        );
        window.location.href = "veiculos.html";
      };
    }

    // NEW: Quick Plan Button Listener
    const btnQuickPlan = document.getElementById("btn-add-plan-quick");
    if (btnQuickPlan) {
      btnQuickPlan.onclick = () => {
        const tabBtn = document.getElementById("btn-add-plan");
        if (tabBtn) tabBtn.click();
      };
    }

    // NEW: Torque Integration
    setupTorqueIntegration(veiculoId);

    // NEW: Floating Metrics Setup
    setupFloatingMetrics(veiculoId);
    // Calc metrics (async but don't block)
    updateFloatingMetrics(veiculoId, v, settings);

    // =========================
    // FLOATING METRICS LOGIC
    // =========================
    function setupFloatingMetrics(veiculoId) {
      const pairs = [
        {
          btnId: "btn-float-toggle",
          cardId: "floating-metrics-card",
          closeId: "btn-close-float",
        },
        {
          btnId: "btn-float-analytics",
          cardId: "section-analytics",
          closeId: "btn-close-analytics",
        },
        {
          btnId: "btn-float-alerts",
          cardId: "section-alerts",
          closeId: "btn-close-alerts",
        },
        {
          btnId: "btn-float-obd",
          cardId: "section-obd",
          closeId: "btn-close-obd",
        },
      ];

      pairs.forEach((p) => {
        const btn = document.getElementById(p.btnId);
        const card = document.getElementById(p.cardId);
        const close = document.getElementById(p.closeId);

        if (!btn || !card) return;

        btn.addEventListener("click", () => {
          // Close others? Optional. User "mostrarem/ocultarem" might imply toggle independent or exclusive.
          // Usually exclusive is cleaner for popups on same side.
          pairs.forEach((other) => {
            if (other !== p) {
              const c = document.getElementById(other.cardId);
              if (c) c.classList.add("hidden");
            }
          });
          card.classList.toggle("hidden");
        });

        if (close) {
          close.addEventListener("click", () => {
            card.classList.add("hidden");
          });
        }
      });
    }

    async function updateFloatingMetrics(veiculoId, v, settings) {
      const elCostKm = document.getElementById("float-cost-km");
      const elTotalCost = document.getElementById("float-total-cost");
      const elTotalKm = document.getElementById("float-total-km");

      // Elements for the Analytics Card (Popup)
      const elAnL100 = document.getElementById("an-l100");
      const elAnRange = document.getElementById("an-range-km");
      const elAnRangeDays = document.getElementById("an-range-days");
      const elAnConf = document.getElementById("an-confidence");

      try {
        // 1. Fetch all data (parallel for speed)
        // We also fetch the latest OBD reading for fallback!
        const [abs, reps, obdSnap] = await Promise.all([
          getAbastecimentosDoVeiculo(veiculoId, 1000),
          getReparacoesDoVeiculo(veiculoId),
          db
            .collection("veiculos")
            .doc(veiculoId)
            .collection("leiturasObd")
            .orderBy("timestamp", "desc")
            .limit(1)
            .get(),
        ]);

        // 2. Centralized Calculation (Cost & Consumption)
        const costMetrics = window.Analytics.calculateCostMetrics(v, abs, reps);
        const fuelMetrics = window.Analytics.generateAnalytics(v, abs);

        // 3. Update Floating Summary (Cost)
        if (elTotalCost)
          elTotalCost.textContent = formatCurrency(
            costMetrics.totalSpent,
            settings?.moeda || "EUR",
          );
        if (elTotalKm)
          elTotalKm.textContent = formatDistance(costMetrics.totalDist);
        if (elCostKm) {
          if (costMetrics.costPerKm > 0) {
            elCostKm.textContent = `${costMetrics.costPerKm.toFixed(3)} ${getCurrencySymbol(settings?.moeda || "EUR")}/${settings?.unidadeDistancia || "km"}`;
          } else {
            elCostKm.textContent = "—";
          }
        }

        // 4. Update Analytics Card (Consumption & Range)
        let l100 = fuelMetrics.consumoMedioL100;
        let range = fuelMetrics.kmAteReservaEstimado;
        let days = fuelMetrics.diasAteReservaEstimado;
        let source = "manual";

        // EXPLICIT OBD OVERRIDE (From Torque L100 Long Term)
        if (v.consumoMedioObd && v.consumoMedioObd > 0) {
          l100 = v.consumoMedioObd;
          source = "obd_stored";

          // Recalculate Range based on this new consumption
          const capacity = v.capacidadeDepositoLitros || 0;
          // We need current fuel level.
          // If we have manual logs, fuelMetrics has estimates.
          // However, if we rely on OBD L100, we should probably stick to OBD Fuel Level if available?
          // Let's stick to the hybrid approach:
          // If we have a fuel level from OBD (in v.nivelCombustivel), use it.

          const fuelLevelPct = v.nivelCombustivel || 0; // Stored from Torque
          if (capacity > 0 && fuelLevelPct > 0) {
            const litersLeft = (fuelLevelPct / 100) * capacity;
            range = (litersLeft / l100) * 100;
          }
        }

        // Helper simple para fuzzy match (igual ao tripDetector)
        const findKey = (obj, ...parts) => {
          const keys = Object.keys(obj || {});
          for (const k of keys) {
            const lower = k.toLowerCase();
            if (parts.every((p) => lower.includes(p.toLowerCase())))
              return obj[k];
          }
          return null;
        };

        // FALLBACK: If standard analytics failed AND no stored OBD, try Live OBD Snap
        if (
          (!l100 || l100 === 0) &&
          !obdSnap.empty &&
          source !== "obd_stored"
        ) {
          const obdData = obdSnap.docs[0].data();
          const parsed = obdData.parsed || {};

          console.log("OBD Keys Available:", Object.keys(parsed));

          // Try "Long Term Average" or "Trip Average" using fuzzy search
          // Prioridade: Média da Viagem > Média Longo Prazo
          const tripAvg = findKey(parsed, "Trip average", "l/100");
          const longTermAvg = findKey(parsed, "Long Term Average", "l/100");

          const obdL100 = Number(tripAvg || longTermAvg || 0);

          if (obdL100 > 0) {
            l100 = obdL100;
            source = "obd";

            // Estimate Range using OBD consumption + Fuel Level
            // Fuel Level também pode vir com nomes estranhos
            const fuelLevelVal =
              findKey(parsed, "Fuel Level", "%") ||
              findKey(parsed, "Fuel", "%");
            const fuelLevel = Number(fuelLevelVal || 0); // %

            const capacity = v.capacidadeDepositoLitros || 0;
            if (capacity > 0 && fuelLevel > 0) {
              const litersLeft = (fuelLevel / 100) * capacity;
              range = (litersLeft / l100) * 100;
            }
          }
        }

        if (elAnL100) elAnL100.textContent = l100 ? l100.toFixed(1) : "--";
        if (elAnRange)
          elAnRange.textContent = range
            ? Math.round(range).toLocaleString()
            : "--";
        if (elAnRangeDays)
          elAnRangeDays.textContent = days
            ? `${days} dias`
            : source === "obd"
              ? "Est. via OBD"
              : "--";

        if (elAnConf) {
          if (source === "obd") {
            elAnConf.textContent = "Fonte: Torque Pro (OBD)";
            elAnConf.className = "status-blue";
          } else if (l100) {
            elAnConf.textContent = `Confiança: ${fuelMetrics.consumoConfianca || "N/A"}`;
            elAnConf.className = "status-neutral";
          } else {
            elAnConf.textContent = "Sem dados suficientes";
          }
        }

        // Unhide Analytics Button if we have something to show
        const btnAnalytics = document.getElementById("btn-float-analytics");
        if (btnAnalytics) {
          if (costMetrics.totalSpent > 0 || l100 > 0 || source === "obd") {
            btnAnalytics.classList.remove("hidden");
          }
        }

        // Force OBD Button Visibility (Users want to see it even without data)
        const btnObd = document.getElementById("btn-float-obd");
        if (btnObd) btnObd.classList.remove("hidden");
      } catch (e) {
        console.error("Error calculating floating metrics", e);
      }
    }

    function setupTorqueIntegration(veiculoId) {
      const btnObd = document.getElementById("btn-float-obd");
      const modalObd = document.getElementById("obd-modal");
      const btnCloseObd = document.getElementById("btn-close-obd");

      // Modal & Tab Logic
      if (!btnObd || !modalObd) return;

      btnObd.addEventListener("click", () => {
        modalObd.classList.remove("hidden");
        loadLastTrip(veiculoId); // RESTORED
      });

      if (btnCloseObd) {
        btnCloseObd.addEventListener("click", () =>
          modalObd.classList.add("hidden"),
        );
        modalObd.addEventListener("click", (e) => {
          if (e.target === modalObd) modalObd.classList.add("hidden");
        });
      }

      // Tabs
      const tabBtns = modalObd.querySelectorAll(".tab-btn");
      const tabPanels = modalObd.querySelectorAll(".tab-panel");

      tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.tab;

          // Update UI
          tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
          tabPanels.forEach((p) =>
            p.classList.toggle("hidden", p.id !== `tab-${target}`),
          );

          // Load Data
          if (target === "historico") loadTripsHistory(veiculoId);
          if (target === "ultima") loadLastTrip(veiculoId); // RESTORED
        });
      });

      // --- BACKFILL TRIGGER ---
      const btnScan = document.getElementById("btn-scan-trip");
      if (btnScan) {
        btnScan.onclick = async () => {
          if (
            !confirm(
              "Isto vai analisar todo o histórico antigo para encontrar viagens. Continuar?",
            )
          )
            return;

          btnScan.disabled = true;
          const originalText = btnScan.textContent;
          btnScan.textContent = "A processar...";

          try {
            const res = await fetch(
              `https://us-central1-omeucarro-d3889.cloudfunctions.net/backfillTrips?vehicleId=${veiculoId}`,
            );
            if (!res.ok) throw new Error("Falha no pedido");

            const data = await res.json();
            if (data.success) {
              alert(`Sucesso! ${data.tripsCreated} viagens recuperadas.`);
              loadLastTrip(veiculoId); // Reload UI
            } else {
              alert("Não foram encontradas novas viagens.");
            }
          } catch (e) {
            console.error(e);
            alert("Erro ao processar histórico.");
          } finally {
            btnScan.disabled = false;
            btnScan.textContent = originalText;
          }
        };
      }

      // --- DATA LOADING ---

      async function loadLastTrip(vid) {
        const empty = document.getElementById("last-trip-empty");
        const content = document.getElementById("last-trip-content");

        try {
          const snap = await db
            .collection("veiculos")
            .doc(vid)
            .collection("viagens")
            .orderBy("dataFim", "desc")
            .limit(1)
            .get();

          if (snap.empty) {
            if (empty) empty.classList.remove("hidden");
            if (content) content.classList.add("hidden");
            return;
          }

          if (empty) empty.classList.add("hidden");
          if (content) content.classList.remove("hidden");

          const trip = snap.docs[0].data();
          renderTripDetails(trip);
        } catch (e) {
          console.error("Error loading last trip:", e);
        }
      }

      function renderTripDetails(trip) {
        // Dates
        const end = trip.dataFim?.toDate ? trip.dataFim.toDate() : new Date();
        const elDate = document.getElementById("last-trip-date");
        const elTime = document.getElementById("last-trip-time");

        if (elDate) elDate.textContent = end.toLocaleDateString("pt-PT");
        if (elTime)
          elTime.textContent = end.toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          });

        // Metrics
        const elDist = document.getElementById("last-trip-dist");
        const elL100 = document.getElementById("last-trip-l100");
        const elSpeed = document.getElementById("last-trip-speed");
        const elDur = document.getElementById("last-trip-duration");

        if (elDist) elDist.textContent = trip.distancia?.toFixed(1) || "--";
        if (elL100) elL100.textContent = trip.consumoMedio?.toFixed(1) || "--";
        if (elSpeed)
          elSpeed.textContent = Math.round(trip.velocidadeMedia || 0) || "--";
        if (elDur)
          elDur.textContent = trip.duracao
            ? `${Math.round(trip.duracao / 60)} min`
            : "--";

        // Details
        const elRpm = document.getElementById("last-trip-rpm");
        const elTemp = document.getElementById("last-trip-temp");

        if (elRpm)
          elRpm.textContent = (trip.metricas?.rpmMedio || "--") + " rpm";
        if (elTemp)
          elTemp.textContent = (trip.metricas?.temperaturaMax || "--") + " °C";

        // Cost
        const cost = trip.custoEstimado || 0;
        const elCost = document.getElementById("last-trip-cost");
        if (elCost)
          elCost.textContent = cost > 0 ? "€" + cost.toFixed(2) : "--";
      }

      async function loadTripsHistory(vid) {
        const list = document.getElementById("trips-list");
        if (!list) return;

        list.innerHTML = '<div class="spinner"></div>';

        try {
          const snap = await db
            .collection("veiculos")
            .doc(vid)
            .collection("viagens")
            .orderBy("dataFim", "desc")
            .limit(20)
            .get();

          const empty = document.getElementById("trips-empty");

          if (snap.empty) {
            list.innerHTML = "";
            if (empty) empty.classList.remove("hidden");
            return;
          }

          if (empty) empty.classList.add("hidden");
          list.innerHTML = "";

          snap.forEach((doc) => {
            list.appendChild(createTripCard(doc.data()));
          });
        } catch (e) {
          console.error("Error loading history:", e);
          list.innerHTML =
            '<div class="muted">Erro ao carregar histórico.</div>';
        }
      }

      function createTripCard(trip) {
        const el = document.createElement("article");
        el.className = "trip-card"; // Need styling for this!
        // Styling injection for quick fix:
        el.style.cssText =
          "background: var(--bg-hover); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;";

        const date = trip.dataFim?.toDate ? trip.dataFim.toDate() : new Date();

        el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap: 8px; align-items:center;">
                        <div class="status-indicator-dot status-neutral"></div>
                        <strong>${date.toLocaleDateString()}</strong>
                        <span class="muted" style="font-size:0.8rem;">${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <span class="badge badge-outline">${Math.round(trip.duracao || 0)} min</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 4px; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 4px;">
                    <div style="text-align:center;">
                        <div style="font-weight:700;">${trip.distancia?.toFixed(1) || "--"}</div>
                        <div class="muted" style="font-size:0.7rem;">km</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-weight:700;">${trip.consumoMedio?.toFixed(1) || "--"}</div>
                        <div class="muted" style="font-size:0.7rem;">L/100</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-weight:700;">${Math.round(trip.velocidadeMedia || 0)}</div>
                        <div class="muted" style="font-size:0.7rem;">km/h</div>
                    </div>
                </div>
             `;
        return el;
      }

      // --- REALTIME LISTENER (LIVE TAB) ---
      const liveElements = {
        rpm: document.getElementById("obd-rpm"),
        speed: document.getElementById("obd-speed"),
        coolant: document.getElementById("obd-coolant"),
        load: document.getElementById("obd-load"),
        voltage: document.getElementById("obd-voltage"),
        maf: document.getElementById("obd-maf"),
        torque: document.getElementById("obd-torque"),
        hp: document.getElementById("obd-hp"),
        lastUpdate: document.getElementById("obd-last-update"),
        statusCoolant: document.getElementById("status-coolant"),
      };

      db.collection("veiculos")
        .doc(veiculoId)
        .collection("leiturasObd")
        .orderBy("timestamp", "desc")
        .limit(1)
        .onSnapshot(
          (snapshot) => {
            if (snapshot.empty) {
              btnObd.classList.add("hidden");
              return;
            }
            btnObd.classList.remove("hidden");

            const data = snapshot.docs[0].data();
            const reading = data.parsed || {};

            const findKey = (obj, ...parts) => {
              const keys = Object.keys(obj);
              for (const k of keys) {
                const lower = k.toLowerCase();
                if (parts.every((p) => lower.includes(p.toLowerCase())))
                  return obj[k];
              }
              return null;
            };

            // Update DOM
            const rpm = findKey(reading, "Engine RPM") || reading.rpm;
            if (liveElements.rpm)
              liveElements.rpm.textContent = rpm ? Math.round(rpm) : "--";

            const speed = findKey(reading, "Speed (OBD)") || reading.speed;
            if (liveElements.speed)
              liveElements.speed.textContent = speed ? Math.round(speed) : "--";

            const temp = findKey(reading, "Coolant") || reading.coolant;
            if (liveElements.coolant)
              liveElements.coolant.textContent = temp ? Math.round(temp) : "--";
            if (temp && liveElements.statusCoolant) {
              if (temp > 105)
                liveElements.statusCoolant.className =
                  "alert-status-indicator status-red";
              else if (temp > 90)
                liveElements.statusCoolant.className =
                  "alert-status-indicator status-yellow";
              else
                liveElements.statusCoolant.className =
                  "alert-status-indicator status-green";
            }

            const load = findKey(reading, "Engine Load") || reading.engineLoad;
            if (liveElements.load)
              liveElements.load.textContent = load ? Math.round(load) : "--";

            const volts =
              findKey(reading, "Voltage") ||
              findKey(reading, "Volts") ||
              reading.voltage;
            if (liveElements.voltage)
              liveElements.voltage.textContent = volts
                ? Number(volts).toFixed(1)
                : "--";

            const maf = findKey(reading, "Mass Air Flow") || reading.maf;
            if (liveElements.maf)
              liveElements.maf.textContent = maf
                ? Number(maf).toFixed(1)
                : "--";

            const torque = findKey(reading, "Torque") || reading.torqueNm;
            if (liveElements.torque)
              liveElements.torque.textContent = torque
                ? Math.round(torque)
                : "--";

            const hp = findKey(reading, "Horsepower") || reading.hpWheels;
            if (liveElements.hp)
              liveElements.hp.textContent = hp ? Math.round(hp) : "--";

            // Timestamp
            if (liveElements.lastUpdate && data.timestamp) {
              const d = new Date(Number(data.timestamp));
              const now = new Date();
              const isToday = d.toDateString() === now.toDateString();
              liveElements.lastUpdate.textContent = isToday
                ? d.toLocaleTimeString()
                : d.toLocaleString();
            }
          },
          (err) => console.error(err),
        );
    }

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

      if (el.kpiGasto)
        el.kpiGasto.textContent = formatCurrency(totalGasto, settings.moeda);
      if (el.kpiLitros) el.kpiLitros.textContent = formatVolume(totalLitros);
      if (el.kpiTotalReg) el.kpiTotalReg.textContent = `${abs.length} registos`;

      // consumo médio e custo/km (Fuel Only)
      const consResult = window.Analytics.calculateConsumption(abs);
      const fuelMetrics = window.Analytics.calculateCostMetrics(v, abs, []);

      if (el.kpiConsumo) {
        el.kpiConsumo.textContent = consResult.averageL100
          ? formatConsumption(consResult.averageL100, settings.unidadeConsumo)
          : "—";
      }

      if (el.kpiCustoKm) {
        el.kpiCustoKm.textContent =
          fuelMetrics.costPerKm > 0
            ? fuelMetrics.costPerKm.toFixed(3) +
              ` ${getCurrencySymbol(settings.moeda)}/${
                settings.unidadeDistancia || "km"
              }`
            : "—";
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
          card.className = "record-card"; // Unified class

          // Icon indicator for FULL TANK
          const fullTankIcon = a.completo
            ? `<span title="Depósito Cheio" style="color:var(--color-success); margin-left:6px;"><svg class="icon" style="width:14px;height:14px;"><use href="assets/icons-unified.svg#icon-droplet"></use></svg></span>`
            : "";

          card.innerHTML = `
        <div class="record-icon-box is-fuel">
          <svg class="icon"><use href="assets/icons-unified.svg#icon-fuel"></use></svg>
        </div>

        <div class="record-content">
          <div class="record-header-row">
            <span class="record-title">Abastecimento ${fullTankIcon}</span>
            <span class="badge badge-secondary">${escapeHtml(
              a.tipoCombustivel || "—",
            )}</span>
          </div>

          <div class="record-meta-row">
            <div class="record-meta-item">
               <svg class="icon"><use href="assets/icons-unified.svg#icon-calendar"></use></svg>
               <span>${escapeHtml(a.data || "")}</span>
            </div>
          </div>

          <div class="record-grid">
            <div class="record-grid-item">
              <span class="record-grid-label">Total</span>
              <span class="record-grid-value is-primary">${formatCurrency(
                custo,
                settings.moeda,
              )}</span>
            </div>
            
            <div class="record-grid-item">
              <span class="record-grid-label">Litros</span>
              <span class="record-grid-value">${formatVolume(litros)}</span>
            </div>
            
            <div class="record-grid-item">
              <span class="record-grid-label">Preço/L</span>
              <span class="record-grid-value">${formatCurrency(
                ppl,
                settings.moeda,
              )}</span>
            </div>

            <div class="record-grid-item">
              <span class="record-grid-label">Km</span>
              <span class="record-grid-value">${kmTxt}</span>
            </div>

            <div class="record-grid-item" style="grid-column: 1 / -1;">
              <span class="record-grid-label">Posto</span>
              <span class="record-grid-value" style="font-weight:400;">${posto}</span>
            </div>
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

        // Event Delegation (mantido igual)
        el.fuelList.addEventListener("click", async (e) => {
          const edit = e.target.closest("[data-edit]");
          const del = e.target.closest("[data-del]");

          if (edit) {
            const idAbs = edit.getAttribute("data-edit");
            openAbastecimentoForEdit(veiculoId, idAbs);
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

    async function renderAnalyticsCard(veiculoId) {
      const section = document.getElementById("section-analytics");
      if (!section) return;

      try {
        // 1. Fetch Data
        const analytics = await getVehicleAnalytics(veiculoId);

        // If absolutely no analytics yet, we can hide or show empty state.
        // But we want to show "A aprender..." if exists but empty.
        // If null, it means never calculated.

        // Show FAB Button (Floating Mode)
        const btnFloat = document.getElementById("btn-float-analytics");
        if (btnFloat) btnFloat.classList.remove("hidden");

        // section.classList.remove("hidden"); // REMOVED: Keep card hidden until toggled

        // Elements
        const elL100 = document.getElementById("an-l100");
        const elConf = document.getElementById("an-confidence");
        const elRangeKm = document.getElementById("an-range-km");
        const elRangeDays = document.getElementById("an-range-days");
        const elBadge = document.getElementById("analytics-badge");
        const elWarnCap = document.getElementById("an-warning-capacity");
        const elAlertBox = document.getElementById("an-alert-box");

        if (!analytics) {
          // Initial state
          return;
        }

        // Consumption
        if (analytics.consumoMedioL100) {
          elL100.textContent = analytics.consumoMedioL100.toFixed(1);

          // Confidence styling
          const confMap = {
            alta: { text: "Confiança Alta", class: "status-green" },
            media: { text: "Confiança Média", class: "status-yellow" },
            baixa: { text: "Estimat. Baixa", class: "status-neutral" },
          };
          const confData =
            confMap[analytics.consumoConfianca] || confMap["baixa"];
          elConf.className = confData.class;
          elConf.innerHTML = `<span>${confData.text}</span>`;

          elBadge.textContent = "Ativo";
          elBadge.className = "badge badge-success badge-outline";
        } else {
          elL100.textContent = "--";
          elConf.textContent = "A recolher dados...";
          elBadge.textContent = "A aprender...";
        }

        // Range
        if (analytics.reasonUnavailable === "missing_tank_capacity") {
          elWarnCap.classList.remove("hidden");
          elRangeKm.textContent = "--";
          elRangeDays.textContent = "-- dias";
        } else {
          elWarnCap.classList.add("hidden");
          if (analytics.kmAteReservaEstimado !== null) {
            elRangeKm.textContent = analytics.kmAteReservaEstimado;

            if (analytics.diasAteReservaEstimado !== null) {
              elRangeDays.textContent = `~ ${analytics.diasAteReservaEstimado} dias`;
            } else {
              elRangeDays.textContent = "-- dias";
            }
          } else {
            elRangeKm.textContent = "--";
          }
        }

        // Alerts
        if (analytics.alertaFuelNivel && analytics.alertaFuelNivel !== "none") {
          elAlertBox.classList.remove("hidden");
          const isCrit = analytics.alertaFuelNivel === "critical";

          elAlertBox.className = `form-message ${isCrit ? "form-message--error" : "form-message--warning"}`;
          elAlertBox.textContent = isCrit
            ? `⚠️ Reserva atingida! Abasteça urgentemente.`
            : `⚠️ Combustível baixo. Planeie abastecer.`;
        } else {
          elAlertBox.classList.add("hidden");
        }

        // Toggle Logic (Idempotent: Re-assigning onclick is safe)
        const headerBtn = document.getElementById("btn-toggle-analytics");
        const contentDiv = document.getElementById("analytics-content");
        const iconToggle = document.getElementById("icon-analytics-toggle");

        if (headerBtn && contentDiv && iconToggle) {
          headerBtn.onclick = () => {
            const isHidden = contentDiv.classList.toggle("hidden");
            // Rotate: Default is UP (Open). If Hidden (Closed), rotate 180 (Down).
            iconToggle.style.transform = isHidden
              ? "rotate(180deg)"
              : "rotate(0deg)";
          };
        }
      } catch (err) {
        console.error("Error rendering analytics:", err);
      }
    }

    // ✅ ISTO TEM DE FICAR FORA DO IF/ELSE
    await renderAnalyticsCard(veiculoId);
    // 🛡️ DATA REPAIR
    await checkAndFixCorruptedData(veiculoId, v);

    initTabs();
    setupTabsToggle(veiculoId);

    // --- INTERNAL HELPER (Moved inside init to access renderAnalyticsCard) ---
    async function checkAndFixCorruptedData(veiculoId, v) {
      let fixed = false;

      // 1. Fix Abastecimentos Types (String -> Number, String -> Boolean)
      const records = await getAbastecimentosDoVeiculo(veiculoId, 100);
      let badCount = 0;

      for (const r of records) {
        let needsUpdate = false;
        let update = {};

        // Fix Odometro
        if (typeof r.odometro === "string") {
          const clean = Number(r.odometro.replace(/\s+/g, ""));
          if (!isNaN(clean) && clean > 0) {
            update.odometro = clean;
            needsUpdate = true;
          }
        }

        // Fix Completo
        if (typeof r.completo === "string") {
          if (r.completo === "true") update.completo = true;
          else if (r.completo === "false") update.completo = false;
          needsUpdate = true;
        }
        if (r.completo === 1) {
          update.completo = true;
          needsUpdate = true;
        }
        if (r.completo === 0) {
          update.completo = false;
          needsUpdate = true;
        }

        if (needsUpdate) {
          console.log("Fixing record:", r.id, update);
          await updateAbastecimento(veiculoId, r.id, update);
          badCount++;
          fixed = true;
        }
      }

      // FORCE ANALYTICS REFRESH (Self-Heal Stale Data)
      console.log("Forcing Analytics Refresh...");
      if (typeof refreshVehicleAnalytics === "function") {
        await refreshVehicleAnalytics(veiculoId);
      } else {
        console.warn(
          "refreshVehicleAnalytics function not available globally.",
        );
      }

      if (fixed) {
        alert(
          `Corrigidos ${badCount} registos de dados. A página vai recarregar.`,
        );
        location.reload();
      } else {
        // Now we can safe access renderAnalyticsCard
        await renderAnalyticsCard(veiculoId);
      }
    }
  } // End init scope

  // =========================
  // AUTH / START
  // =========================

  auth.onAuthStateChanged((user) => {
    if (!user) {
      showMessage("Sessão terminada.", "error");
      return;
    }
    init();

    // --- NOVO: Listener de mensagens e refresh automático do token ---
    if (typeof window.listenToForegroundMessages === "function") {
      window.listenToForegroundMessages();
    }
    // Garantir que o token está atualizado se tivermos permissão
    if ("Notification" in window && Notification.permission === "granted") {
      getUserSettings().then((settings) => {
        if (settings && settings.notificacoesAtivas !== false) {
          console.log("[Veículo] A atualizar token FCM...");
          window
            .requestNotificationPermissionAndSaveToken()
            .catch(console.error);
        }
      });
    }
    // -----------------------------------------------------------------
  });
});
