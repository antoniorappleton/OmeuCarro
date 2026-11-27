// js/veiculo.js
// DETALHE DE UM VEíCULO + ABASTECIMENTOS (SUBCOLEí‡íƒO)
// + DOCUMENTOS (LINK EXTERNO / STORAGE) COM CATEGORIA + FILTRO + íCONES
// + TíTULO (NOME) + NOTA
// + EDITAR INLINE

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // ELEMENTOS BASE
  // =========================
  const el = {
    name: document.getElementById("vehicle-name"),
    subtitle: document.getElementById("vehicle-subtitle"),

    // Unsubscribe handle for realtime listener
    vehicleUnsubscribe: null,
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
    const tabs = Array.from(
      document.querySelectorAll("main .tab-btn[data-tab]"),
    );
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
                    <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-wrench"></use></svg>
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
                         ? `<a href="${r.linkDocumento}" target="_blank" class="icon-btn-sm" title="Ver documento"><svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-file"></use></svg></a>`
                         : ""
                     }
                     <button class="icon-btn-sm" data-edit-rep="${
                       r.id
                     }"><svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-edit"></use></svg></button>
                     <button class="icon-btn-sm danger" data-del-rep="${
                       r.id
                     }"><svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg></button>
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
      editingId = null; // âœ… MUITO IMPORTANTE
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
        btn.innerHTML = `<svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-chevron-down"></use></svg>`;
      } else {
        container.classList.remove("tabs-collapsed");
        btn.setAttribute("aria-expanded", "true");
        btn.innerHTML = `<svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-chevron-up"></use></svg>`;
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

    // 3. INSPEí‡íƒO
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
                 <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-file"></use></svg>
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
                <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-edit"></use></svg>
              </button>

              <button class="icon-btn-sm danger" type="button" data-doc-del="${
                d.id
              }" aria-label="Apagar">
                <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg>
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

          if (msgEl) msgEl.textContent = "Guardado âœ…";
          await renderDocumentos(veiculoId);
        } catch (err) {
          console.error(err);
          if (msgEl) msgEl.textContent = err.message || "Erro ao guardar";
        }
      }
    };
  }

  // =========================
  // REPARAí‡í•ES
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
          <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-wrench"></use></svg>
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
              <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-calendar"></use></svg>
              <span>${escapeHtml(r.data || "—")}</span>
            </div>
            ${
              r.km
                ? `
            <div class="record-meta-item" style="margin-left:8px;">
               <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-car"></use></svg>
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
            <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-edit"></use></svg>
          </button>
          <button class="icon-btn-sm danger" data-del="${r.id}">
            <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg>
          </button>
        </div>
      `;

      list.appendChild(card);
    });

    list.onclick = async (e) => {
      const editBtn = e.target.closest("[data-edit]");
      const delBtn = e.target.closest("[data-del]");

      // âœï¸ EDITAR
      if (editBtn) {
        const id = editBtn.dataset.edit;
        openReparacaoForEdit(veiculoId, id);
      }

      // ðŸ—‘ï¸ ELIMINAR
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
          // USAR A MESMA Lí“GICA DA TABELA
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
            label = "PRí“XIMA";
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
  // MANUTENí‡í•ES PLANEADAS
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
          statusLabel = "PRí“XIMA";
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

    const btnTripLive = document.getElementById("btn-trip-live");
    if (btnTripLive) {
      btnTripLive.href = `viagem-ao-vivo.html?id=${encodeURIComponent(veiculoId)}`;
    }

    const user = auth.currentUser;
    if (!user) {
      showMessage("Sessão expirada.", "error");
      return;
    }

    let settings = null;
    let v = null;

    try {
      // âœ… Render health (sibling function, already in scope)
      renderVehicleHealth(veiculoId);
      setupDiagnosticTools(veiculoId);

      // âœ… Setup UI (Definitions hoisted to init level)
      try {
        setupTorqueIntegration(veiculoId);
        setupUnifiedImport(veiculoId);
      } catch (e) {
        console.error("[INIT] Erro ao ligar botões:", e);
      }

      // Obter settings do utilizador
      settings = await getUserSettings();

      // VEíCULO
      const veiculos = await getVeiculosDoUtilizador();
      v = veiculos.find((x) => x.id === veiculoId);

      if (!v) {
        showMessage("Veículo não encontrado.", "error");
        return;
      }

      // NEW: Floating Metrics Setup & Data dependent calls
      setupFloatingMetrics(veiculoId);
      updateFloatingMetrics(veiculoId, v, settings);

      el.name.textContent = v.nome;
      el.subtitle.textContent = `${v.marca} ${v.modelo}`;
      el.plate.textContent = v.matricula || "Sem matrícula";
      const fuelType = v.combustivelPadrao || "—";
      const fuelLevel = v.nivelCombustivel;

      if (fuelLevel !== undefined && fuelLevel !== null && fuelLevel > 0) {
        el.fuel.textContent = `${fuelType} (${Math.round(fuelLevel)}%)`;
      } else {
        el.fuel.textContent = fuelType;
      }

      // ðŸ”¹ ODí“METRO
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

      // REPARAí‡í•ES
      renderReparacoes(veiculoId, settings);
      initReparacoesModal(veiculoId);
      initAbastecimentoModal(veiculoId, settings);

      // MANUTENí‡í•ES PLANEADAS (Passando Current Odo explicitamente se necessário, ou v)
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

      // NEW: Real-time Profile Listener (Hero Odo & Fuel)
      setupVehicleListener(veiculoId);

      function setupVehicleListener(veiculoId) {
        if (typeof el.vehicleUnsubscribe === "function") {
          el.vehicleUnsubscribe(); // Clean up old listener if exists
        }
        el.vehicleUnsubscribe = db
          .collection("veiculos")
          .doc(veiculoId)
          .onSnapshot((doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // Update Hero Odometer
            const heroOdo = document.getElementById("vehicle-odometer-val");
            if (heroOdo && data.odometroAtual !== undefined) {
              heroOdo.textContent = Number(data.odometroAtual).toLocaleString();
            }

            // Update Fuel Badge (Hero)
            const fuelPct = data.nivelCombustivel;
            const heroFuel = document.getElementById("vehicle-fuel");
            const fuelType = data.combustivelPadrao || "—";

            if (heroFuel) {
              if (fuelPct !== undefined && fuelPct !== null && fuelPct > 0) {
                heroFuel.textContent = `${fuelType} (${Math.round(fuelPct)}%)`;
              } else {
                heroFuel.textContent = fuelType;
              }
            }

            // Update Last Trip Summary in UI (Reactivity to ultimasMetricas sync)
            if (data.ultimasMetricas) {
              console.log(
                "[VehicleListener] Ultimas Metricassync detected:",
                data.ultimasMetricas,
              );
              // Optionally trigger a refresh of the last trip card if needed,
              // but usually ultimasMetricas is for the profile view.
            }
          });
      }
      updateFloatingMetrics(veiculoId, v, settings);
    } catch (err) {
      console.error("[INIT] Erro fatal no carregamento:", err);
    }

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
      if (!modalObd) return;

      const openObd = (tab = "ultima") => {
        modalObd.classList.remove("hidden");
        // Trigger tab click if needed
        const tabBtn = modalObd.querySelector(`[data-tab="${tab}"]`);
        if (tabBtn) tabBtn.click();
        else {
          loadTripsHistory(veiculoId); // Fallback
        }
      };

      if (btnObd) {
        btnObd.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openObd("ultima");
        };
      }

      // Bind KPI Card
      const kpiHealth = document.getElementById("kpi-health-status");
      if (kpiHealth) {
        kpiHealth.style.cursor = "pointer";
        kpiHealth.onclick = () => openObd("diagnosticos");
      }

      if (btnCloseObd) {
        btnCloseObd.addEventListener("click", () =>
          modalObd.classList.add("hidden"),
        );
        modalObd.addEventListener("click", (e) => {
          if (e.target === modalObd) modalObd.classList.add("hidden");
        });
      }

      // Tabs
      const tabBtns = modalObd.querySelectorAll(".obd-tab");
      const tabPanels = modalObd.querySelectorAll(".tab-panel");

      tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.tab;
          tabBtns.forEach((b) => {
            b.classList.toggle("active", b === btn);
            b.setAttribute("aria-selected", b === btn ? "true" : "false");
          });
          tabPanels.forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${target}`));

          if (target === "historico") loadTripsHistory(veiculoId);
          if (target === "ultima") loadLastTrip(veiculoId);
          if (target === "diagnosticos") loadDiagnostics(veiculoId);
          if (target === "tendencias") loadTrends(veiculoId);
        });
      });

      // --- TRENDS LOGIC ---
      let cachedTrendsData = null;
      let trendsChart = null;

      async function loadTrends(vid) {
        const container = document.getElementById("trends-chart-container");
        const emptyMsg = document.getElementById("trends-empty");
        const switcher = document.getElementById("trends-metrics-switcher");

        if (!container) return;

        // If already cached, just render (active metric)
        if (cachedTrendsData) {
          const activeBtn = switcher?.querySelector(".segment-btn.active");
          const metric = activeBtn?.dataset.metric || "voltagemMedia";
          // Small delay to ensure container layout is updated
          setTimeout(() => renderTrendsChart(metric), 50);
          return;
        }

        try {
          emptyMsg?.classList.add("hidden");
          container.style.opacity = "0.5";
          console.log("Fetching trends for vehicle:", vid);

          // Fetch last 30 trips
          const snapshot = await db
            .collection("veiculos")
            .doc(vid)
            .collection("viagens")
            .orderBy("dataFim", "desc")
            .limit(30)
            .get();

          if (snapshot.empty || snapshot.size < 2) {
            container.classList.add("hidden");
            emptyMsg?.classList.remove("hidden");
            switcher?.classList.add("hidden");
            return;
          }

          container.classList.remove("hidden");
          switcher?.classList.remove("hidden");

          // Map and reverse (chronological)
          cachedTrendsData = snapshot.docs
            .map((doc) => {
              const d = doc.data();
              const date = d.dataFim?.toDate ? d.dataFim.toDate() : new Date();
              return {
                label: date.toLocaleDateString("pt-PT", {
                  day: "2-digit",
                  month: "2-digit",
                }),
                voltagemMedia: d.metricas?.voltagemMedia || null,
                rpmMedio: d.metricas?.rpmMedio || null,
                temperaturaMax: d.metricas?.temperaturaMax || null,
                consumoMedio: d.consumoMedio || null,
              };
            })
            .reverse();

          container.style.opacity = "1";
          setTimeout(() => renderTrendsChart("voltagemMedia"), 100);
        } catch (err) {
          console.error("Erro loadTrends:", err);
          alert("Erro ao carregar tendências: " + err.message);
        }
      }

      function renderTrendsChart(metric) {
        const canvas = document.getElementById("chart-obd-trends");
        if (!canvas || !cachedTrendsData) return;

        const ctx = canvas.getContext("2d");
        if (trendsChart) trendsChart.destroy();

        const labels = cachedTrendsData.map((d) => d.label);
        const values = cachedTrendsData.map((d) => d[metric]);

        const metricLabels = {
          voltagemMedia: "Bateria (V)",
          rpmMedio: "RPM Média",
          temperaturaMax: "Temp. Máx (ºC)",
          consumoMedio: "Consumo (L/100)",
        };

        const metricColors = {
          voltagemMedia: "#3b82f6",
          rpmMedio: "#f59e0b",
          temperaturaMax: "#ef4444",
          consumoMedio: "#10b981",
        };

        trendsChart = new Chart(ctx, {
          type: "line",
          data: {
            labels: labels,
            datasets: [
              {
                label: metricLabels[metric],
                data: values,
                borderColor: metricColors[metric],
                backgroundColor: metricColors[metric] + "20",
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: metricColors[metric],
                tension: 0.3,
                fill: true,
                spanGaps: true,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                mode: "index",
                intersect: false,
                backgroundColor: "rgba(0,0,0,0.8)",
                padding: 10,
                cornerRadius: 8,
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: { size: 10 } },
              },
              y: {
                beginAtZero: false,
                grid: { color: "rgba(0,0,0,0.05)" },
                ticks: { font: { size: 10 } },
              },
            },
          },
        });
      }

      // Metric Switcher Listener
      const trendsSwitcher = document.getElementById("trends-metrics-switcher");
      if (trendsSwitcher) {
        trendsSwitcher.addEventListener("click", (e) => {
          const btn = e.target.closest(".segment-btn");
          if (!btn) return;

          // Update UI
          trendsSwitcher
            .querySelectorAll(".segment-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");

          // Update Chart
          renderTrendsChart(btn.dataset.metric);
        });
      }

      // --- TORQUE CSV/ZIP IMPORT ---
      const btnImportCsv = document.getElementById("btn-import-torque-csv");
      const csvInput = document.getElementById("torque-csv-input");

      if (btnImportCsv && csvInput) {
        btnImportCsv.addEventListener("click", () => csvInput.click());

        csvInput.addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const progressModal = document.getElementById(
            "upload-progress-modal",
          );
          const progressBar = document.getElementById("upload-progress-bar");
          const progressText = document.getElementById("upload-progress-text");

          if (progressModal) {
            progressModal.classList.remove("hidden");
            if (progressBar) progressBar.style.width = "5%";
            if (progressText) progressText.textContent = "A ler ficheiro...";
          }

          // Unsubscribe from real-time listener to avoid spam/freeze during heavy batch writes
          if (
            el.vehicleUnsubscribe &&
            typeof el.vehicleUnsubscribe === "function"
          ) {
            console.log("[Import] Pausing real-time listener...");
            el.vehicleUnsubscribe();
            el.vehicleUnsubscribe = null;
          }

          try {
            const count = await handleTorqueImport(veiculoId, file);
            alert(
              `âœ… Importação concluída!\n${count} registos importados com sucesso.`,
            );

            // Reload UI
            loadLastTrip(veiculoId);
            loadTripsHistory(veiculoId);
            if (typeof renderVehicleHealth === "function")
              renderVehicleHealth(veiculoId);
          } catch (err) {
            console.error("[Import] Error:", err);
            alert(`âŒ Erro na importação:\n${err.message}`);
          } finally {
            if (progressModal) progressModal.classList.add("hidden");
            btnImportCsv.disabled = false;
            btnImportCsv.textContent = "Importar CSV/ZIP";
            csvInput.value = ""; // Reset file input
          }
        });
      }

      // --- DATA LOADING (VIAGENS) ---
      // Métricas calculadas com TripMetrics (js/utils/tripMetrics.js), o mesmo
      // código do servidor e do visor ao vivo. Viagens antigas (sem `acc`) são
      // recalculadas a partir das leituras OBD quando abertas e gravadas de volta.

      let tripRefsPromise = null;
      function getTripRefs() {
        if (!tripRefsPromise) {
          tripRefsPromise = (async () => {
            const refs = { refL100: null, pricePerLiter: null, fuelType: null };
            try {
              const vDoc = await db.collection("veiculos").doc(veiculoId).get();
              const v = vDoc.data() || {};
              refs.fuelType = v.tipoCombustivel || v.combustivelPadrao || null;
              refs.refL100 = v.consumoMedio || v.consumoMedioObd || null;
              const abs = await getAbastecimentosDoVeiculo(veiculoId, 100);
              if (abs?.[0]?.precoPorLitro) refs.pricePerLiter = Number(abs[0].precoPorLitro);
              const avg = window.Analytics?.calculateConsumption?.(abs)?.averageL100;
              if (avg) refs.refL100 = avg;
            } catch (e) {
              console.warn("[Trips] Erro a carregar referências:", e);
            }
            return refs;
          })();
        }
        return tripRefsPromise;
      }

      const tsToMs = (t) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : null);

      async function fetchTripReadings(trip) {
        const start = tsToMs(trip.dataInicio);
        const end = tsToMs(trip.dataFim);
        if (!start || !end) return [];
        const snap = await db
          .collection("veiculos")
          .doc(veiculoId)
          .collection("leiturasObd")
          .where("timestamp", ">=", start)
          .where("timestamp", "<=", end)
          .orderBy("timestamp", "asc")
          .limit(6000)
          .get();
        return snap.docs.map((d) => d.data());
      }

      // Resumo para viagens sem leituras nem acumulado (ex.: importações antigas)
      function legacySummary(trip) {
        const m = trip.metricas || {};
        return {
          distanceKm: trip.distancia || null,
          durationMin: trip.duracao || null,
          avgSpeed: trip.velocidadeMedia || null,
          avgMovingSpeed: m.velocidadeMediaMovimento || null,
          maxSpeed: m.velocidadeMax || null,
          idleMin: null,
          idlePct: null,
          avgRpm: m.rpmMedio ? Math.round(m.rpmMedio) : null,
          maxRpm: m.rpmMax || null,
          highRpmPct: null,
          maxCoolant: m.temperaturaMax > -40 ? m.temperaturaMax : null,
          warmupMin: null,
          reachedWarm: null,
          avgVoltage: m.voltagemMedia || null,
          minVoltage: null,
          harshAccel: null,
          harshBrake: null,
          liters: m.combustivelGasto || null,
          l100: trip.consumoMedio || null,
          fuelSource: trip.consumoMedio ? "torque" : null,
          cost: trip.custoEstimado || null,
          co2Kg: null,
          fuelLevelStart: null,
          fuelLevelEnd: m.combustivelFinal || null,
          score: trip.score || null,
          distanceSource: null,
          legacy: true,
        };
      }

      // Devolve { sum, readings } para uma viagem.
      async function getTripSummary(trip, tripId) {
        const refs = await getTripRefs();
        const TM = window.TripMetrics;

        if (trip.acc && trip.acc.v === TM.VERSION) {
          return { sum: TM.summarize(trip.acc, refs), readings: null };
        }

        let readings = [];
        try {
          readings = await fetchTripReadings(trip);
        } catch (e) {
          console.warn("[Trips] Erro a ler leituras da viagem:", e);
        }
        if (readings.length < 2) return { sum: legacySummary(trip), readings };

        const state = TM.fromReadings(readings, refs);
        const sum = TM.summarize(state, refs);

        // Grava o recálculo (só para viagens terminadas, para não colidir com o servidor)
        const ended = Date.now() - (tsToMs(trip.dataFim) || 0) > 10 * 60 * 1000;
        if (ended && tripId) {
          db.collection("veiculos")
            .doc(veiculoId)
            .collection("viagens")
            .doc(tripId)
            .update({ ...TM.toTripFields(sum), acc: state })
            .catch((e) => console.warn("[Trips] Não gravou recálculo:", e));
        }
        return { sum, readings };
      }

      // ---------- Formatação ----------
      const nf = (v, d = 0) =>
        v === null || v === undefined || isNaN(v)
          ? null
          : Number(v).toLocaleString("pt-PT", {
              minimumFractionDigits: d,
              maximumFractionDigits: d,
            });

      function fmtTripDuration(min) {
        if (!min && min !== 0) return null;
        if (min < 60) return `${Math.round(min)} min`;
        return `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;
      }

      function fmtTripDay(d) {
        const today = new Date();
        const yest = new Date();
        yest.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return "Hoje";
        if (d.toDateString() === yest.toDateString()) return "Ontem";
        const s = d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" });
        return s.charAt(0).toUpperCase() + s.slice(1);
      }

      const fmtTime = (d) => d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

      function routeType(sum) {
        const v = sum.avgMovingSpeed || sum.avgSpeed;
        if (!v) return null;
        if (v < 30) return "Urbano";
        if (v < 60) return "Misto";
        return "Estrada";
      }

      function scoreClass(s) {
        if (s === null || s === undefined) return "none";
        return s >= 85 ? "good" : s >= 65 ? "ok" : "bad";
      }

      function tripInsights(sum, refs) {
        const tips = [];
        if (sum.reachedWarm === false && sum.maxCoolant !== null)
          tips.push({
            kind: "warn",
            text: `O motor não chegou a aquecer (máx. ${sum.maxCoolant} °C). Viagens curtas a frio gastam mais e desgastam o motor — num diesel também não deixam o filtro de partículas regenerar.`,
          });
        if (sum.idlePct !== null && sum.idlePct >= 25 && sum.idleMin >= 3)
          tips.push({
            kind: "info",
            text: `${nf(sum.idleMin)} min parado com o motor ligado (${sum.idlePct}% do tempo). Desligar em paragens longas poupa combustível.`,
          });
        const harsh = (sum.harshAccel || 0) + (sum.harshBrake || 0);
        if (harsh >= 3)
          tips.push({
            kind: "info",
            text: `${sum.harshAccel} acelerações e ${sum.harshBrake} travagens bruscas. Antecipar o trânsito reduz consumo e desgaste de travões.`,
          });
        if (sum.highRpmPct !== null && sum.highRpmPct >= 10)
          tips.push({
            kind: "info",
            text: `${sum.highRpmPct}% do tempo acima de 3000 rpm. Passar de mudança mais cedo é mais eficiente.`,
          });
        if (sum.avgVoltage !== null && sum.avgVoltage < 13)
          tips.push({
            kind: "warn",
            text: `Tensão média de ${nf(sum.avgVoltage, 1)} V com o motor ligado (normal: 13,5–14,7 V). Convém verificar bateria e alternador.`,
          });
        if (sum.fuelSource && sum.fuelSource !== "estimativa" && refs.refL100 && sum.l100 > refs.refL100 * 1.2)
          tips.push({
            kind: "info",
            text: `Consumo ${Math.round((sum.l100 / refs.refL100 - 1) * 100)}% acima da tua média (${nf(refs.refL100, 1)} L/100km).`,
          });
        if (!tips.length && sum.score >= 85)
          tips.push({ kind: "good", text: "Condução suave e eficiente nesta viagem." });
        return tips.slice(0, 3);
      }

      function sourcesNote(sum, refs) {
        const notes = [];
        if (sum.distanceSource === "velocidade")
          notes.push("Distância calculada a partir da velocidade OBD.");
        if (sum.fuelSource === "estimativa")
          notes.push(
            `Consumo e custo estimados com a tua média real (${nf(refs.refL100, 1)} L/100km) — o carro não reporta fluxo de combustível pelo OBD.`,
          );
        else if (sum.fuelSource === "maf") notes.push("Consumo calculado pelo sensor MAF.");
        else if (sum.fuelSource === "torque") notes.push("Consumo medido pelo Torque.");
        if (sum.cost !== null && sum.cost !== undefined)
          notes.push("Custo com o preço do último abastecimento.");
        if (sum.legacy) notes.push("Viagem sem leituras detalhadas — valores originais.");
        return notes.join(" ");
      }

      // ---------- Renderização do resumo ----------
      const tripCharts = new Map(); // container -> Chart

      function renderTripSummary(container, trip, tripId, sum, readings, refs) {
        const start = new Date(tsToMs(trip.dataInicio) || Date.now());
        const end = new Date(tsToMs(trip.dataFim) || Date.now());
        const est = sum.fuelSource === "estimativa" ? "~" : "";
        const route = routeType(sum);
        const sc = scoreClass(sum.score);
        const healthMarkup = renderTripHealth(trip);

        const hero = [
          ["Distância", nf(sum.distanceKm, 1), "km"],
          ["Duração", fmtTripDuration(sum.durationMin), ""],
          ["Consumo", sum.l100 !== null ? est + nf(sum.l100, 1) : null, "L/100km"],
          ["Custo", sum.cost !== null && sum.cost !== undefined ? est + nf(sum.cost, 2) : null, "€"],
        ];

        const row = (label, value, hint) =>
          value === null || value === undefined || value === ""
            ? ""
            : `<div class="ts-row"><span>${label}</span><strong>${value}${hint ? ` <small>${hint}</small>` : ""}</strong></div>`;
        const join = (...p) => (p.some((x) => x === null || x === undefined) ? null : p.join(""));

        const driving = [
          row("Velocidade média a andar", join(nf(sum.avgMovingSpeed), " km/h")),
          row("Velocidade máxima", join(nf(sum.maxSpeed), " km/h")),
          row(
            "Parado com motor ligado",
            join(nf(sum.idleMin), " min"),
            sum.idlePct !== null ? `${sum.idlePct}%` : "",
          ),
          row(
            "Acelerações / travagens bruscas",
            sum.harshAccel !== null && sum.harshAccel !== undefined ? `${sum.harshAccel} / ${sum.harshBrake}` : null,
          ),
          row("RPM médio", join(nf(sum.avgRpm), " rpm"), sum.maxRpm ? `máx ${nf(sum.maxRpm)}` : ""),
          row("Tempo acima de 3000 rpm", join(sum.highRpmPct, "%")),
        ].join("");

        const engine = [
          row("Temperatura máxima do motor", join(nf(sum.maxCoolant), " °C")),
          row("Tempo até aquecer (70 °C)", sum.warmupMin !== null ? `${nf(sum.warmupMin)} min` : sum.reachedWarm === false ? "não aqueceu" : null),
          row("Bateria (média)", join(nf(sum.avgVoltage, 1), " V"), sum.minVoltage ? `mín ${nf(sum.minVoltage, 1)} V` : ""),
          row(
            "Depósito",
            sum.fuelLevelStart !== null && sum.fuelLevelStart !== undefined && sum.fuelLevelEnd !== null
              ? `${sum.fuelLevelStart}% → ${sum.fuelLevelEnd}%`
              : null,
          ),
          row("Combustível gasto", sum.liters !== null && sum.liters !== undefined ? `${est}${nf(sum.liters, 2)} L` : null),
          row("CO₂ emitido", sum.co2Kg !== null && sum.co2Kg !== undefined ? `${est}${nf(sum.co2Kg, 1)} kg` : null),
        ].join("");

        const tips = tripInsights(sum, refs);
        const note = sourcesNote(sum, refs);

        container.innerHTML = `
          <div class="ts">
            <header class="ts-head">
              <div>
                <div class="ts-date">${fmtTripDay(start)} · ${fmtTime(start)} → ${fmtTime(end)}</div>
                <div class="ts-sub">${[route, sum.distanceKm ? `${nf(sum.distanceKm, 1)} km` : null].filter(Boolean).join(" · ")}</div>
              </div>
              <div class="ts-score ts-score--${sc}" title="Score de condução (0–100)">
                <strong>${sum.score ?? "—"}</strong><span>score</span>
              </div>
            </header>

            <div class="ts-hero">
              ${hero
                .map(
                  ([l, v, u]) => `
                <div class="ts-hero-cell">
                  <span class="ts-hero-label">${l}</span>
                  <span class="ts-hero-value">${v ?? "—"}${v && u ? ` <small>${u}</small>` : ""}</span>
                </div>`,
                )
                .join("")}
            </div>

            ${healthMarkup}

            ${
              tips.length
                ? `<ul class="ts-tips">${tips.map((t) => `<li class="ts-tip ts-tip--${t.kind}">${t.text}</li>`).join("")}</ul>`
                : ""
            }

            ${driving ? `<section class="ts-section"><h4>Condução</h4>${driving}</section>` : ""}
            ${engine ? `<section class="ts-section"><h4>Motor e combustível</h4>${engine}</section>` : ""}

            <section class="ts-section ts-chart-section">
              <button class="btn btn-secondary btn-sm ts-chart-btn" type="button">
                <svg class="icon icon-left"><use href="../assets/icons/icons-unified.svg#icon-trend-up"></use></svg>
                Ver gráfico de velocidade e RPM
              </button>
              <div class="ts-chart hidden"><canvas></canvas></div>
            </section>

            ${note ? `<p class="ts-note">${note}</p>` : ""}

            <div class="ts-actions">
              <button class="btn btn-sm ts-delete" type="button">
                <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg>
                Eliminar viagem
              </button>
            </div>
          </div>`;

        // Gráfico (a pedido)
        const btnChart = container.querySelector(".ts-chart-btn");
        const chartWrap = container.querySelector(".ts-chart");
        btnChart.onclick = async () => {
          btnChart.disabled = true;
          btnChart.textContent = "A carregar…";
          try {
            const data = readings && readings.length ? readings : await fetchTripReadings(trip);
            if (!data.length) {
              btnChart.textContent = "Sem leituras detalhadas para esta viagem";
              return;
            }
            chartWrap.classList.remove("hidden");
            btnChart.remove();
            drawTripChart(container, chartWrap.querySelector("canvas"), data);
          } catch (e) {
            console.error("[Trips] Erro no gráfico:", e);
            btnChart.textContent = "Erro ao carregar o gráfico";
            btnChart.disabled = false;
          }
        };

        container.querySelector(".ts-delete").onclick = async () => {
          if (!confirm("Eliminar esta viagem?")) return;
          try {
            await deleteViagem(veiculoId, tripId);
            document.getElementById("trip-details-modal")?.classList.add("hidden");
            await loadLastTrip(veiculoId);
            await loadTripsHistory(veiculoId);
          } catch (err) {
            console.error(err);
            alert("Erro ao eliminar a viagem.");
          }
        };
      }

      function drawTripChart(container, canvas, readings) {
        // No máximo ~400 pontos para o gráfico ficar fluido
        const stepN = Math.max(1, Math.ceil(readings.length / 400));
        const pts = readings.filter((_, i) => i % stepN === 0);
        const labels = pts.map((r) => fmtTime(new Date(r.timestamp)));
        const speed = pts.map((r) => r.parsed?.speed ?? null);
        const rpm = pts.map((r) => r.parsed?.rpm ?? null);

        const prev = tripCharts.get(container);
        if (prev) prev.destroy();

        const chart = new Chart(canvas.getContext("2d"), {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Velocidade (km/h)",
                data: speed,
                borderColor: "#0ea5b7",
                backgroundColor: "rgba(14,165,183,0.12)",
                fill: true,
                yAxisID: "y",
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
              },
              {
                label: "RPM",
                data: rpm,
                borderColor: "#f59e0b",
                yAxisID: "y1",
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1.5,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { position: "top", labels: { boxWidth: 12 } } },
            scales: {
              x: { ticks: { maxTicksLimit: 6 } },
              y: { position: "left", min: 0, title: { display: true, text: "km/h" } },
              y1: {
                position: "right",
                min: 0,
                grid: { drawOnChartArea: false },
                title: { display: true, text: "RPM" },
              },
            },
          },
        });
        tripCharts.set(container, chart);
      }

      async function showTripIn(container, trip, tripId) {
        container.innerHTML = '<div class="spinner"></div>';
        const [refs, { sum, readings }] = await Promise.all([getTripRefs(), getTripSummary(trip, tripId)]);
        renderTripSummary(container, trip, tripId, sum, readings, refs);
      }

      async function loadLastTrip(vid) {
        const empty = document.getElementById("last-trip-empty");
        const view = document.getElementById("last-trip-view");
        if (!view) return;
        try {
          const snap = await db
            .collection("veiculos")
            .doc(vid)
            .collection("viagens")
            .orderBy("dataFim", "desc")
            .limit(1)
            .get();

          if (snap.empty) {
            empty?.classList.remove("hidden");
            view.innerHTML = "";
            return;
          }
          empty?.classList.add("hidden");
          await showTripIn(view, snap.docs[0].data(), snap.docs[0].id);
        } catch (e) {
          console.error("Error loading last trip:", e);
          view.innerHTML = '<p class="muted">Erro ao carregar a viagem.</p>';
        }
      }

      async function openTripDetails(trip, tripId) {
        const modal = document.getElementById("trip-details-modal");
        const view = document.getElementById("trip-details-view");
        if (!modal || !view) return;
        modal.classList.remove("hidden");
        await showTripIn(view, trip, tripId);
      }

      const closeTripDetails = () => {
        document.getElementById("trip-details-modal")?.classList.add("hidden");
        loadTripsHistory(veiculoId); // pode ter sido recalculada ao abrir
      };
      document.getElementById("trip-details-close")?.addEventListener("click", closeTripDetails);
      document
        .querySelector("#trip-details-modal .modal-overlay")
        ?.addEventListener("click", closeTripDetails);

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
            .limit(30)
            .get();

          const empty = document.getElementById("trips-empty");
          const count = document.getElementById("trips-count");
          list.innerHTML = "";
          if (snap.empty) {
            empty?.classList.remove("hidden");
            if (count) count.textContent = "";
            return;
          }
          empty?.classList.add("hidden");
          if (count) count.textContent = `${snap.size} viagens recentes`;

          let lastDay = null;
          snap.forEach((doc) => {
            const trip = doc.data();
            const d = new Date(tsToMs(trip.dataInicio) || tsToMs(trip.dataFim) || Date.now());
            const day = fmtTripDay(d);
            if (day !== lastDay) {
              const h = document.createElement("div");
              h.className = "th-day";
              h.textContent = day;
              list.appendChild(h);
              lastDay = day;
            }
            list.appendChild(createTripCard(trip, doc.id, d));
          });
        } catch (e) {
          console.error("Error loading history:", e);
          list.innerHTML = '<div class="muted">Erro ao carregar histórico.</div>';
        }
      }

      function createTripCard(trip, tripId, start) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "th-card";
        const est = trip.consumoFonte === "estimativa" ? "~" : "";
        const needsRecalc = trip.calcVersion !== window.TripMetrics.VERSION;
        const dist = trip.distancia > 0.05 ? nf(trip.distancia, 1) : null;
        const cons = trip.consumoMedio > 0 ? est + nf(trip.consumoMedio, 1) : null;
        const route = routeType({ avgMovingSpeed: trip.metricas?.velocidadeMediaMovimento, avgSpeed: trip.velocidadeMedia });
        const sc = scoreClass(trip.score);

        el.innerHTML = `
          <div class="th-main">
            <span class="th-time">${fmtTime(start)}</span>
            <span class="th-meta">${[fmtTripDuration(trip.duracao), route].filter(Boolean).join(" · ")}</span>
          </div>
          <div class="th-stats">
            <span><strong>${dist ?? "—"}</strong> km</span>
            <span><strong>${cons ?? "—"}</strong> L/100</span>
          </div>
          <span class="th-score th-score--${sc}">${trip.score ?? "—"}</span>
          ${needsRecalc ? '<span class="th-badge" title="Abre para recalcular com as leituras OBD">recalcular</span>' : ""}
        `;
        el.addEventListener("click", () => openTripDetails(trip, tripId));
        return el;
      }

      // Carregar dados iniciais
      loadLastTrip(veiculoId);
      loadTripsHistory(veiculoId);
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
            ? `<span title="Depósito Cheio" style="color:var(--color-success); margin-left:6px;"><svg class="icon" style="width:14px;height:14px;"><use href="../assets/icons/icons-unified.svg#icon-droplet"></use></svg></span>`
            : "";

          card.innerHTML = `
        <div class="record-icon-box is-fuel">
          <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-fuel"></use></svg>
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
               <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-calendar"></use></svg>
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
             <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-edit"></use></svg>
           </button>
           <button class="icon-btn-sm danger" type="button" data-del="${a.id}">
             <svg class="icon"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg>
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

      function renderTripHealth(trip) {
        const diagnostic = trip.diagnostico;
        const quality = trip.qualidadeDados;
        const states = {
          normal: { icon: "✓", label: "Tudo normal nesta viagem", className: "good" },
          a_vigiar: { icon: "!", label: "A vigiar", className: "warning" },
          verificar: { icon: "!", label: "Recomenda-se verificar", className: "critical" },
          dados_insuficientes: { icon: "?", label: "Dados insuficientes", className: "neutral" },
          indisponivel: { icon: "—", label: "Sem dados OBD disponíveis", className: "neutral" },
        };
        const state = states[diagnostic?.estado] || {
          icon: "i",
          label: "Check-up ainda não disponível",
          className: "neutral",
        };
        const qualityLabel = quality
          ? `Qualidade OBD: ${Math.round((Number(quality.cobertura) || 0) * 100)}% · intervalo mediano ${
              quality.intervaloMedianoS === null || quality.intervaloMedianoS === undefined
                ? "indisponível"
                : `${nf(quality.intervaloMedianoS, 1)} s`
            } · ${Number(quality.gaps) || 0} falhas > 10 s`
          : null;
        const unitByRule = {
          THERMOSTAT_OPEN: "°C",
          WARMUP_SLOW: "min",
          IAT_HIGH: "°C",
          UNDERBOOST: "kPa",
          MAF_DRIFT: "g/s",
          HIGH_LOAD_CRUISE: "%",
          DPF_PRESSURE: "kPa/(g/s)",
          BATTERY_REST: "V",
          CRANK_DIP: "V",
          FUEL_TRIM: "%",
        };
        const titleByRule = {
          THERMOSTAT_OPEN: "Temperatura do motor",
          WARMUP_SLOW: "Aquecimento mais lento",
          IAT_HIGH: "Temperatura de admissão elevada",
          UNDERBOOST: "Pressão de turbo abaixo da referência",
          MAF_DRIFT: "Desvio do caudal de ar",
          HIGH_LOAD_CRUISE: "Carga elevada em velocidade de cruzeiro",
          DPF_PRESSURE: "Pressão diferencial do DPF",
          BATTERY_REST: "Tensão da bateria em repouso",
          CRANK_DIP: "Queda de tensão no arranque",
          FUEL_TRIM: "Correções de combustível",
        };
        const findings = Array.isArray(diagnostic?.achados)
          ? diagnostic.achados.slice(0, 3)
          : [];
        const findingMarkup = findings
          .map((finding) => {
            const unit = unitByRule[finding.ruleId] || "";
            const observed =
              typeof finding.valorObservado === "number"
                ? `${nf(finding.valorObservado, 1)} ${unit}`
              : escapeHtml(String(finding.valorObservado || "—"));
            const reference =
              typeof finding.referencia === "number"
              ? `${nf(finding.referencia, 1)} ${unit}`
              : String(finding.referencia || "—");
            const causes = (finding.possiveisCausas || [])
              .map((cause) => escapeHtml(cause))
              .join(", ");
            return `<li class="ts-health-finding">
              <strong>${escapeHtml(String(titleByRule[finding.ruleId] || finding.ruleId))}</strong>
              <span>${escapeHtml(String(finding.acaoRecomendada || "Recomenda-se confirmar com diagnóstico profissional."))}</span>
              <details>
                <summary>Detalhes técnicos</summary>
                <p>Observado: ${observed} · Referência: ${escapeHtml(reference)} · Confiança: ${escapeHtml(String(finding.confianca || "—"))}</p>
                ${causes ? `<p>Possíveis causas: ${causes}</p>` : ""}
              </details>
            </li>`;
          })
          .join("");
        const learningMarkup = (diagnostic?.aprendizagem || [])
          .map((item) => `<p class="ts-note">${escapeHtml(item.mensagem || "A aprender o seu carro (0/5 viagens válidas).")}</p>`)
          .join("");

        return `<section class="ts-health">
          <div class="ts-health-heading ts-health--${state.className}">
            <span class="ts-health-icon" aria-hidden="true">${state.icon}</span>
            <strong>${state.label}</strong>
          </div>
          ${qualityLabel ? `<span class="ts-quality">${escapeHtml(qualityLabel)}</span>` : ""}
          ${findings.length ? `<ul class="ts-health-list">${findingMarkup}</ul>` : ""}
          ${learningMarkup}
        </section>`;
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
            ? `⚠️ Reserva atingida! Abasteça urgentemente.`
            : `⚠️ Combustível baixo. Planeie abastecer.`;
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

    // âœ… ISTO TEM DE FICAR FORA DO IF/ELSE
    await renderAnalyticsCard(veiculoId);
    // ðŸ›¡ï¸ DATA REPAIR
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

  // --- HELPERS FOR IMPORT ---
  function calculateTripsFromReadings(readings) {
    if (!readings || !readings.length) return [];
    const trips = [];
    let currentBatch = [readings[0]];

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];
      // Gap > 15 min = New Trip
      if (curr.timestamp - prev.timestamp > 15 * 60 * 1000) {
        const t = processTripBatch(currentBatch);
        if (t) trips.push(t);
        currentBatch = [];
      }
      currentBatch.push(curr);
    }
    if (currentBatch.length > 0) {
      const t = processTripBatch(currentBatch);
      if (t) trips.push(t);
    }
    return trips;
  }

  function processTripBatch(batch) {
    if (!batch || !batch.length) return null;
    const start = batch[0];
    const end = batch[batch.length - 1];
    const durationMin = (end.timestamp - start.timestamp) / 1000 / 60;

    // Filter noise (trips < 1 min or 0 distance?)
    if (durationMin < 1 && batch.length < 10) return null;

    let maxSpeed = 0,
      maxRpm = 0,
      maxTemp = 0;
    let sumSpeed = 0,
      sumRpm = 0,
      sumVoltage = 0,
      sumLoad = 0,
      sumL100 = 0;
    let countVoltage = 0,
      countLoad = 0,
      countL100 = 0;
    let dist = 0;

    // Score system: start 100
    let scorePoints = 100;
    let penaltyRpm = 0;
    let penaltySpeed = 0;
    let penaltyIdling = 0;
    let penaltyLoad = 0;

    let idleSeconds = 0;

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i].parsed || {};
      const s = Number(p.speed) || 0;
      const r = Number(p.rpm) || 0;
      const t = Number(p.temp || p.coolant);
      const v = Number(p.voltage);
      const l = Number(p.engineLoad);
      const c = Number(p.tripL100);
      const f = Number(p.fuelRemainingPct || p.fuelLevel);
      const a = Number(p.distanceToEmptyKm || p.distanceToEmpty);
      const g = Number(p.fuelUsedTrip || p.fuelUsed);

      if (s > maxSpeed) maxSpeed = s;
      if (r > maxRpm) maxRpm = r;
      if (!isNaN(t) && t > maxTemp) maxTemp = t;

      sumSpeed += s;
      sumRpm += r;

      if (v > 0) {
        sumVoltage += v;
        countVoltage++;
      }
      if (l > 0) {
        sumLoad += l;
        countLoad++;
        if (l > 85) penaltyLoad += 0.1; // High engine load penalty
      }
      if (c > 0) {
        sumL100 += c;
        countL100++;
      }

      // Time diff for accumulation
      const dt =
        i > 0 ? (batch[i].timestamp - batch[i - 1].timestamp) / 1000 : 0;

      // Penalties
      if (r > 3000) penaltyRpm += 0.2 * Math.max(1, dt);
      if (r > 4000) penaltyRpm += 1.0 * Math.max(1, dt);
      if (s > 120) penaltySpeed += 0.5 * Math.max(1, dt);
      if (s > 140) penaltySpeed += 2.0 * Math.max(1, dt);

      // Idling Penalty (Speed 0, RPM > 500)
      if (s < 1 && r > 500 && dt > 0) {
        idleSeconds += dt;
        if (idleSeconds > 60) {
          penaltyIdling += 0.05 * dt; // Every second idle after 1 min
        }
      } else {
        idleSeconds = 0;
      }

      // Track last values for import update
      if (f > 0) start.lastFuel = f;
      if (a > 0) start.lastRange = a;
      if (g > 0) start.lastFuelUsed = g;

      // Calc dist
      if (dt > 0 && dt < 300) {
        const velms = s / 3.6;
        dist += velms * dt;
      }
    }

    // Odometer fallback
    if (start.parsed?.odometer && end.parsed?.odometer) {
      const d = end.parsed.odometer - start.parsed.odometer;
      if (d > 0 && d < 2000) dist = d * 1000;
    }

    scorePoints = Math.max(
      0,
      scorePoints - penaltyRpm - penaltySpeed - penaltyIdling - penaltyLoad,
    );
    const avgVoltage = countVoltage ? sumVoltage / countVoltage : null;
    const avgLoad = countLoad ? sumLoad / countLoad : null;
    const avgConsumo = countL100 ? sumL100 / countL100 : 0;

    // Last known state from batch
    const fuelFinal =
      end.parsed?.fuelRemainingPct || end.parsed?.fuelLevel || start.lastFuel;
    const autonomiaFinal =
      end.parsed?.distanceToEmptyKm ||
      end.parsed?.distanceToEmpty ||
      start.lastRange;

    return {
      dataInicio: firebase.firestore.Timestamp.fromMillis(start.timestamp),
      dataFim: firebase.firestore.Timestamp.fromMillis(end.timestamp),
      distancia: Number((dist / 1000).toFixed(2)),
      duracao: Number(durationMin.toFixed(1)),
      velocidadeMedia: Number(
        (batch.length ? sumSpeed / batch.length : 0).toFixed(1),
      ),
      consumoMedio: Number(avgConsumo.toFixed(2)),
      custoEstimado: 0,
      score: Math.round(scorePoints),
      metricas: {
        rpmMedio: batch.length ? Math.round(sumRpm / batch.length) : 0,
        velocidadeMax: Number(maxSpeed.toFixed(1)),
        temperaturaMax: maxTemp,
        voltagemMedia: avgVoltage ? Number(avgVoltage.toFixed(1)) : null,
        cargaMedia: avgLoad ? Math.round(avgLoad) : null,
        combustivelFinal: fuelFinal ? Number(fuelFinal.toFixed(1)) : null,
        autonomiaKm: autonomiaFinal ? Math.round(autonomiaFinal) : null,
        combustivelGasto: start.lastFuelUsed
          ? Number(start.lastFuelUsed.toFixed(2))
          : null,
      },
      source: "import_csv",
      importedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function setupDiagnosticTools(veiculoId) {
    const form = document.getElementById("manual-dtc-form");
    const dateInput = document.getElementById("manual-dtc-date");
    const formMessage = document.getElementById("manual-dtc-message");
    const saveButton = document.getElementById("manual-dtc-save");
    const baselineButton = document.getElementById("btn-recalculate-baseline");
    const baselineMessage = document.getElementById("baseline-message");
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
    }

    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const codeInput = document.getElementById("manual-dtc-code");
        const stateInput = document.getElementById("manual-dtc-state");
        const code = codeInput?.value.trim().toUpperCase() || "";
        const date = dateInput?.value || "";
        if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(code) || !date) {
          if (formMessage) formMessage.textContent = "Indica um código SAE e uma data válidos.";
          return;
        }

        const descriptions = {
          P0470: {
            descricao: "Circuito do sensor de pressão de escape",
            relacionado: "DPF_PRESSURE",
          },
        };
        const category = {
          P: "trem motriz",
          B: "carroçaria",
          C: "chassis",
          U: "comunicação entre módulos",
        }[code[0]];
        const genericType = code[1] === "0" ? "genérico SAE" : "específico do fabricante";
        const known = descriptions[code];
        const record = {
          tipo: "dtc-manual",
          codigo: code,
          estadoDtc: stateInput?.value || "pendente",
          dataRegisto: date,
          descricao: known?.descricao || `Código de ${category} (${genericType})`,
          nota: "A descrição exata depende do fabricante.",
          possivelmenteRelacionado: known?.relacionado || null,
          importedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (saveButton) saveButton.disabled = true;
        if (formMessage) formMessage.textContent = "A guardar código…";
        try {
          await db
            .collection("veiculos")
            .doc(veiculoId)
            .collection("diagnosticos")
            .add(record);
          form.reset();
          if (dateInput) {
            dateInput.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 10);
          }
          if (formMessage) formMessage.textContent = "Código guardado no histórico.";
          await loadDiagnostics(veiculoId);
        } catch (error) {
          console.error("Erro ao guardar DTC manual:", error);
          if (formMessage) formMessage.textContent = "Não foi possível guardar o código.";
        } finally {
          if (saveButton) saveButton.disabled = false;
        }
      });
    }

    if (baselineButton && !baselineButton.dataset.bound) {
      baselineButton.dataset.bound = "true";
      baselineButton.addEventListener("click", async () => {
        if (typeof firebase.functions !== "function") {
          if (baselineMessage) baselineMessage.textContent = "Serviço de baseline indisponível nesta página.";
          return;
        }
        baselineButton.disabled = true;
        if (baselineMessage) baselineMessage.textContent = "A recalcular com viagens válidas…";
        try {
          const recalculate = firebase
            .app()
            .functions("us-central1")
            .httpsCallable("recalculateVehicleBaselines");
          const response = await recalculate({ vehicleId: veiculoId });
          const count = Number(response.data?.validTripCount) || 0;
          if (baselineMessage) {
            baselineMessage.textContent = `Baseline recalculada com ${count} viagens válidas.`;
          }
          await renderVehicleHealth(veiculoId);
        } catch (error) {
          console.error("Erro ao recalcular baseline:", error);
          if (baselineMessage) {
            baselineMessage.textContent = error.code === "functions/failed-precondition"
              ? error.message
              : "Não foi possível recalcular a baseline.";
          }
        } finally {
          baselineButton.disabled = false;
        }
      });
    }
  }

  /**
   * Render Vehicle Health KPI and potential Warning Cards
   */
  async function renderVehicleHealth(veiculoId) {
    const elText = document.getElementById("kpi-health-text");
    const elDot = document.getElementById("kpi-health-dot");
    if (!elText || !elDot) return;

    try {
      const diagSnap = await db
        .collection("veiculos")
        .doc(veiculoId)
        .collection("diagnosticos")
        .orderBy("importedAt", "desc")
        .limit(1)
        .get();

      const tripSnap = await db
        .collection("veiculos")
        .doc(veiculoId)
        .collection("viagens")
        .orderBy("dataFim", "desc")
        .limit(5)
        .get();

      const recentTrip = tripSnap.docs
        .map((doc) => doc.data())
        .find((trip) => trip.diagnostico);
      const state = recentTrip?.diagnostico?.estado;
      const mode6 = diagSnap.empty ? null : diagSnap.docs[0].data();
      const hasMode6Failures = Number(mode6?.summary?.failCount) > 0;
      const presentation = hasMode6Failures || state === "verificar"
        ? { text: "Verificar", dot: "status-error" }
        : state === "a_vigiar" || Number(mode6?.summary?.nearLimitCount) > 0
          ? { text: "A vigiar", dot: "status-warning" }
          : state === "normal"
            ? { text: "Tudo normal", dot: "status-success" }
            : state === "dados_insuficientes"
              ? { text: "Dados insuficientes", dot: "status-neutral" }
              : state === "indisponivel"
                ? { text: "Sem dados OBD", dot: "status-neutral" }
                : { text: "A aguardar viagem", dot: "status-neutral" };

      elText.textContent = presentation.text;
      elText.setAttribute("aria-label", `Saúde do veículo: ${presentation.text}`);
      elDot.className = "status-indicator-dot " + presentation.dot;
    } catch (e) {
      console.error("Erro ao apresentar saúde do veículo:", e);
    }
  }

  // --- DIAGNOSTICS (MODE $06) ---

  async function loadDiagnostics(veiculoId) {
    const container = document.getElementById("diagnostics-list");
    if (!container) return;

    container.innerHTML = '<div class="spinner"></div>';

    try {
      const snap = await db
        .collection("veiculos")
        .doc(veiculoId)
        .collection("diagnosticos")
        .orderBy("importedAt", "desc")
        .limit(20)
        .get();

      if (snap.empty) {
        container.innerHTML =
          '<div class="vehicles-empty"><p>Nenhum relatório de diagnóstico encontrado.</p></div>';
        return;
      }

      container.innerHTML = "";
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.tipo === "dtc-manual") {
          const date = data.dataRegisto
            ? new Date(`${data.dataRegisto}T12:00:00`).toLocaleDateString("pt-PT")
            : "Data desconhecida";
          const card = document.createElement("article");
          card.className = "card";
          card.innerHTML = `
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                <div>
                  <div class="muted" style="font-size:0.8rem;">${escapeHtml(date)} · Registo manual</div>
                  <strong>${escapeHtml(data.codigo || "DTC")}</strong>
                  <span class="badge badge-outline">${escapeHtml(data.estadoDtc || "pendente")}</span>
                  <p style="margin:6px 0 0;">${escapeHtml(data.descricao || "Código de avaria OBD")}</p>
                  <small class="muted">${escapeHtml(data.nota || "A descrição exata depende do fabricante.")}</small>
                </div>
                <button class="icon-btn-sm danger btn-del-diag" type="button" title="Eliminar código" aria-label="Eliminar código">
                  <svg style="width:14px;height:14px;fill:currentColor;"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg>
                </button>
              </div>
              ${
                data.possivelmenteRelacionado
                  ? `<p class="muted" style="font-size:0.8rem;margin-bottom:0;">Possivelmente relacionado com ${escapeHtml(data.possivelmenteRelacionado)}.</p>`
                  : ""
              }
            </div>`;
          card.querySelector(".btn-del-diag").onclick = async () => {
            if (!confirm("Eliminar este código registado?")) return;
            try {
              await deleteDiagnostico(veiculoId, doc.id);
              await loadDiagnostics(veiculoId);
            } catch (error) {
              console.error("Erro ao eliminar DTC:", error);
              alert("Erro ao eliminar o código.");
            }
          };
          container.appendChild(card);
          return;
        }
        const date = data.importedAt
          ? data.importedAt.toDate().toLocaleString()
          : "Data desconhecida";
        const failCount = data.summary?.failCount || 0;
        const nearLimit = data.summary?.nearLimitCount || 0;
        const contextClass =
          failCount > 0
            ? "status-error"
            : nearLimit > 0
              ? "status-warning"
              : "status-success";
        const statusText =
          failCount > 0
            ? `${failCount} Falhas detetadas`
            : nearLimit > 0
              ? `${nearLimit} Alertas (Perto do limite)`
              : "Saúde: Saudável";

        const card = document.createElement("div");
        card.className = "card";
        card.style.cursor = "pointer";
        card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div class="muted" style="font-size:0.8rem;">${date}</div>
                        <div style="font-weight:600;">${statusText}</div>
                        <div style="font-size:0.85rem;" class="muted">${data.tests?.length || 0} testes executados</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button class="icon-btn-sm danger btn-del-diag" data-id="${doc.id}" title="Eliminar Relatório" style="padding: 4px;">
                           <svg style="width:14px; height:14px; fill:currentColor;"><use href="../assets/icons/icons-unified.svg#icon-trash"></use></svg>
                        </button>
                        <div class="status-indicator-dot ${contextClass}" style="width:12px; height:12px;"></div>
                    </div>
                </div>
                <div class="diag-details hidden" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-light);">
                    <div class="table-responsive">
                        <table style="width:100%; font-size:0.8rem; border-collapse: collapse;">
                            <thead>
                                <tr class="muted" style="text-align:left;">
                                    <th>Teste</th>
                                    <th>Valor / Limites</th>
                                    <th>Estado / Explicação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(data.tests || [])
                                  .map((t) => {
                                    const testName =
                                      t.name || t.component || "Desconhecido";
                                    const testVal =
                                      t.val !== undefined
                                        ? t.val
                                        : t.value !== undefined
                                          ? t.value
                                          : "--";
                                    const testMin =
                                      t.min !== undefined
                                        ? t.min
                                        : t.minVal !== undefined
                                          ? t.minVal
                                          : "--";
                                    const testMax =
                                      t.max !== undefined
                                        ? t.max
                                        : t.maxVal !== undefined
                                          ? t.maxVal
                                          : "--";
                                    const testStatus = t.status || "UNKNOWN";

                                    const isFail = testStatus === "FAIL";
                                    const isNear =
                                      testStatus === "PASS" &&
                                      t.marginToLimit !== null &&
                                      t.marginToLimit < 0.1;
                                    const isIgnored = testStatus === "IGNORED";
                                    const isIncomplete =
                                      testStatus === "INCOMPLETE";

                                    let statusEmoji = "â¬œ";
                                    if (isFail) statusEmoji = "ðŸŸ¥";
                                    else if (isIncomplete) statusEmoji = "âšª";
                                    else if (isIgnored) statusEmoji = "ðŸ”˜";
                                    else if (isNear) statusEmoji = "ðŸŸ§";
                                    else if (testStatus === "PASS")
                                      statusEmoji = "ðŸŸ©";

                                    // Sparkline calculation
                                    let sparklineHtml = "";
                                    if (
                                      typeof testVal === "number" &&
                                      typeof testMin === "number" &&
                                      typeof testMax === "number"
                                    ) {
                                      const range = Math.abs(testMax - testMin);
                                      if (range > 0) {
                                        const pct = Math.min(
                                          100,
                                          Math.max(
                                            0,
                                            ((testVal -
                                              Math.min(testMin, testMax)) /
                                              range) *
                                              100,
                                          ),
                                        );
                                        const barColor = isFail
                                          ? "var(--color-error)"
                                          : isNear
                                            ? "var(--color-warning)"
                                            : "var(--color-success, #10b981)";
                                        sparklineHtml = `
                                          <div style="width: 100%; height: 6px; bg-color: rgba(255,255,255,0.1); border-radius: 3px; margin-top: 8px; position: relative; background: rgba(255,255,255,0.1); overflow: hidden;">
                                            <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
                                          </div>
                                        `;
                                      }
                                    }

                                    return `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                        <td style="padding: 12px 8px 12px 0; vertical-align: top;">
                                          <div style="font-weight: 700; font-size: 0.85rem; color: #fff;">${testName}</div>
                                          <div class="muted" style="font-size: 0.7rem; margin-top: 2px;">MID:${t.mid || "-"} TID:${t.tid || "-"}</div>
                                        </td>
                                        <td style="padding: 12px 8px; vertical-align: top; min-width: 120px;">
                                          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                                            <span style="font-weight: 600; font-size: 0.9rem;">${testVal}</span>
                                            <span class="muted" style="font-size: 0.7rem;">[${testMin} - ${testMax}]</span>
                                          </div>
                                          ${sparklineHtml}
                                        </td>
                                        <td style="padding: 12px 0 12px 8px; vertical-align: top; text-align: right;">
                                          <div style="white-space: nowrap; font-weight: 800; font-size: 0.75rem;">
                                            ${statusEmoji} ${testStatus}
                                          </div>
                                          ${t.explanation ? `<div class="muted" style="font-size: 0.7rem; margin-top: 6px; line-height: 1.3; font-weight: 400; max-width: 150px; margin-left: auto;">${t.explanation}</div>` : ""}
                                        </td>
                                    </tr>
                                `;
                                  })
                                  .join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

        const delBtn = card.querySelector(".btn-del-diag");
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm("Eliminar este relatório de diagnóstico?")) return;
          try {
            await deleteDiagnostico(veiculoId, doc.id);
            await loadDiagnostics(veiculoId);
          } catch (err) {
            console.error(err);
            alert("Erro ao eliminar diagnóstico.");
          }
        };

        card.onclick = () => {
          const det = card.querySelector(".diag-details");
          det.classList.toggle("hidden");
        };

        container.appendChild(card);
      });
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="error-box">Erro ao carregar diagnósticos: ${e.message}</div>`;
    }
  }

  /**
   * Setup the Unified Import Modal (3 tabs: CSV, Mode 06, Summary)
   */
  function setupUnifiedImport(veiculoId) {
    const btnTrigger = document.getElementById("btn-import-torque-csv-zip");
    const btnAddDiag = document.getElementById("btn-add-diagnostic");
    const modal = document.getElementById("modalImport");
    const btnClose = document.getElementById("btn-close-import");
    const btnCancel = document.getElementById("btn-cancel-import");
    const btnRun = document.getElementById("btn-run-import");
    const tabBtns = document.querySelectorAll(
      ".tabs .tab-btn[data-import-tab]",
    );
    const tabPanels = document.querySelectorAll(".import-tab-panel");

    if (!modal) {
      console.warn("[Import] Modal not found");
      return;
    }

    // Open Modal via "Importar Dados"
    if (btnTrigger) {
      btnTrigger.onclick = () => {
        modal.classList.remove("hidden");
        switchImportTab("tabCsv");
      };
    }

    // Open Modal via "+Novo Relatório"
    if (btnAddDiag) {
      btnAddDiag.onclick = () => {
        modal.classList.remove("hidden");
        switchImportTab("tabMode06");
      };
    }

    // Close Modal
    const closeModal = () => {
      modal.classList.add("hidden");
      const input = document.getElementById("csvFileInput");
      if (input) input.value = "";
      const area = document.getElementById("mode06Text");
      if (area) area.value = "";
    };
    if (btnCancel) btnCancel.onclick = closeModal;
    if (btnClose) btnClose.onclick = closeModal;

    // Tab Switching
    function switchImportTab(tabId) {
      tabBtns.forEach((b) => {
        const isMatch = b.getAttribute("data-import-tab") === tabId;
        b.classList.toggle("active", isMatch);
        // Premium style fix for border-bottom
        b.style.borderBottomColor = isMatch
          ? "var(--color-primary-start)"
          : "transparent";
        b.style.fontWeight = isMatch ? "700" : "400";
      });
      tabPanels.forEach((p) => p.classList.toggle("hidden", p.id !== tabId));
      updateImportSummary();
    }

    tabBtns.forEach((btn) => {
      btn.onclick = () => switchImportTab(btn.getAttribute("data-import-tab"));
    });

    // Summary logic
    function updateImportSummary() {
      const summaryDiv = document.getElementById("importSummary");
      if (!summaryDiv) return;

      const fileInput = document.getElementById("csvFileInput");
      const m06Text = document.getElementById("mode06Text")?.value.trim();
      let html = "";

      if (fileInput?.files?.length > 0) {
        html += `<p>âœ… <strong>CSV/ZIP:</strong> ${fileInput.files[0].name}</p>`;
      }
      if (m06Text) {
        const parsed = parseMode06Text(m06Text);
        html += `<p>âœ… <strong>Mode $06:</strong> ${parsed.summary.totalTests} testes encontrados. Estado: <strong>${parsed.summary.estado}</strong></p>`;
      }

      if (!html) {
        html = '<p class="muted">Nenhum dado selecionado para importar.</p>';
        if (btnRun) btnRun.disabled = true;
      } else {
        if (btnRun) btnRun.disabled = false;
      }
      summaryDiv.innerHTML = html;
    }

    // Listen for changes
    document
      .getElementById("csvFileInput")
      ?.addEventListener("change", updateImportSummary);
    document
      .getElementById("mode06Text")
      ?.addEventListener("input", updateImportSummary);

    // RUN IMPORT
    if (btnRun) {
      btnRun.onclick = async () => {
        const file = document.getElementById("csvFileInput")?.files[0];
        const m06Text = document.getElementById("mode06Text")?.value.trim();
        btnRun.disabled = true;
        btnRun.textContent = "A importar...";

        try {
          if (file) {
            await handleTorqueImport(veiculoId, file, {
              sampleRate: document.getElementById("sampleRate").value,
              grouping: document.getElementById("tripGrouping").value,
            });
          }
          if (m06Text) {
            const parsed = parseMode06Text(m06Text);
            await db
              .collection("veiculos")
              .doc(veiculoId)
              .collection("diagnosticos")
              .add({
                ...parsed,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              });
          }
          alert("Dados importados com sucesso!");
          closeModal();
          location.reload();
        } catch (e) {
          alert("Erro na importação: " + e.message);
        } finally {
          btnRun.disabled = false;
          btnRun.textContent = "Importar Dados";
        }
      };
    }
  }

  /**
   * UPDATED: Handle Torque CSV/ZIP Import (Deterministic IDs & Fuel Fallback)
   */
  async function handleTorqueImport(veiculoId, file, options = {}) {
    if (!file) return;

    const progressModal = document.getElementById("upload-progress-modal");
    const progressBar = document.getElementById("upload-progress-bar");
    const progressText = document.getElementById("upload-progress-text");

    if (progressModal) {
      progressModal.classList.remove("hidden");
      if (progressBar) progressBar.style.width = "5%";
      if (progressText) progressText.textContent = "A ler ficheiro...";
    }

    try {
      let csvText = "";
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        // Look for any .csv file, prioritizing trackLog and ignoring system folders
        const files = Object.values(zip.files);
        let csvFile = files.find((f) => {
          const name = f.name.toLowerCase();
          return name.endsWith(".csv") && !f.dir && !name.includes("__macosx");
        });

        if (!csvFile) {
          console.error("[Import] ZIP Content:", Object.keys(zip.files));
          throw new Error(
            "Nenhum ficheiro CSV encontrado dentro do ZIP. Verifique se o ficheiro exportado contém os dados.",
          );
        }

        csvText = await csvFile.async("string");
        console.log(`[Import] Extraído CSV do ZIP: ${csvFile.name}`);
      } else {
        csvText = await file.text();
      }

      const content = csvText.trim();
      const firstLine = content.split("\n")[0];
      // Detect separator: comma or semicolon
      const sep = firstLine.includes(";") ? ";" : ",";
      const lines = content.split(/\r?\n/);

      if (lines.length < 2) throw new Error("CSV vazio ou sem dados.");

      const headers = lines[0]
        .split(sep)
        .map((h) => h.trim().replace(/"/g, ""));
      const findHeaderPriority = (exactList, fallbackList) => {
        // 1º tenta match quase exato
        for (const exact of exactList) {
          const found = headers.find(
            (h) => h.toLowerCase().trim() === exact.toLowerCase(),
          );
          if (found) return found;
        }
        // 2º fallback fuzzy controlado
        for (const fb of fallbackList) {
          const found = headers.find((h) =>
            h.toLowerCase().includes(fb.toLowerCase()),
          );
          if (found) return found;
        }
        return null;
      };

      const dateCol =
        findHeaderPriority(
          ["Device Time", "Time", "Data"],
          ["Device Time", "Time", "Data"],
        ) || headers[1];
      const speedObdCol = findHeaderPriority(
        ["Speed (OBD)(km/h)", "Speed (OBB)(km/h)"],
        ["Speed (OBD)"],
      );
      const speedGpsCol = findHeaderPriority(
        [
          "Speed (GPS)(km/h)",
          "GPS Speed (Meters/second)",
          "Speed (GPS)(Meters/second)",
        ],
        ["Speed (GPS)", "GPS Speed"],
      );
      const rpmCol = findHeaderPriority(
        ["Engine RPM(rpm)", "Engine RPM (rpm)"],
        ["RPM", "Rotações"],
      );
      const odoCol = findHeaderPriority(
        ["Odometer(from ECU)(km)", "Odometer (from ECU)(km)", "Odometer (km)"],
        ["Odometer"],
      );
      const fuelCol = findHeaderPriority(
        ["Fuel Level (From Engine ECU)(%)", "Fuel Level"],
        ["Fuel Level"],
      );
      const fuelRemCol = findHeaderPriority(
        ["Fuel Remaining (Calculated from vehicle profile)(%)"],
        ["Fuel Remaining"],
      );
      const tripL100Col = findHeaderPriority(
        ["Trip average Litres/100 KM(l/100km)", "Trip average"],
        ["Trip average", "Média de Viagem"],
      );
      const rangeCol = findHeaderPriority(
        ["Distance to empty (Estimated)(km)", "Distance to empty"],
        ["Distance to empty", "Autonomia"],
      );
      const coolantCol = findHeaderPriority(
        ["Engine Coolant Temperature(°C)", "Engine Coolant Temperature"],
        ["Coolant", "Temperatura"],
      );
      const loadCol = findHeaderPriority(
        ["Engine Load(%)", "Engine Load", "Engine Load(Absolute)(%)"],
        ["Load", "Carga"],
      );
      const intakeCol = findHeaderPriority(
        ["Intake Air Temperature(°C)", "Intake Air Temperature"],
        ["Intake", "Admissão"],
      );
      const mafCol = findHeaderPriority(
        ["Mass air flow(g/s)", "Mass air flow"],
        ["MAF", "Fluxo de Ar"],
      );
      const voltageCol = findHeaderPriority(
        ["Voltage (Control Module)(V)", "Voltage"],
        ["Voltage", "Voltagem"],
      );
      const latCol =
        findHeaderPriority(["Latitude"], ["Latitude"]) || "Latitude";
      const lonCol =
        findHeaderPriority(["Longitude"], ["Longitude"]) || "Longitude";

      const readings = [];
      const sampleRate = parseInt(options.sampleRate) || 1;
      const sessionId = options.sessionId || "csv_" + Date.now();

      const parseDate = (str) => {
        if (!str || str === "-") return null;
        // Clean double quotes
        str = str.replace(/"/g, "");
        let d = new Date(str);
        if (!isNaN(d.getTime())) return d.getTime();

        // Fallback for dd-MMM-yyyy HH:mm:ss (Torque default in some locales)
        // or other odd formats. Try common replacements.
        const months = {
          jan: 0,
          fev: 1,
          mar: 2,
          abr: 3,
          mai: 4,
          jun: 5,
          jul: 6,
          ago: 7,
          set: 8,
          out: 9,
          nov: 10,
          dez: 11,
          jan: 0,
          feb: 1,
          mar: 2,
          apr: 3,
          may: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          nov: 10,
          dec: 11,
        };
        const parts = str.split(/[\s\-\/:]+/);
        if (parts.length >= 3) {
          // Check for dd-MMM-yyyy or similar
          let day = parseInt(parts[0]);
          let month = months[parts[1].toLowerCase().substring(0, 3)];
          let year = parseInt(parts[2]);
          if (!isNaN(day) && month !== undefined && !isNaN(year)) {
            let hours = parseInt(parts[3]) || 0;
            let mins = parseInt(parts[4]) || 0;
            let secs = parseInt(parts[5]) || 0;
            return new Date(year, month, day, hours, mins, secs).getTime();
          }
        }
        return null;
      };

      for (let i = 1; i < lines.length; i++) {
        if (i % sampleRate !== 0) continue;
        const values = lines[i].split(sep);
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || null;
        });

        let dateStr = row[dateCol];
        const timestamp = parseDate(dateStr);
        if (!timestamp) continue;

        const getNum = (col) => {
          if (!col) return null;
          let v = row[col];
          if (!v || v === "-" || v === "") return null;
          v = String(v).replace(/"/g, "").replace(",", ".");
          const n = parseFloat(v);
          return isNaN(n) ? null : n;
        };

        // FUEL FALLBACK: Use Fuel Level or Fuel Remaining (Calculated)
        const fuelLevelRaw = getNum(fuelCol);
        const fuelRemRaw = getNum(fuelRemCol);
        const finalFuel = fuelLevelRaw !== null ? fuelLevelRaw : fuelRemRaw;

        // SPEED LOGIC: Priority OBD > GPS
        const sObd = getNum(speedObdCol);
        const sGps = getNum(speedGpsCol);
        let finalSpeed = sObd;
        if (finalSpeed === null && sGps !== null) {
          // Check if GPS speed needs conversion (m/s to km/h)
          if (
            speedGpsCol &&
            speedGpsCol.toLowerCase().includes("meters/second")
          ) {
            finalSpeed = sGps * 3.6;
          } else {
            finalSpeed = sGps;
          }
        }

        const parsed = {
          speed: finalSpeed,
          rpm: getNum(rpmCol),
          odometer: getNum(odoCol),
          fuelLevel: finalFuel,
          fuelRemainingPct: fuelRemRaw,
          tripL100: getNum(tripL100Col),
          distanceToEmptyKm: getNum(rangeCol),
          coolant: getNum(coolantCol),
          engineLoad: getNum(loadCol),
          intake: getNum(intakeCol),
          maf: getNum(mafCol),
          voltage: getNum(voltageCol),
        };

        const lat = getNum(latCol);
        const lon = getNum(lonCol);
        const loc =
          lat && lon ? new firebase.firestore.GeoPoint(lat, lon) : null;

        // DETERMINISTIC ID (Reduced to vehicleId + timestamp for better deduplication if sessionId changes)
        const rid = generateDeterministicId(veiculoId, timestamp);

        readings.push({
          id: rid,
          vehicleId: veiculoId,
          timestamp,
          receivedAt: firebase.firestore.Timestamp.fromMillis(timestamp),
          sessionId: sessionId,
          deviceId: "csv_import",
          imported: true,
          parsed: { ...parsed, location: loc },
        });
      }

      if (!readings.length) throw new Error("Sem dados válidos.");

      readings.sort((a, b) => a.timestamp - b.timestamp);
      const trips = calculateTripsFromReadings(readings);

      // DETERMINISTIC TRIPS
      if (trips.length) {
        const batch = db.batch();
        const ref = db
          .collection("veiculos")
          .doc(veiculoId)
          .collection("viagens");
        trips.forEach((t) => {
          // Use timestamp + sessionId for deterministic trip ID to avoid overwrites
          const tid = generateDeterministicId(
            veiculoId,
            t.dataInicio.toMillis(),
            t.sessionId || "trip",
          );
          batch.set(ref.doc(tid), t, { merge: true });
        });
        await batch.commit();
      }

      // BATCH READINGS (Deterministic set)
      const coll = db
        .collection("veiculos")
        .doc(veiculoId)
        .collection("leiturasObd");

      for (let i = 0; i < readings.length; i += 450) {
        const chunk = readings.slice(i, i + 450);
        const b = db.batch();
        chunk.forEach((r) => {
          const { id, ...data } = r;
          b.set(coll.doc(id), data, { merge: true });
        });
        await b.commit();
        if (progressBar)
          progressBar.style.width = `${Math.round((i / readings.length) * 100)}%`;
      }

      // UPDATE VEHICLE PROFILE (LATEST)
      const latest = readings[readings.length - 1];
      if (latest && latest.parsed) {
        const upd = {
          lastObdUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        };
        // REMOVED: upd.odometroAtual update (User requested not to affect KM)
        if (latest.parsed.fuelLevel !== null)
          upd.nivelCombustivel = latest.parsed.fuelLevel;
        if (latest.parsed.distanceToEmptyKm)
          upd.autonomiaKm = latest.parsed.distanceToEmptyKm;

        await db.collection("veiculos").doc(veiculoId).update(upd);
      }

      if (progressModal) progressModal.classList.add("hidden");
      return readings.length;
    } catch (e) {
      console.error(e);
      if (progressModal) progressModal.classList.add("hidden");
      throw e;
    }
  }

  /**
   * Robust Mode $06 Parser
   */
  function parseValue(str) {
    if (!str) return null;
    return Number(
      String(str)
        .replace(/mg\/stroke|%/gi, "")
        .replace(/(\d)\s+(\d)/g, "$1$2")
        .replace(",", ".")
        .replace(/[^\d.-]/g, ""),
    );
  }

  function parseMode06Text(text) {
    const lines = text
      .split(/\r?\n|----/)
      .map((l) => l.trim())
      .filter(Boolean);
    const tests = [];

    for (const line of lines) {
      if (!line.includes("TID:")) continue;

      const incomplete = line.includes("Test incomplete");

      // Try multiple regex patterns for the component name
      let name = "Desconhecido";
      const nameMatch =
        line.match(/(?:TID:\$\w+\s+)(?:-\s*)?(.*?)\s+Max:/i) ||
        line.match(/-(.*?)\s+Max:/i);
      if (nameMatch) name = nameMatch[1].trim();

      const mid = line.match(/MID:\$(\w+)/i)?.[1] || null;
      const tid = line.match(/TID:\$(\w+)/i)?.[1] || null;

      const maxVal = parseValue(line.match(/Max:\s*([^\s]+)/i)?.[1]);
      const minVal = parseValue(line.match(/Min:\s*([^\s]+)/i)?.[1]);
      const value = parseValue(
        line.match(/Test result value:\s*([^\s]+)/i)?.[1],
      );

      const noiseCylinder16 = name.includes("Cylinder 16");
      const realMin = Math.min(minVal, maxVal);
      const realMax = Math.max(minVal, maxVal);

      let status = "PASS";
      let explanation = "";

      if (incomplete) {
        status = "INCOMPLETE";
        explanation = `${name} não concluiu o teste ou depende de outro teste falhado.`;
      } else if (noiseCylinder16) {
        status = "IGNORED";
        explanation = `Este teste refere-se ao "Cylinder 16", que não existe no motor deste veículo. É ruído do scanner e pode ser ignorado.`;
      } else if (value >= realMin && value <= realMax) {
        status = "PASS";
        explanation = `${name} dentro dos limites (${value} entre ${realMin} e ${realMax}).`;
      } else {
        status = "FAIL";
        explanation = `${name} fora dos limites: valor ${value}, intervalo permitido ${realMin} ←’ ${realMax}.`;
      }

      // Calculate margin to limit for highlighting
      const span = realMax - realMin;
      const margin =
        span > 0 ? Math.min(value - realMin, realMax - value) / span : null;

      tests.push({
        mid: mid ? mid.toUpperCase() : null,
        tid: tid ? tid.toUpperCase() : null,
        name,
        min: realMin,
        max: realMax,
        val: value,
        status,
        explanation,
        marginToLimit: margin,
      });
    }

    const failCount = tests.filter((t) => t.status === "FAIL").length;
    const nearLimitCount = tests.filter(
      (t) =>
        t.status === "PASS" &&
        t.marginToLimit !== null &&
        t.marginToLimit < 0.1,
    ).length;

    let estado = "Healthy";
    if (failCount > 0) estado = "Critical";
    else if (nearLimitCount >= 3) estado = "Warning";

    return {
      summary: {
        totalTests: tests.length,
        passCount: tests.filter((t) => t.status === "PASS").length,
        failCount,
        nearLimitCount,
        estado,
      },
      tests,
      importedAt: new Date(),
    };
  }
});
