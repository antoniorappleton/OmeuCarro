/**
 * js/analytics.js
 * Pure logic for vehicle analytics (Fuel Consumption, Pace, Estimates).
 * Exposed via window.Analytics to avoid module complexity in legacy codebase.
 */
(function (exports) {
  "use strict";

  /**
   * Calculates fuel consumption based on refueling history.
   * Prioritizes "Full-to-Full" method. Falls back to "Segment" method.
   *
   * @param {Array} abastecimentos - Sorted by odometer (asc) is best, but function will sort.
   * @returns {Object} { averageL100, confidence, method, samples }
   */
  function calculateConsumption(abastecimentos) {
    if (!abastecimentos || abastecimentos.length < 2) {
      return { averageL100: null, confidence: null, method: null, samples: 0 };
    }

    // 1. Sort and Clean
    // Filter invalid records: no liters, no odometer
    const clean = abastecimentos
      .filter((a) => a.litros > 0 && a.odometro > 0)
      .sort((a, b) => a.odometro - b.odometro);

    if (clean.length < 2) {
      return { averageL100: null, confidence: null, method: null, samples: 0 };
    }

    // Check for regressions (sanity check)
    const validSequence = [];
    let maxOdo = 0;
    for (const r of clean) {
      if (r.odometro >= maxOdo) {
        validSequence.push(r);
        maxOdo = r.odometro;
      }
    }

    if (validSequence.length < 2) {
      return { averageL100: null, confidence: null, method: null, samples: 0 };
    }

    // --- METHOD A: Full-to-Full (Cheio -> Cheio) ---
    // We look for segments starting at a Full tank and ending at a Full tank.
    // Intermediate partial fills are summed up into the "usage".

    let fullToFullSamples = [];
    let currentSegmentLiters = 0;
    let startNode = null;

    for (const record of validSequence) {
      if (record.completo) {
        if (startNode) {
          // Close the segment
          const dist = record.odometro - startNode.odometro;
          // Liters used is the sum of all fills in (start, end]
          // (The liters of the *start* record filled the previous segment, so we don't count them for this segment.
          // We count the liters of *this* record and any intermediates)
          const litersUsed = currentSegmentLiters + record.litros;

          if (dist > 0 && litersUsed > 0) {
            const l100 = (litersUsed / dist) * 100;
            // Sanity filter
            if (l100 > 2 && l100 < 35) {
              fullToFullSamples.push({ l100, dist, date: record.data });
            }
          }
        }
        // Start new segment
        startNode = record;
        currentSegmentLiters = 0;
      } else {
        // Partial fill
        if (startNode) {
          currentSegmentLiters += record.litros;
        }
      }
    }

    // Determine if we use Full-to-Full
    if (fullToFullSamples.length >= 1) {
      // METHOD A (REFINED): Weighted Average of ALL valid Full-to-Full segments.
      // Formula: (Sum of all Liters / Sum of all Km) * 100
      // This is more robust against outlier segments (e.g. very short trips between fills).

      let totalDist = 0;
      let totalLiters = 0;

      for (const s of fullToFullSamples) {
        totalDist += s.dist;
        // Liter for segment is (s.l100 / 100) * s.dist?
        // Wait, we stored { l100, dist }. We can derive liters or just calculate properly above.
        // Let's optimize: In the loop above we had litersUsed.
        // But we didn't store it in 'fullToFullSamples'.
        // Re-deriving:
        const lit = (s.l100 * s.dist) / 100;
        totalLiters += lit;
      }

      let weightedAvg = 0;
      if (totalDist > 0) {
        weightedAvg = (totalLiters / totalDist) * 100;
      }

      return {
        averageL100: parseFloat(weightedAvg.toFixed(2)),
        confidence: fullToFullSamples.length >= 3 ? "alta" : "media",
        method: "cheio-cheio-ponderada", // Updated method name
        samples: fullToFullSamples.length,
        totalDist: totalDist,
        totalLiters: totalLiters,
      };
    }

    // --- METHOD B: Consecutive Segments (Fallback) ---
    // Simply (Liters / DeltaKm) for consecutive records.
    // Only valid if we assume the user maintains roughly same tank level or fills randomly.
    // Much less accurate, but gives *something*.

    const segmentSamples = [];
    let methodBDist = 0;
    let methodBLiters = 0;

    for (let i = 1; i < validSequence.length; i++) {
      const prev = validSequence[i - 1];
      const curr = validSequence[i];
      const dist = curr.odometro - prev.odometro;

      if (dist > 0) {
        const l100 = (curr.litros / dist) * 100;
        // Tighter outlier filter for this messy method
        if (l100 > 3 && l100 < 25) {
          segmentSamples.push(l100);
          methodBDist += dist;
          methodBLiters += curr.litros;
        }
      }
    }

    if (segmentSamples.length > 0) {
      const recent = segmentSamples.slice(-8);
      const sum = recent.reduce((a, b) => a + b, 0);
      const avg = sum / recent.length;

      return {
        averageL100: parseFloat(avg.toFixed(2)),
        confidence: "baixa",
        method: "segmentos",
        samples: segmentSamples.length,
        totalDist: methodBDist,
        totalLiters: methodBLiters,
      };
    }

    return {
      averageL100: null,
      confidence: null,
      method: null,
      samples: 0,
      totalDist: 0,
      totalLiters: 0,
    };
  }

  /**
   * Calculates daily driving pace (km/day).
   *
   * @param {Array} abastecimentos
   * @param {number} windowDays - Look back window (default 30 seems too short for low usage, lets try 60 or dynamic)
   *                              Actually, spec says default 30.
   * @returns {Object} { kmPerDay, samples }
   */
  function calculateDrivingPace(abastecimentos, windowDays = 45) {
    if (!abastecimentos || abastecimentos.length < 2)
      return { kmPerDay: null, samples: 0 };

    // Sort by date desc to get recent window
    // Note: abastecimentos might have mixed types of dates (string vs Timestamp).
    // We assume we can parse them.
    const sorted = [...abastecimentos].sort(
      (a, b) => new Date(a.data) - new Date(b.data),
    );

    // Filter valid odometer sequence
    const series = [];
    let maxOdo = 0;
    for (const r of sorted) {
      if (r.odometro && r.odometro > maxOdo) {
        series.push({ date: new Date(r.data), odo: r.odometro });
        maxOdo = r.odometro;
      }
    }

    if (series.length < 2) return { kmPerDay: null, samples: 0 };

    // Calculate average pace over window
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - windowDays);

    // Find samples within window (plus one before to establish start delta)
    // If user hasn't refueled in 30 days, we might need to look further back?
    // Let's take the last N segments regardless of window if window is empty,
    // or just strict window. Strict window is safer for "current" pace.

    let validPairs = [];

    // Calculate pairs
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const curr = series[i];

      // STRICT WINDOW FILTER:
      // Only consider segments where the 'current' reading falls within the window.
      if (curr.date < cutoff) continue;

      const daysDiff = (curr.date - prev.date) / (1000 * 60 * 60 * 24);
      const kmDiff = curr.odo - prev.odo;

      if (daysDiff > 0.5 && kmDiff > 0) {
        // at least half a day
        validPairs.push({ kmPerDay: kmDiff / daysDiff, date: curr.date });
      }
    }

    if (validPairs.length === 0) return { kmPerDay: null, samples: 0 };

    // Take last 5 estimates
    const recent = validPairs.slice(-5);
    const avg = recent.reduce((acc, v) => acc + v.kmPerDay, 0) / recent.length;

    return {
      kmPerDay: parseFloat(avg.toFixed(1)),
      samples: recent.length,
    };
  }

  /**
   * Calculates Range and Estimates.
   */
  function calculateEstimates(veiculo, analyticsRaw, odometroAtual) {
    // Safe access to analytics
    const l100 = analyticsRaw ? analyticsRaw.averageL100 : null;
    const kmDay = analyticsRaw ? analyticsRaw.kmPerDay : null;

    // Defaults
    const result = {
      litrosRestantesEstimado: null,
      kmAteReservaEstimado: null,
      diasAteReservaEstimado: null,
      alertaFuelNivel: "none",
      reservaLitros: 7, // Default
      reasonUnavailable: null,
    };

    // 1. Check Capacity
    const capacity = veiculo.capacidadeDepositoLitros
      ? Number(veiculo.capacidadeDepositoLitros)
      : 0;
    if (!capacity || capacity <= 0) {
      result.reasonUnavailable = "missing_tank_capacity";
      return result;
    }

    // 2. Check Consumption
    if (!l100) {
      result.reasonUnavailable = "insufficient_history";
      return result;
    }

    // 3. Find Reference Point (Last Full Tank)
    // We need the *last* known Full Tank odometer.
    // Since this function doesn't receive the raw list presumably (it receives analytics obj),
    // we actually need the latest state.
    // Wait, the spec says "calculateEstimates(veiculo, analytics)".
    // But analytics *stores* the estimates.
    // So this logic should actually be part of "generateAnalytics".
    // However, if we do it here as a helper, we need the "reference odometer" passed in.
    // Let's assume the caller ("generateAnalytics") will do the heavy lifting of finding the last full tank
    // and pass the necessary context, OR we change the signature.
    // The Spec says: `calculateEstimates(veiculo, analytics)` -> but pure estimates depend on "KM driven since last full".
    // So we probably need `lastFullOdometer` or the full list.
    // I will adhere to: `generateAnalytics` orchestrates this.
    return result;
  }

  /**
   * Orchestrator
   */
  function generateAnalytics(veiculo, abastecimentos) {
    const odoAtual = veiculo.odometroAtual || 0;

    // 1. Consumption
    const consResult = calculateConsumption(abastecimentos);

    // 2. Pace
    const paceResult = calculateDrivingPace(abastecimentos);

    // --- ESTIMATIVAS + ALERTA (Final Step) ---
    const reservaLitros = 7;

    // defaults
    let litrosRestantesEstimado = null;
    let kmAteReservaEstimado = null;
    let diasAteReservaEstimado = null;
    let alertaFuelNivel = "none";
    let alertaFuelAtivo = false;
    let reasonUnavailable = null;

    // Pré-requisitos
    const capacidade = Number(veiculo?.capacidadeDepositoLitros || 0);
    const odometroAtual = Number(veiculo?.odometroAtual || 0);
    const consumoMedioL100 = Number(consResult?.averageL100 || 0);
    const kmDiaMedio = Number(paceResult?.kmPerDay || 0);

    if (!capacidade || capacidade <= 0)
      reasonUnavailable = "missing_tank_capacity";
    else if (!odometroAtual || odometroAtual <= 0)
      reasonUnavailable = "missing_odometer";
    else if (!consumoMedioL100 || consumoMedioL100 <= 0)
      reasonUnavailable = "missing_consumption";

    let lastFull = null;
    let sorted = []; // Declare in outer scope

    if (!reasonUnavailable) {
      // abastecimentos já devem vir ordenados por odometro desc (se não, ordenar aqui)
      sorted = [...(abastecimentos || [])].sort(
        (a, b) => (Number(b.odometro) || 0) - (Number(a.odometro) || 0),
      );
      // Relaxed check for "full" status to handle Firestore data inconsistencies (strings/numbers)
      const isFull = (r) =>
        r.completo === true ||
        r.completo === "true" ||
        r.completo === 1 ||
        r.depositoCheio === true;

      lastFull = sorted.find(isFull) || null;

      if (!lastFull) reasonUnavailable = "missing_full_refuel";
    }

    if (!reasonUnavailable) {
      // Robust number parsing (handle "121 122")
      const parseNum = (v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string")
          return Number(v.replace(/\s+/g, "").replace(",", "."));
        return 0;
      };

      const odoFull = parseNum(lastFull.odometro);
      const kmDesdeUltimoCheio = odometroAtual - odoFull;

      if (kmDesdeUltimoCheio < 0) {
        reasonUnavailable = "invalid_km_since_full";
      } else {
        const litrosConsumidosTeorico =
          (kmDesdeUltimoCheio * consumoMedioL100) / 100;

        // Sum partial fills since last full tank
        let litrosAdicionadosPosteriormente = 0;

        for (const r of sorted) {
          if (r.id === lastFull.id) break;
          const lit = parseNum(r.litros);
          if (lit > 0) {
            litrosAdicionadosPosteriormente += lit;
          }
        }

        let litrosRestantes =
          capacidade -
          litrosConsumidosTeorico +
          litrosAdicionadosPosteriormente;

        // clamp
        litrosRestantes = Math.max(0, Math.min(capacidade, litrosRestantes));

        litrosRestantesEstimado = Number(litrosRestantes.toFixed(1));

        const litrosAteReserva = Math.max(litrosRestantes - reservaLitros, 0);
        const kmAteReserva = (litrosAteReserva / consumoMedioL100) * 100;

        kmAteReservaEstimado = Number(kmAteReserva.toFixed(0));

        if (kmDiaMedio > 0) {
          diasAteReservaEstimado = Number(
            (kmAteReserva / kmDiaMedio).toFixed(1),
          );
        } else {
          diasAteReservaEstimado = null;
        }

        // Alert rules
        if (litrosRestantes <= reservaLitros) {
          alertaFuelNivel = "critical";
        } else if (
          litrosRestantes <= reservaLitros + 2 ||
          (diasAteReservaEstimado !== null && diasAteReservaEstimado <= 2)
        ) {
          alertaFuelNivel = "warning";
        } else {
          alertaFuelNivel = "none";
        }

        alertaFuelAtivo = alertaFuelNivel !== "none";
      }
    }

    // Final payload matches requested structure
    return {
      atualizadoEm: new Date().toISOString(),

      consumoMedioL100: consResult.averageL100,
      consumoMetodo: consResult.method,
      consumoConfianca: consResult.confidence,
      consumoAmostras: consResult.samples,

      kmDiaMedio: paceResult.kmPerDay,
      kmDiaAmostras: paceResult.samples,

      reservaLitros,
      litrosRestantesEstimado,
      kmAteReservaEstimado,
      diasAteReservaEstimado,
      alertaFuelAtivo,
      alertaFuelNivel,
      reasonUnavailable,
    };
  }

  /**
   * Calculates Financial Metrics (Total Cost, Cost/Km).
   * Uses "Real World" totals (Everything spent / Total Distance driven).
   *
   * @param {Object} veiculo - Vehicle object (needs odometroAtual, odometroInicial)
   * @param {Array} abastecimentos - All refueling records
   * @param {Array} reparacoes - All maintenance records
   * @returns {Object} { totalSpent, totalFuelCost, totalMaintCost, totalDist, costPerKm }
   */
  function calculateCostMetrics(veiculo, abastecimentos, reparacoes) {
    if (!veiculo) return null;

    // 1. Total Distance (Real Odometer Difference)
    const currentOdo = Number(veiculo.odometroAtual) || Number(veiculo.odometroInicial) || 0;
    const initialOdo = Number(veiculo.odometroInicial) || 0;
    let totalDist = currentOdo - initialOdo;
    if (totalDist < 0) totalDist = 0;

    // 2. Total Fuel Cost
    let totalFuelCost = 0;
    let totalLitros = 0;
    if (abastecimentos && Array.isArray(abastecimentos)) {
      for (const a of abastecimentos) {
        const l = Number(a.litros) || 0;
        const p = Number(a.precoPorLitro) || 0;
        totalFuelCost += l * p;
        totalLitros += l;
      }
    }

    // 3. Total Maintenance Cost
    let totalMaintCost = 0;
    if (reparacoes && Array.isArray(reparacoes)) {
      for (const r of reparacoes) {
        totalMaintCost += Number(r.custo) || 0;
      }
    }

    // 4. Aggregates
    const totalSpent = totalFuelCost + totalMaintCost;
    let costPerKm = 0;

    if (totalDist > 0) {
      costPerKm = totalSpent / totalDist;
    }

    return {
      totalSpent,
      totalFuelCost,
      totalMaintCost,
      totalLitros, // Useful for general stats
      totalDist,
      costPerKm,
    };
  }

  // Expose logic
  exports.Analytics = {
    calculateConsumption,
    calculateDrivingPace,
    calculateCostMetrics,
    generateAnalytics,
  };
})(window);
