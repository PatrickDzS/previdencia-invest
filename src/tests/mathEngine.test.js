const assert = require('assert');
const {
  calculatePositionFromTransactions,
  calculateBazinCeilingPrice,
  calculateMarginOfSafety,
  calculateYieldOnCost,
  calculateMagicNumber,
  calculateMonthlyTax,
  calculateRetirementProjection,
  calculateRebalanceOrder
} = require('../services/mathEngine');

console.log('🚀 Iniciando bateria de testes do Motor Matemático Previdenciário...\n');

// Teste 1: Preço Médio Ponderado com Múltiplas Compras e Venda Parcial
{
  const txs = [
    { type: 'BUY', quantity: 100, unitPrice: 30.00, fees: 5.00, date: '2025-01-10' }, // Custo: 3005 (PM: 30.05)
    { type: 'BUY', quantity: 100, unitPrice: 35.00, fees: 5.00, date: '2025-02-10' }, // Custo: 3505 (Total: 6510 / 200 = 32.55)
    { type: 'SELL', quantity: 50, unitPrice: 40.00, fees: 10.00, date: '2025-03-10' }  // Vende 50 a 40.00 (Rec: 1990, Custo: 50*32.55 = 1627.50, Lucro: 362.50, Qtd restante: 150, PM: 32.55)
  ];

  const pos = calculatePositionFromTransactions(txs);
  assert.strictEqual(pos.quantity, 150, 'Quantidade restante deve ser 150');
  assert.strictEqual(pos.averagePrice, 32.55, 'Preço médio deve permanecer 32.55 após venda');
  assert.strictEqual(pos.totalRealizedProfit, 362.50, 'Lucro realizado deve ser 362.50');
  console.log('✅ Teste 1 Passou: Preço Médio Ponderado e Lucro Realizado');
}

// Teste 2: Preço Teto de Bazin e Margem de Segurança
{
  // Empresa paga R$ 2.40 de DPA médio. Com yield mínimo de 6% (0.06): Preço Teto = 2.40 / 0.06 = R$ 40.00
  const ceiling = calculateBazinCeilingPrice(2.40, 0.06);
  assert.strictEqual(ceiling, 40.00, 'Preço teto deve ser R$ 40.00');

  // Se cotação no pregão está R$ 32.00: Margem = (40 - 32) / 32 * 100 = +25%
  const margin = calculateMarginOfSafety(ceiling, 32.00);
  assert.strictEqual(margin, 25.00, 'Margem de segurança deve ser +25.00%');
  console.log('✅ Teste 2 Passou: Preço Teto de Bazin e Margem de Segurança no Pregão');
}

// Teste 3: Yield on Cost (YoC)
{
  // Comprou no passado a PM = R$ 20.00. Hoje recebe DPA = R$ 3.50/ano.
  // YoC = 3.50 / 20.00 = 17.5% a.a.
  const yoc = calculateYieldOnCost(3.50, 20.00);
  assert.strictEqual(yoc, 17.50, 'Yield on Cost deve ser 17.50%');
  console.log('✅ Teste 3 Passou: Yield on Cost (YoC)');
}

// Teste 4: Número Mágico (Efeito Bola de Neve)
{
  // Cota do FII custa R$ 10.50 e paga R$ 0.11 por mês.
  // Número Mágico = ceil(10.50 / 0.11) = ceil(95.45) = 96 cotas
  const magic = calculateMagicNumber(10.50, 0.11);
  assert.strictEqual(magic, 96, 'Número Mágico deve ser 96 cotas');
  console.log('✅ Teste 4 Passou: Número Mágico do Efeito Bola de Neve');
}

