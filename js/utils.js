let deferredPrompt = null;

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

function formatConsumption(value, unit = "L/100km") {
  return `${Number(value).toFixed(1)} ${unit}`;
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
window.formatConsumption = formatConsumption;
window.calculateEfficiency = calculateEfficiency;
