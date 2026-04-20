let deferredPrompt = null;

// PANIC SWITCH: ?nocache=1 -- Forces SW unregister and Cache clear
if (window.location.search.includes("nocache=1")) {
  console.warn("PANIC SWITCH ACTIVATED: Clearing SW and Caches");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
      console.log("SW Unregistered");
    });
  }
  caches.keys().then((names) => {
    Promise.all(names.map((name) => caches.delete(name))).then(() => {
      console.log("Caches Deleted");
      alert("Cache limpa! A reiniciar...");
      window.location.href = window.location.pathname;
    });
  });
}

window.addEventListener("beforeinstallprompt", (e) => {
  // impede o popup “fugaz”
  e.preventDefault();
  deferredPrompt = e;

  // aqui mostras um botão teu "Instalar"
  const btn = document.getElementById("btn-install");
  if (btn) btn.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  const btn = document.getElementById("btn-install");
  if (btn) btn.classList.add("hidden");
});

// chama isto no click do teu botão
async function instalarPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
}
window.instalarPWA = instalarPWA;

// ======================================================================
// HELPERS DE FORMATAÇÃO E CÁLCULO
// ======================================================================

const CURRENCY_SYMBOLS = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  BRL: "R$",
};

function getCurrencySymbol(currencyCode) {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

function formatCurrency(value, currencyCode = "EUR") {
  const symbol = getCurrencySymbol(currencyCode);
  return `${symbol}${Number(value).toFixed(2)}`;
}

function formatNumber(value, decimals = 1) {
  const n = Number(value);
  if (isNaN(n)) return "0";
  // Se for inteiro, não precisa de casas decimais?
  // O utilizador pediu "todos os valores NÃO-INTEIROS... arredondar a 1 casa".
  // Se for inteiro (ex: 100), deve converter para 100.0 ou ficar 100?
  // Geralmente em apps, consistência visual prefere 100.0 se for métrica contínua.
  // Contudo, "non-integer" implies check.

  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(decimals);
}

function formatConsumption(value, unit = "L/100km") {
  // Forçar 1 casa decimal
  return `${formatNumber(value, 1)} ${unit}`;
}

function formatDistance(value, unit = "km") {
  return `${formatNumber(value, 1)} ${unit}`;
}

function formatVolume(value, unit = "L") {
  return `${formatNumber(value, 1)} ${unit}`;
}

/**
 * Calcula a eficiência com base na unidade preferida.
 * - L/100km: (Litros / km) * 100
 * - km/L: km / Litros
 * - mpg (US): (km * 0.621371) / (Litros * 0.264172) -> simplificando: (km / Litros) * 2.35215
 *
 * @param {number} km Distância percorrida
 * @param {number} liters Litros consumidos
 * @param {string} unit Unidade preferida ('L/100km', 'km/L', 'mpg')
 * @returns {number} Valor da eficiência (ou null se inválido)
 */
function calculateEfficiency(km, liters, unit = "L/100km") {
  if (!km || !liters || liters <= 0) return null;

  switch (unit) {
    case "km/L":
      return km / liters;
    case "mpg":
      // mpg = (miles) / (gallons)
      // 1 km = 0.621371 miles
      // 1 L = 0.264172 gallons
      return (km * 0.621371) / (liters * 0.264172);
    case "L/100km":
    default:
      return (liters / km) * 100;
  }
}

// Exportar globalmente (já que nao usamos modules estritos aqui)
window.getCurrencySymbol = getCurrencySymbol;
window.formatCurrency = formatCurrency;
window.formatNumber = formatNumber;
window.formatConsumption = formatConsumption;
window.formatDistance = formatDistance;
window.formatVolume = formatVolume;
window.calculateEfficiency = calculateEfficiency;
window.calculateMaintenanceStatus = calculateMaintenanceStatus;

/**
 * Calcula estado da manutenção (ok, warning, delayed).
 *
 * @param {number} currentKm Odómetro atual do carro
 * @param {number} lastKm Odómetro na ultima manutenção
 * @param {number} intervalKm Intervalo em Km (ex: 10000)
 * @param {string} lastDate Data da ultima manutenção (YYYY-MM-DD)
 * @param {number} intervalMonths Intervalo em meses (ex: 12)
 */
function calculateMaintenanceStatus(
  currentKm,
  lastKm,
  intervalKm,
  lastDate,
  intervalMonths,
) {
  const result = {
    status: "ok", // ok, warning, delayed
    labelKm: "",
    labelDate: "",
    nextKm: null,
    nextDate: null,
    diffKm: 0,
    diffDays: 0,
  };

  // 1. KM Calc
  if (intervalKm && !isNaN(intervalKm)) {
    const pKm = Number(lastKm || 0) + Number(intervalKm);
    result.nextKm = Number(pKm.toFixed(1));
    result.diffKm = Number((pKm - (currentKm || 0)).toFixed(1));
  }

  // 2. Date Calc
  if (intervalMonths && !isNaN(intervalMonths) && lastDate) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + Number(intervalMonths));
    result.nextDate = d;

    const now = new Date();
    // Diff in days
    const diffTime = d - now;
    result.diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // 3. Determine Status
  // Priority: Delayed (Red) > Warning (Yellow) > OK (Green)

  let isDelayed = false;
  let isWarning = false;

  // Check Km
  if (result.nextKm !== null) {
    if (result.diffKm < 0) isDelayed = true;
    else if (result.diffKm < 1000) isWarning = true; // Warning if < 1000km left
  }

  // Check Days
  if (result.nextDate !== null) {
    if (result.diffDays < 0) isDelayed = true;
    else if (result.diffDays < 30) isWarning = true; // Warning if < 30 days left
  }

  if (isDelayed) result.status = "delayed";
  else if (isWarning) result.status = "warning";
  else result.status = "ok";

  return result;
}

/**
 * Global Toast Notification
 * @param {string} msg Mensagem a exibir
 * @param {string} type 'info', 'success', 'error'
 */
function showToast(msg, type = "info") {
  let container = document.getElementById("global-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "global-toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;

  container.appendChild(el);

  // Animate In
  requestAnimationFrame(() => el.classList.add("visible"));

  // Auto Dismiss
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

/**
 * Generates a simple deterministic ID for Firebase docs
 * (Consistent string representation of inputs)
 */
function generateDeterministicId(...parts) {
  return parts.map((p) => String(p).replace(/[^a-zA-Z0-9]/g, "")).join("_");
}

window.generateDeterministicId = generateDeterministicId;
window.showToast = showToast;
