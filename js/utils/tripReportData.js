(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) root.TripReportData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function dateFrom(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (value && typeof value.toDate === "function") {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (value && Number.isFinite(value.seconds)) {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(value < 1e12 ? value * 1000 : value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  function dateKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const date = dateFrom(value);
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function filterByPeriod(records, dateField, startDate, endDate) {
    return records.filter((record) => {
      const key = dateKey(record[dateField]);
      return Boolean(key && key >= startDate && key <= endDate);
    });
  }

  function summarize({ fuel = [], trips = [], repairs = [] } = {}) {
    let fuelLiters = 0;
    let fuelCost = 0;
    let repairCost = 0;
    let tripDistanceKm = 0;
    let consumptionDistanceKm = 0;
    let weightedConsumption = 0;
    const healthStates = {};
    const monthTotals = new Map();

    fuel.forEach((record) => {
      const liters = numberOrNull(record.litros);
      const price = numberOrNull(record.precoPorLitro);
      if (liters !== null && liters > 0) fuelLiters += liters;
      if (liters !== null && liters > 0 && price !== null && price >= 0) {
        const cost = liters * price;
        fuelCost += cost;
        const month = dateKey(record.data)?.slice(0, 7);
        if (month) monthTotals.set(month, (monthTotals.get(month) || 0) + cost);
      }
    });

    trips.forEach((trip) => {
      const distance = numberOrNull(trip.distancia);
      const consumption = numberOrNull(trip.consumoMedio);
      if (distance !== null && distance > 0) {
        tripDistanceKm += distance;
        if (consumption !== null && consumption > 0) {
          weightedConsumption += consumption * distance;
          consumptionDistanceKm += distance;
        }
      }
      const state = trip.diagnostico?.estado;
      if (state) healthStates[state] = (healthStates[state] || 0) + 1;
    });

    repairs.forEach((repair) => {
      const cost = numberOrNull(repair.custo);
      if (cost !== null && cost > 0) repairCost += cost;
    });

    return {
      fuelLiters,
      fuelCost,
      repairCost,
      tripDistanceKm,
      averageConsumption:
        consumptionDistanceKm > 0
          ? weightedConsumption / consumptionDistanceKm
          : null,
      healthStates,
      monthlyFuelCost: [...monthTotals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, cost]) => ({ month, cost })),
    };
  }

  return { dateFrom, dateKey, filterByPeriod, summarize };
});
