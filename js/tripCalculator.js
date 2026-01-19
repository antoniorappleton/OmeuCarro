/**
 * Trip Calculator Module
 * Handles UI interactions and calculations for the trip cost estimator.
 */

// Logic from original Module, adapted for internal use
const CalculatorLogic = {
  calculate(params) {
    const {
      consumo = 0,
      precoLitro = 0,
      distancia = 0,
      viagens = 1,
      portagens = 0,
      pessoas = 1
    } = params;

    // Validate required inputs
    if (consumo <= 0 || precoLitro <= 0 || distancia <= 0) {
      return null;
    }

    const kmTotal = distancia * viagens;
    const litros = (consumo * kmTotal) / 100;
    const custoCombustivel = litros * precoLitro;
    const custoPortagens = portagens * viagens;
    const custoTotal = custoCombustivel + custoPortagens;
    const custoPorPessoa = pessoas > 0 ? custoTotal / pessoas : custoTotal;
    const custoPor100km = kmTotal > 0 ? (custoTotal / kmTotal) * 100 : 0;

    return {
      kmTotal,
      litros,
      custoCombustivel,
      custoPortagens,
      custoTotal,
      custoPorPessoa,
      custoPor100km
    };
  },

  formatCurrency(val) {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(val);
  },

  formatNumber(val, decimals = 1) {
    return val.toLocaleString('pt-PT', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
};

let isInitialized = false;

// UI Controller
export function initTripCalculator() {
  if (isInitialized) {
      console.log("[TripCalculator] Already initialized, skipping.");
      return;
  }
  
  const consumptionInput = document.getElementById('trip-consumo');
  if (!consumptionInput) {
      console.warn("[TripCalculator] UI elements not found. View might not be loaded yet.");
      return;
  }
  
  console.log("[TripCalculator] Initializing...");

  // Inputs
  const inputs = {
    consumo: document.getElementById('trip-consumo'),
    preco: document.getElementById('trip-preco'),
    distancia: document.getElementById('trip-distancia'),
    viagens: document.getElementById('trip-viagens'),
    portagens: document.getElementById('trip-portagens'),
    pessoas: document.getElementById('trip-pessoas')
  };

  // Outputs
  const outputs = {
    total: document.getElementById('trip-result-total'),
    fuel: document.getElementById('trip-result-fuel'),
    tolls: document.getElementById('trip-result-tolls'),
    person: document.getElementById('trip-result-person'),
    km: document.getElementById('trip-metric-km'),
    liters: document.getElementById('trip-metric-liters'),
    cost100: document.getElementById('trip-metric-cost100')
  };

  const btnClear = document.getElementById('btn-trip-clear');
  const btnMaps = document.getElementById('btn-trip-maps');

  // State
  const defaults = {
    viagens: 1,
    pessoas: 1,
    portagens: 0
  };

  function getValues() {
    return {
      consumo: parseFloat(inputs.consumo.value) || 0,
      precoLitro: parseFloat(inputs.preco.value) || 0,
      distancia: parseFloat(inputs.distancia.value) || 0,
      viagens: parseInt(inputs.viagens.value) || defaults.viagens,
      portagens: parseFloat(inputs.portagens.value) || defaults.portagens,
      pessoas: parseInt(inputs.pessoas.value) || defaults.pessoas
    };
  }

  function updateUI() {
    const values = getValues();
    const results = CalculatorLogic.calculate(values);

    if (results) {
      // Valid results
      outputs.total.textContent = CalculatorLogic.formatCurrency(results.custoTotal);
      outputs.fuel.textContent = CalculatorLogic.formatCurrency(results.custoCombustivel);
      outputs.tolls.textContent = CalculatorLogic.formatCurrency(results.custoPortagens);
      outputs.person.textContent = CalculatorLogic.formatCurrency(results.custoPorPessoa);
      
      outputs.km.textContent = `${CalculatorLogic.formatNumber(results.kmTotal, 0)} km`;
      outputs.liters.textContent = `${CalculatorLogic.formatNumber(results.litros, 1)} L`;
      outputs.cost100.textContent = `${CalculatorLogic.formatCurrency(results.custoPor100km)}/100km`;

      // Enable Map Button
      if (btnMaps) {
        btnMaps.disabled = false;
        btnMaps.classList.remove('btn-secondary'); 
        btnMaps.classList.add('btn-primary');
      }
    } else {
      // Invalid or incomplete
      resetResults();
      if (btnMaps) btnMaps.disabled = true;
    }
  }

  function resetResults() {
    outputs.total.textContent = '€0,00';
    outputs.fuel.textContent = '€0,00';
    outputs.tolls.textContent = '€0,00';
    outputs.person.textContent = '€0,00';
    
    outputs.km.textContent = '-- km';
    outputs.liters.textContent = '-- L';
    outputs.cost100.textContent = '--/100km';
    
    if (btnMaps) btnMaps.disabled = true;
  }

  function clearInputs() {
    inputs.consumo.value = '';
    inputs.preco.value = '';
    inputs.distancia.value = '';
    inputs.viagens.value = defaults.viagens;
    inputs.portagens.value = ''; 
    inputs.pessoas.value = defaults.pessoas;
    resetResults();
  }

  function openMaps() {
    window.open('https://www.google.com/maps', '_blank');
  }

  // Event Listeners
  Object.values(inputs).forEach(input => {
    if (input) input.addEventListener('input', updateUI);
  });

  if (btnClear) btnClear.addEventListener('click', clearInputs);
  if (btnMaps) btnMaps.addEventListener('click', openMaps);

  // Initial State
  resetResults();
  isInitialized = true;
  console.log("[TripCalculator] Initialized successfully");
};
