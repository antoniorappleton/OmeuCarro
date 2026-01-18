/**
 * tripCalculator.js
 * Módulo para cálculo de custos de viagem (PWA).
 */

export const TripCalculator = {
  /**
   * Calcula os custos de viagem com base em médias e overrides.
   *
   * @param {Object} params
   * @param {number} params.consumoMedio - Média do veículo (L/100km)
   * @param {number} params.precoMedioLitro - Média de preço (€/L)
   * @param {Object} params.overrides - Inputs do utilizador
   * @param {string|number} [params.overrides.consumo] - Override L/100km
   * @param {string|number} [params.overrides.precoLitro] - Override €/L
   * @param {string|number} params.overrides.km - Km por viagem
   * @param {string|number} params.overrides.viagens - N.º de viagens
   * @param {string|number} params.overrides.portagens - € Portagens/viagem
   * @param {string|number} params.overrides.pessoas - N.º Pessoas
   *
   * @returns {Object} Resultados formatados e valores efetivos
   */
  calculate(params) {
    const { consumoMedio = 0, precoMedioLitro = 0, overrides = {} } = params;

    // 1. Normalização e Validação
    // Parse helper: texto -> número, NaN/Vazio -> 0, Negativos -> 0
    const parseNonNeg = (val) => Math.max(0, parseFloat(val) || 0);
    const parseIntNonNeg = (val) => Math.max(0, parseInt(val) || 0);

    // Inputs overrides
    // Para consumo e preço, se não definido ou vazio, usamos a média.
    // MAS a regra diz: "Se presente, substitui".
    // Vamos assumir: se o utilizador preencheu (string não vazia ou numero), usa-se.
    // Se for string vazia ou null e undefined, usa média.

    // Função auxiliar para determinar efetivo
    const getEffective = (userVal, avgVal) => {
      // Se userVal é inválido (null, undefined, ""), usa média.
      // Se userVal é numérico (mesmo 0), usa userVal.
      if (userVal === "" || userVal === null || userVal === undefined)
        return parseNonNeg(avgVal);
      return parseNonNeg(userVal);
    };

    const C = getEffective(overrides.consumo, consumoMedio);
    const P = getEffective(overrides.precoLitro, precoMedioLitro);

    const K = parseNonNeg(overrides.km);
    const V = parseIntNonNeg(overrides.viagens);
    const T = parseNonNeg(overrides.portagens);

    // Pessoas: Inteiro >= 1
    let rawPessoas = parseInt(overrides.pessoas);
    const N = !rawPessoas || rawPessoas < 1 ? 1 : rawPessoas;

    // 2. Algoritmos
    const kmTotais = K * V;
    const litrosTotais = (C * kmTotais) / 100;
    const portagensTotais = T * V;
    const custoCombustivel = litrosTotais * P;
    const custoTotal = portagensTotais + custoCombustivel;
    const custoPorPessoa = custoTotal / N;

    // 3. Formatação e Outputs
    // Helper para formatar n casas decimais (retorna number ou string? O pedido diz "número formatado", mas em JS isso é string fixada ou number arredondado.
    // "Plain Text: kmTotais // número formatado (1 casa)" sugere string ou float arredondado. Vamos devolver float arredondado para consistência numérica,
    // mas se o requisito for display, toFixed retorna string.
    // O pedido mostra chaves: Plain Text{ ... }. Vamos devolver os valores numéricos arredondados para facilitar cálculos futuros se necessário,
    // mas talvez string seja melhor para display direto. Vamos usar float para manter "Módulo puro de cálculo".
    // EDIT: "número formatado (1 casa)" usually means string representation. Let's provide both or standard floats.
    // O JS mapa.js usava toFixed(). Vamos manter números aqui para flexibilidade, ou melhor, seguir o pedido "devolver todos os outputs num objeto".

    const fmt = (val, digits) => parseFloat(val.toFixed(digits)); // Devolve número arredondado

    return {
      kmTotais: fmt(kmTotais, 1),
      litrosTotais: fmt(litrosTotais, 1),
      portagensTotais: fmt(portagensTotais, 2),
      custoCombustivel: fmt(custoCombustivel, 2),
      custoTotal: fmt(custoTotal, 2),
      custoPorPessoa: fmt(custoPorPessoa, 2),

      // Efetivos
      consumoEfetivo: C,
      precoLitroEfetivo: P,
      _debug: { C, P, K, V, T, N },
    };
  },

  /**
   * Mock para médias (será substituído por dados reais em mapa.js)
   */
  getDatabaseAverages() {
    return {
      consumo: 6.5,
      precoLitro: 1.75,
    };
  },
};
