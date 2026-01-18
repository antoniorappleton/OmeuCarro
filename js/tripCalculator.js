/**
 * tripCalculator.js
 * Módulo para cálculo de custos de viagem (PWA).
 */

export const TripCalculator = {
  /**
   * Calcula os custos de uma viagem com base nos inputs.
   * Todos os inputs são validados/convertidos para float/int.
   *
   * @param {Object} data
   * @param {number|string} data.consumo - L/100km
   * @param {number|string} data.precoLitro - €/L
   * @param {number|string} data.km - Km por viagem (ida)
   * @param {number|string} data.viagens - N.º de viagens (default 1)
   * @param {number|string} data.portagens - € por viagem (default 0)
   * @param {number|string} data.pessoas - N.º de pessoas para dividir (default 1)
   *
   * @returns {Object} Resultado formatado e valores brutos
   */
  calculate(data) {
    // 1. Normalizar Inputs
    const consumo = parseFloat(data.consumo) || 0;
    const precoLitro = parseFloat(data.precoLitro) || 0;
    const km = parseFloat(data.km) || 0;
    const viagens = parseInt(data.viagens) || 1;
    const portagens = parseFloat(data.portagens) || 0;
    const pessoas = parseInt(data.pessoas) || 1;

    // Evitar divisão por zero ou pessoas < 1
    const nPessoas = pessoas < 1 ? 1 : pessoas;

    // 2. Cálculos
    const kmTotais = km * viagens;
    const litrosTotais = (consumo * kmTotais) / 100;
    const custoCombustivel = litrosTotais * precoLitro;
    const portagensTotais = portagens * viagens;
    const custoTotal = custoCombustivel + portagensTotais;
    const custoPorPessoa = custoTotal / nPessoas;

    // 3. Output
    return {
      kmTotais: parseFloat(kmTotais.toFixed(1)),
      litrosTotais: parseFloat(litrosTotais.toFixed(1)),
      portagensTotais: parseFloat(portagensTotais.toFixed(2)),
      custoCombustivel: parseFloat(custoCombustivel.toFixed(2)),
      custoTotal: parseFloat(custoTotal.toFixed(2)),
      custoPorPessoa: parseFloat(custoPorPessoa.toFixed(2)),

      // Valores originais usados (para debug se necessário)
      _inputs: { consumo, precoLitro, km, viagens, portagens, nPessoas },
    };
  },

  /**
   * Handler para simular busca na "Base de Dados".
   * Retorna médias internas.
   * Em uma app real, isto poderia ler do localStorage ou API.
   */
  getDatabaseAverages() {
    // Tentar ler do localStorage se existir algo salvo, senão defaults
    // Exemplo: assumindo que o app salva 'meuCarro_stats'
    let mediaConsumo = 6.5;
    let mediaPreco = 1.75;

    // Simples mock para demonstração
    // Se quiser ler de algo real:
    // const stats = JSON.parse(localStorage.getItem('stats')) || {};
    // if(stats.avgConsumption) mediaConsumo = stats.avgConsumption;

    return {
      consumo: mediaConsumo,
      precoLitro: mediaPreco,
    };
  },
};
