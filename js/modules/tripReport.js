(function () {
  "use strict";

  const MAX_RECORDS_PER_SECTION = 500;
  const REPORT_DATA = window.TripReportData;
  let latestReport = null;

  document.addEventListener("DOMContentLoaded", initTripReport);

  function initTripReport() {
    const startInput = document.getElementById("report-date-start");
    const endInput = document.getElementById("report-date-end");
    const previewButton = document.getElementById("report-preview-button");
    const downloadButton = document.getElementById("report-download-button");
    if (!startInput || !endInput || !previewButton || !downloadButton) return;
    downloadButton.disabled = false;

    const today = new Date();
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    startInput.value = localDateValue(yearAgo);
    endInput.value = localDateValue(today);

    previewButton.addEventListener("click", async () => {
      previewButton.disabled = true;
      setStatus("A carregar dados do período…");
      try {
        latestReport = await loadReport();
        renderPreview(latestReport);
        setStatus(
          latestReport.limitReached
            ? "Pré-visualização pronta. Alguns resultados atingiram o limite de 500 registos por secção."
            : "Pré-visualização pronta.",
        );
      } catch (error) {
        console.error("[TripReport] Erro ao preparar relatório:", error);
        latestReport = null;
        setStatus(error.message || "Não foi possível preparar o relatório.");
      } finally {
        previewButton.disabled = false;
      }
    });

    [startInput, endInput].forEach((input) =>
      input.addEventListener("change", invalidatePreview),
    );
    document
      .getElementById("filter-vehicle")
      ?.addEventListener("change", invalidatePreview);
    document
      .querySelectorAll('input[name="report-section"]')
      .forEach((input) => input.addEventListener("change", invalidatePreview));

    downloadButton.addEventListener("click", async () => {
      downloadButton.disabled = true;
      try {
        if (!latestReport) {
          setStatus("A preparar o relatório…");
          latestReport = await loadReport();
          renderPreview(latestReport);
        }
        setStatus("A gerar o PDF…");
        if (await ensurePdfLibraries()) {
          const filename = downloadPdf(latestReport);
          setStatus(`PDF transferido: ${filename}`);
        } else {
          setStatus(
            "Não foi possível carregar a biblioteca PDF (sem ligação?). Usa a impressão e escolhe «Guardar como PDF».",
          );
          window.print();
        }
      } catch (error) {
        console.error("[TripReport] Erro ao gerar PDF:", error);
        setStatus(error.message || "Não foi possível gerar o PDF. Tenta novamente.");
      } finally {
        downloadButton.disabled = false;
      }
    });
  }

  function invalidatePreview() {
    latestReport = null;
    const preview = document.getElementById("report-preview");
    if (preview) preview.hidden = true;
    setStatus("");
  }

  async function loadReport() {
    if (!REPORT_DATA) throw new Error("Módulo de relatório indisponível.");
    const startDate = document.getElementById("report-date-start").value;
    const endDate = document.getElementById("report-date-end").value;
    if (!startDate || !endDate || startDate > endDate) {
      throw new Error("Indica um intervalo de datas válido.");
    }

    const allVehicles = await getVeiculosDoUtilizador();
    if (!allVehicles.length) {
      throw new Error("Não existem veículos disponíveis para este utilizador.");
    }
    const selectedVehicleId =
      document.getElementById("filter-vehicle")?.value || "";
    const vehicles = selectedVehicleId
      ? allVehicles.filter((vehicle) => vehicle.id === selectedVehicleId)
      : allVehicles;
    if (!vehicles.length) {
      throw new Error("O veículo selecionado já não está disponível.");
    }

    const start = new Date(`${startDate}T00:00:00`);
    const endExclusive = new Date(`${endDate}T00:00:00`);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const startTimestamp = firebase.firestore.Timestamp.fromDate(start);
    const endTimestamp = firebase.firestore.Timestamp.fromDate(endExclusive);
    const recordsByVehicle = await Promise.all(
      vehicles.map((vehicle) =>
        loadVehicleRecords(vehicle, startDate, endDate, startTimestamp, endTimestamp),
      ),
    );
    const sections = selectedSections();
    const settings = await getUserSettings();
    const currency = /^[A-Z]{3}$/.test(settings?.moeda || "")
      ? settings.moeda
      : "EUR";

    return {
      startDate,
      endDate,
      generatedAt: new Date(),
      currency,
      vehicles,
      sections,
      fuel: recordsByVehicle.flatMap((item) => item.fuel),
      trips: recordsByVehicle.flatMap((item) => item.trips),
      repairs: recordsByVehicle.flatMap((item) => item.repairs),
      plans: recordsByVehicle.flatMap((item) => item.plans),
      limitReached: recordsByVehicle.some((item) => item.limitReached),
    };
  }

  async function loadVehicleRecords(
    vehicle,
    startDate,
    endDate,
    startTimestamp,
    endTimestamp,
  ) {
    const vehicleRef = db.collection("veiculos").doc(vehicle.id);
    const [fuelSnap, tripsSnap, repairsSnap, plans] = await Promise.all([
      queryStringDateRange(
        vehicleRef.collection("abastecimentos"),
        startDate,
        endDate,
      ),
      vehicleRef
        .collection("viagens")
        .where("dataFim", ">=", startTimestamp)
        .where("dataFim", "<", endTimestamp)
        .orderBy("dataFim", "asc")
        .limit(MAX_RECORDS_PER_SECTION)
        .get(),
      queryStringDateRange(
        vehicleRef.collection("reparacoes"),
        startDate,
        endDate,
      ),
      getManutencoesPlaneadas(vehicle.id),
    ]);

    const vehicleName = [vehicle.marca, vehicle.modelo, vehicle.nome]
      .filter(Boolean)
      .join(" ");
    const attachVehicle = (doc) => ({
      id: doc.id,
      vehicleId: vehicle.id,
      vehicleName: vehicleName || "Veículo",
      ...doc.data(),
    });
    const fuel = fuelSnap.docs.map(attachVehicle);
    const trips = tripsSnap.docs.map(attachVehicle);
    const repairs = repairsSnap.docs.map(attachVehicle);
    const byDate = (a, b) =>
      String(REPORT_DATA.dateKey(a.data)).localeCompare(String(REPORT_DATA.dateKey(b.data)));
    const filteredFuel = REPORT_DATA.filterByPeriod(
      fuel,
      "data",
      startDate,
      endDate,
    ).sort(byDate);
    const filteredRepairs = REPORT_DATA.filterByPeriod(
      repairs,
      "data",
      startDate,
      endDate,
    ).sort(byDate);
    return {
      fuel: filteredFuel,
      trips,
      repairs: filteredRepairs,
      plans: plans.map((plan) => ({
        ...plan,
        vehicleId: vehicle.id,
        vehicleName: vehicleName || "Veículo",
      })),
      limitReached:
        fuelSnap.size === MAX_RECORDS_PER_SECTION ||
        tripsSnap.size === MAX_RECORDS_PER_SECTION ||
        repairsSnap.size === MAX_RECORDS_PER_SECTION,
    };
  }

  // O campo `data` existe em dois formatos: texto ("2026-11-27" ou ISO com hora,
  // como grava a página Abastecer) e Timestamp (registos antigos/importados).
  // Uma consulta só apanha um tipo, por isso fazem-se as duas e juntam-se.
  // O limite superior "<data>" inclui o último dia mesmo com hora.
  async function queryStringDateRange(collection, startDate, endDate) {
    const startTs = firebase.firestore.Timestamp.fromDate(new Date(`${startDate}T00:00:00`));
    const endDay = new Date(`${endDate}T00:00:00`);
    endDay.setDate(endDay.getDate() + 1);
    const endTs = firebase.firestore.Timestamp.fromDate(endDay);
    const [asText, asTimestamp] = await Promise.all([
      collection
        .where("data", ">=", startDate)
        .where("data", "<=", `${endDate}`)
        .orderBy("data", "asc")
        .limit(MAX_RECORDS_PER_SECTION)
        .get(),
      collection
        .where("data", ">=", startTs)
        .where("data", "<", endTs)
        .orderBy("data", "asc")
        .limit(MAX_RECORDS_PER_SECTION)
        .get()
        .catch(() => ({ docs: [], size: 0 })),
    ]);
    const seen = new Set();
    const docs = [...asText.docs, ...asTimestamp.docs].filter((doc) =>
      seen.has(doc.id) ? false : seen.add(doc.id),
    );
    return {
      docs,
      size: Math.max(asText.size, asTimestamp.size),
    };
  }

  function selectedSections() {
    return new Set(
      [...document.querySelectorAll('input[name="report-section"]:checked')].map(
        (input) => input.value,
      ),
    );
  }

  function renderPreview(report) {
    const preview = document.getElementById("report-preview");
    const summary = REPORT_DATA.summarize(report);
    const reportTitle = `Relatório de ${formatDate(report.startDate)} a ${formatDate(report.endDate)}`;
    const cards = [
      ["Abastecido", `${formatNumber(summary.fuelLiters, 1)} L`],
      ["Custo de combustível", formatMoney(summary.fuelCost, report.currency)],
      ["Distância registada", `${formatNumber(summary.tripDistanceKm, 1)} km`],
      [
        "Consumo médio OBD",
        summary.averageConsumption === null
          ? "—"
          : `${formatNumber(summary.averageConsumption, 1)} L/100 km`,
      ],
      ["Reparações", formatMoney(summary.repairCost, report.currency)],
      ["Viagens com check-up", String(report.trips.filter((trip) => trip.diagnostico).length)],
    ];

    let html = `<header class="trip-report-preview-heading"><h3>${escapeHtml(reportTitle)}</h3><p>${escapeHtml(vehicleLabel(report.vehicles))} · Gerado em ${escapeHtml(formatDate(REPORT_DATA.dateKey(report.generatedAt)))}</p></header>`;
    html += `<div class="trip-report-summary-grid">${cards
      .map(
        ([label, value]) =>
          `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`,
      )
      .join("")}</div>`;

    if (report.sections.has("fuel")) {
      html += renderMonthlyChart(summary.monthlyFuelCost, report.currency);
      html += renderHtmlTable("Abastecimentos", [
        "Data",
        "Veículo",
        "Combustível",
        "Litros",
        "€/L",
        "Custo",
        "Odómetro",
        "Posto",
      ], report.fuel.map((item) => [
        formatDate(item.data),
        item.vehicleName,
        item.tipoCombustivel || "—",
        formatNumber(item.litros, 2),
        formatNumber(item.precoPorLitro, 3),
        item.litros && item.precoPorLitro
          ? formatMoney(Number(item.litros) * Number(item.precoPorLitro), report.currency)
          : "—",
        item.odometro ? `${formatNumber(item.odometro, 0)} km` : "—",
        item.posto || "—",
      ]));
    }

    if (report.sections.has("trips")) {
      html += renderHtmlTable("Viagens e saúde OBD", [
        "Fim",
        "Veículo",
        "Distância",
        "Duração",
        "Consumo",
        "Saúde",
        "Qualidade",
        "Achados",
      ], report.trips.map((trip) => [
        formatDate(trip.dataFim),
        trip.vehicleName,
        trip.distancia ? `${formatNumber(trip.distancia, 1)} km` : "—",
        trip.duracao ? `${formatNumber(trip.duracao, 0)} min` : "—",
        trip.consumoMedio ? `${formatNumber(trip.consumoMedio, 1)} L/100 km` : "—",
        healthLabel(trip.diagnostico?.estado),
        qualityLabel(trip.qualidadeDados),
        findingSummary(trip.diagnostico?.achados),
      ]));
    }

    if (report.sections.has("maintenance")) {
      html += renderHtmlTable("Reparações no período", [
        "Data",
        "Veículo",
        "Descrição",
        "Odómetro",
        "Oficina",
        "Custo",
      ], report.repairs.map((item) => [
        formatDate(item.data),
        item.vehicleName,
        item.descricao || "Reparação",
        item.km ? `${formatNumber(item.km, 0)} km` : "—",
        item.oficina || "—",
        formatMoney(item.custo, report.currency),
      ]));
      html += renderHtmlTable("Planos de manutenção (situação atual)", [
        "Veículo",
        "Plano",
        "Último serviço",
        "Intervalo",
      ], report.plans.map((item) => [
        item.vehicleName,
        item.tipo || item.titulo || "Manutenção",
        [item.ultimaData ? formatDate(item.ultimaData) : "", item.ultimoKm ? `${formatNumber(item.ultimoKm, 0)} km` : ""]
          .filter(Boolean)
          .join(" · ") || "—",
        [
          item.intervaloKm ? `${formatNumber(item.intervaloKm, 0)} km` : "",
          item.intervaloMeses ? `${item.intervaloMeses} meses` : "",
        ].filter(Boolean).join(" / ") || "—",
      ]));
      html += '<p class="trip-report-note">Os planos apresentam a configuração atual e não são limitados ao intervalo histórico selecionado.</p>';
    }

    if (report.sections.has("methodology")) {
      html += `<section class="trip-report-methodology"><h4>Metodologia e limites</h4><p>Custos de combustível = litros × preço por litro. Consumo médio OBD = média ponderada pela distância apenas nas viagens com valor disponível. Distância, qualidade e estado de saúde vêm dos resumos guardados; campos ausentes são apresentados como indisponíveis e não são estimados.</p><p>Os achados são indicativos, dependem dos PIDs disponíveis e não substituem diagnóstico profissional. O relatório não inclui coordenadas nem leituras OBD brutas. Dados de reparações e abastecimentos respeitam o intervalo; os planos mostram a situação atual.</p></section>`;
    }

    preview.innerHTML = html;
    preview.hidden = false;
  }

  function renderMonthlyChart(months, currency) {
    if (!months.length) return "";
    const chartMonths = months.slice(-12);
    const max = Math.max(...chartMonths.map((item) => item.cost), 1);
    return `<section class="trip-report-monthly"><h4>Custos de combustível por mês</h4><div class="trip-report-bars">${chartMonths
      .map((item) => {
        const width = Math.max(2, (item.cost / max) * 100);
        return `<div><span>${escapeHtml(monthLabel(item.month))}</span><span class="trip-report-bar-track"><i style="width:${width.toFixed(1)}%"></i></span><strong>${escapeHtml(formatMoney(item.cost, currency))}</strong></div>`;
      })
      .join("")}</div></section>`;
  }

  function renderHtmlTable(title, headers, rows) {
    const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const body = rows.length
      ? rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
          )
          .join("")
      : `<tr><td colspan="${headers.length}">Sem registos neste período.</td></tr>`;
    return `<section class="trip-report-table-section"><h4>${escapeHtml(title)}</h4><div class="trip-report-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  }

  function downloadPdf(report) {
    const Pdf = window.jspdf.jsPDF;
    const doc = new Pdf({ orientation: "portrait", unit: "mm", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      throw new Error("O módulo de tabelas PDF não está carregado.");
    }
    const summary = REPORT_DATA.summarize(report);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const drawPageHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("L100 · Relatório do veículo", margin, 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        `${formatDate(report.startDate)} — ${formatDate(report.endDate)}`,
        pageWidth - margin,
        9,
        { align: "right" },
      );
      doc.setDrawColor(210, 218, 228);
      doc.line(margin, 12, pageWidth - margin, 12);
    };
    const drawPageFooter = () => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Gerado ${formatDate(REPORT_DATA.dateKey(report.generatedAt))} · ${doc.internal.getCurrentPageInfo().pageNumber}/${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 7,
        { align: "right" },
      );
      doc.setTextColor(0);
    };
    const drawSectionTitle = (title, y) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      doc.setFont("helvetica", "normal");
      return y + 3;
    };
    const addTable = (title, headers, rows, y) => {
      y = drawSectionTitle(title, y);
      doc.autoTable({
        head: [headers],
        body: rows.length ? rows : [["Sem registos neste período."]],
        startY: y,
        margin: { left: margin, right: margin, top: 17, bottom: 13 },
        styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [12, 140, 120] },
      });
      return doc.lastAutoTable.finalY + 9;
    };

    doc.setProperties({
      title: "Relatório L100",
      subject: "Resumo de abastecimentos, viagens e manutenção",
      creator: "L100",
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Relatório do veículo", margin, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(vehicleLabel(report.vehicles), margin, 30);
    doc.text(
      `Período: ${formatDate(report.startDate)} a ${formatDate(report.endDate)}`,
      margin,
      35,
    );
    doc.text(
      `Gerado: ${formatDate(REPORT_DATA.dateKey(report.generatedAt))}`,
      margin,
      40,
    );

    let y = 50;
    y = addTable(
      "Resumo",
      ["Indicador", "Valor"],
      [
        ["Combustível abastecido", `${formatNumber(summary.fuelLiters, 1)} L`],
        ["Custo de combustível", formatMoney(summary.fuelCost, report.currency)],
        ["Distância registada", `${formatNumber(summary.tripDistanceKm, 1)} km`],
        [
          "Consumo médio OBD",
          summary.averageConsumption === null
            ? "Indisponível"
            : `${formatNumber(summary.averageConsumption, 1)} L/100 km`,
        ],
        ["Custo de reparações", formatMoney(summary.repairCost, report.currency)],
        ["Viagens com check-up", String(report.trips.filter((trip) => trip.diagnostico).length)],
      ],
      y,
    );

    if (report.sections.has("fuel")) {
      y = drawMonthlyChart(
        doc,
        summary.monthlyFuelCost.slice(-12),
        margin,
        y,
        report.currency,
      );
      y = addTable(
        "Abastecimentos",
        ["Data", "Veículo", "Tipo", "L", "€/L", "Custo", "Km", "Posto"],
        report.fuel.map((item) => [
          formatDate(item.data),
          item.vehicleName,
          item.tipoCombustivel || "—",
          formatNumber(item.litros, 2),
          formatNumber(item.precoPorLitro, 3),
          item.litros && item.precoPorLitro
            ? formatMoney(Number(item.litros) * Number(item.precoPorLitro), report.currency)
            : "—",
          item.odometro ? formatNumber(item.odometro, 0) : "—",
          item.posto || "—",
        ]),
        y,
      );
    }

    if (report.sections.has("trips")) {
      y = addTable(
        "Viagens e saúde OBD",
        ["Fim", "Veículo", "Km", "Min", "L/100 km", "Estado", "Qualidade", "Achados"],
        report.trips.map((trip) => [
          formatDate(trip.dataFim),
          trip.vehicleName,
          trip.distancia ? formatNumber(trip.distancia, 1) : "—",
          trip.duracao ? formatNumber(trip.duracao, 0) : "—",
          trip.consumoMedio ? formatNumber(trip.consumoMedio, 1) : "—",
          healthLabel(trip.diagnostico?.estado),
          qualityLabel(trip.qualidadeDados),
          findingSummary(trip.diagnostico?.achados),
        ]),
        y,
      );
    }

    if (report.sections.has("maintenance")) {
      y = addTable(
        "Reparações no período",
        ["Data", "Veículo", "Descrição", "Km", "Oficina", "Custo"],
        report.repairs.map((item) => [
          formatDate(item.data),
          item.vehicleName,
          item.descricao || "Reparação",
          item.km ? formatNumber(item.km, 0) : "—",
          item.oficina || "—",
          formatMoney(item.custo, report.currency),
        ]),
        y,
      );
      y = addTable(
        "Planos de manutenção (situação atual)",
        ["Veículo", "Plano", "Último serviço", "Intervalo"],
        report.plans.map((item) => [
          item.vehicleName,
          item.tipo || item.titulo || "Manutenção",
          [item.ultimaData ? formatDate(item.ultimaData) : "", item.ultimoKm ? `${formatNumber(item.ultimoKm, 0)} km` : ""]
            .filter(Boolean)
            .join(" · ") || "—",
          [
            item.intervaloKm ? `${formatNumber(item.intervaloKm, 0)} km` : "",
            item.intervaloMeses ? `${item.intervaloMeses} meses` : "",
          ].filter(Boolean).join(" / ") || "—",
        ]),
        y,
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        "Os planos apresentam a configuração atual e não são limitados ao intervalo histórico selecionado.",
        margin,
        y,
        { maxWidth: pageWidth - margin * 2 },
      );
      y += 7;
    }

    if (report.sections.has("methodology")) {
      y = drawSectionTitle("Metodologia e limites", y) + 4;
      const paragraphs = [
        "Custos de combustível = litros × preço por litro. Consumo médio OBD = média ponderada pela distância apenas nas viagens com valor disponível. Distância, qualidade e estado de saúde vêm dos resumos guardados; campos ausentes são apresentados como indisponíveis e não são estimados.",
        "Os achados são indicativos, dependem dos PIDs disponíveis e não substituem diagnóstico profissional. O relatório não inclui coordenadas nem leituras OBD brutas. Dados de reparações e abastecimentos respeitam o intervalo; os planos mostram a situação atual.",
      ];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      paragraphs.forEach((paragraph) => {
        const lines = doc.splitTextToSize(paragraph, pageWidth - margin * 2);
        if (y + lines.length * 4 > 275) {
          doc.addPage();
          y = 20;
        }
        doc.text(lines, margin, y);
        y += lines.length * 4 + 4;
      });
    }

    for (let page = 1; page <= doc.internal.getNumberOfPages(); page += 1) {
      doc.setPage(page);
      drawPageHeader();
      drawPageFooter();
    }
    const filename = `L100-relatorio-${safeFilename(report.startDate)}-${safeFilename(report.endDate)}.pdf`;
    savePdfBlob(doc.output("blob"), filename);
    return filename;
  }

  // Transfere o PDF. No iOS em modo app (ecrã principal) o atributo download
  // não funciona: abre o PDF num separador para guardar/partilhar.
  function savePdfBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const isIosStandalone =
      window.navigator.standalone === true &&
      /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIosStandalone || !("download" in HTMLAnchorElement.prototype)) {
      window.open(url, "_blank");
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // As bibliotecas vêm da CDN com `defer`. Se ainda não chegaram ou falharam,
  // tenta carregá-las agora (o service worker serve-as da cache se offline).
  const PDF_LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js",
  ];

  const PDF_LIB_TIMEOUT_MS = 10_000;

  async function ensurePdfLibraries() {
    if (hasPdfLibraries()) return true;
    try {
      for (const src of PDF_LIBS) {
        if (src.includes("autotable") ? hasPdfLibraries() : window.jspdf?.jsPDF) continue;
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          const timer = setTimeout(
            () => reject(new Error(`Tempo esgotado a carregar ${src}`)),
            PDF_LIB_TIMEOUT_MS,
          );
          script.src = src;
          script.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          script.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`Falhou ${src}`));
          };
          document.head.appendChild(script);
        });
      }
    } catch (error) {
      console.warn("[TripReport] Bibliotecas PDF indisponíveis:", error);
    }
    return hasPdfLibraries();
  }

  function drawMonthlyChart(doc, months, margin, y, currency) {
    if (!months.length) return y;
    const pageWidth = doc.internal.pageSize.getWidth();
    if (y > 235) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Custos de combustível por mês (últimos 12 meses)", margin, y + 4);
    const max = Math.max(...months.map((item) => item.cost), 1);
    const chartWidth = pageWidth - margin * 2 - 55;
    const barHeight = Math.min(5, 64 / months.length);
    months.forEach((item, index) => {
      const rowY = y + 10 + index * (barHeight + 1.5);
      const valueWidth = (item.cost / max) * chartWidth;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(monthLabel(item.month), margin, rowY + barHeight - 1);
      doc.setFillColor(12, 140, 120);
      doc.rect(margin + 22, rowY, Math.max(1, valueWidth), barHeight, "F");
      doc.text(
        formatMoney(item.cost, currency),
        margin + 24 + chartWidth,
        rowY + barHeight - 1,
      );
    });
    return y + 20 + months.length * (barHeight + 1.5);
  }

  function monthLabel(key) {
    const [year, month] = String(key).split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return String(key);
    return date.toLocaleDateString("pt-PT", { month: "short", year: "numeric" }).replace(".", "");
  }

  function vehicleLabel(vehicles) {
    return vehicles.length === 1
      ? [vehicles[0].marca, vehicles[0].modelo, vehicles[0].nome]
          .filter(Boolean)
          .join(" ") || "Veículo selecionado"
      : `${vehicles.length} veículos`;
  }

  function findingSummary(findings) {
    if (!Array.isArray(findings) || !findings.length) return "Sem achados";
    return findings
      .slice(0, 3)
      .map((finding) => finding.acaoRecomendada || finding.ruleId || "Achado")
      .join("; ");
  }

  function healthLabel(state) {
    const labels = {
      normal: "Sem alerta",
      verificar: "Verificar",
      a_vigiar: "A vigiar",
      indisponivel: "Indisponível",
      dados_insuficientes: "Dados insuficientes",
    };
    return labels[state] || "Sem check-up";
  }

  function qualityLabel(quality) {
    if (!quality) return "—";
    const coverage = Number(quality.cobertura);
    return Number.isFinite(coverage)
      ? `${quality.estado || "—"} (${Math.round(coverage * 100)}%)`
      : quality.estado || "—";
  }

  function formatMoney(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    try {
      return new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: /^[A-Z]{3}$/.test(currency || "") ? currency : "EUR",
      }).format(number);
    } catch (error) {
      console.error("[TripReport] Moeda inválida:", error);
      return `${number.toFixed(2)} EUR`;
    }
  }

  function formatNumber(value, decimals) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString("pt-PT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  function formatDate(value) {
    const key = REPORT_DATA.dateKey(value);
    if (!key) return "—";
    const date = new Date(`${key}T12:00:00`);
    return date.toLocaleDateString("pt-PT");
  }

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function safeFilename(value) {
    return String(value).replace(/[^0-9-]/g, "");
  }

  function hasPdfLibraries() {
    const Pdf = window.jspdf?.jsPDF;
    return Boolean(Pdf && typeof Pdf.API?.autoTable === "function");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });
  }

  function setStatus(message) {
    const status = document.getElementById("report-status");
    if (status) status.textContent = message;
  }
})();