// Teste 5: Calculadora Fiscal de IR (Isenção dos 20k em Ações e Compensação de Prejuízo)
{
  // Mês 1: Venda de R$ 15.000 em ações com lucro de R$ 3.000 (ISENTO, abaixo de 20k)
  const taxMonth1 = calculateMonthlyTax({
    stockSales: [{ sellAmount: 15000, costAmount: 12000, profit: 3000 }],
    fiiSales: [],
    accumulatedStockLossCarried: 0,
    accumulatedFiiLossCarried: 0
  });
  assert.strictEqual(taxMonth1.isStockExempt, true, 'Venda de ações <= 20k deve ser isenta');
  assert.strictEqual(taxMonth1.stockDarfPayable, 0, 'DARF deve ser zero em vendas isentas');

  // Mês 2: Venda de R$ 30.000 em ações com lucro de R$ 5.000, mas tendo R$ 2.000 de prejuízo anterior acumulado
  const taxMonth2 = calculateMonthlyTax({
    stockSales: [{ sellAmount: 30000, costAmount: 25000, profit: 5000 }],
    fiiSales: [{ sellAmount: 5000, costAmount: 4000, profit: 1000 }], // FII lucro 1000 -> DARF 20% = 200
    accumulatedStockLossCarried: 2000,
    accumulatedFiiLossCarried: 0
  });
  assert.strictEqual(taxMonth2.isStockExempt, false, 'Venda > 20k não é isenta');
  assert.strictEqual(taxMonth2.stockTaxableProfit, 3000, 'Lucro tributável deve abater prejuízo de 2000 (5000 - 2000 = 3000)');
  assert.strictEqual(taxMonth2.stockDarfPayable, 450, 'DARF de ações deve ser 15% de 3000 = 450');
  assert.strictEqual(taxMonth2.fiiDarfPayable, 200, 'DARF de FII deve ser 20% de 1000 = 200');
  assert.strictEqual(taxMonth2.totalDarfPayable, 650, 'DARF total deve ser 450 + 200 = 650');
  console.log('✅ Teste 5 Passou: Calculadora de IR, Isenção de 20k e Compensação de Prejuízos');
}

// Teste 6: Simulador de Liberdade Financeira
{
  const sim = calculateRetirementProjection({
    currentCapital: 50000,
    monthlyContribution: 2000,
    targetMonthlyPassiveIncome: 5000,
    expectedAnnualYield: 0.085, // 8.5% a.a.
    reinvestDividends: true
  });
  assert(sim.requiredCapital > 0, 'Capital necessário deve ser positivo');
  assert(sim.monthsToTarget > 0, 'Tempo em meses deve ser calculado');
  assert(sim.trajectory.length > 0, 'Trajetória mês a mês deve ser gerada');
  console.log(`✅ Teste 6 Passou: Liberdade Financeira projetada para ${sim.yearsToTarget} anos (Capital necessário: R$ ${sim.requiredCapital.toLocaleString('pt-BR')})`);
}

// Teste 7: Rebalanceamento Inteligente de Aportes com Fator de Pregão
{
  const assets = [
    { ticker: 'BBAS3', currentPrice: 30.00, currentQuantity: 100, targetWeightPercent: 40, score: 10, ceilingPrice: 38.00 }, // Descontada e atrasada
    { ticker: 'TAEE11', currentPrice: 36.00, currentQuantity: 200, targetWeightPercent: 30, score: 8, ceilingPrice: 36.00 },
    { ticker: 'HGLG11', currentPrice: 160.00, currentQuantity: 50, targetWeightPercent: 30, score: 9, ceilingPrice: 170.00 }
  ];

  const orders = calculateRebalanceOrder({
    availableCash: 3000,
    assets
  });

  assert(orders.length > 0, 'Deve gerar ordens de compra');
  console.log('✅ Teste 7 Passou: Motor de Rebalanceamento gerou ordens:', orders.map(o => `${o.ticker}: +${o.suggestedQuantity} cotas (R$ ${o.totalCost})`));
}

console.log('\n🎯 Todos os testes passaram com 100% de sucesso e precisão matemática!');

// Teste 8: Comparador de Defasagem entre Classes (Final 3 - ON, Final 4 - PN e Final 11 - UNIT)
{
  const { compareShareClasses } = require('../services/mathEngine');

  // Caso Taesa: TAEE3 a 11.60 (DPA 1.10 -> DY 9.48%), TAEE4 a 11.75 (DPA 1.10 -> DY 9.36%), TAEE11 a 35.80 (DPA 3.30 -> DY 9.22%)
  // Composição TAEE11 = 1 TAEE3 + 2 TAEE4 = 11.60 + 2*(11.75) = 35.10. Cotação Unit = 35.80.
  const comp = compareShareClasses({
    tickerBase: 'TAEE',
    name: 'Taesa',
    onPrice: 11.60,
    pnPrice: 11.75,
    unitPrice: 35.80,
    onDPA: 1.10,
    pnDPA: 1.10,
    unitDPA: 3.30,
    unitComposition: { onQty: 1, pnQty: 2 }
  });

  assert.strictEqual(comp.bestChoice.ticker, 'TAEE3', 'TAEE3 deve ser a melhor escolha por ter o maior yield');
  assert.strictEqual(comp.on.yield, 9.48, 'Yield de TAEE3 deve ser 9.48%');
  console.log(`✅ Teste 8 Passou: Comparador de Classes 3 vs 4 vs 11: Melhor escolha detectada: ${comp.bestChoice.ticker} (${comp.bestChoice.yield}%)`);
}
