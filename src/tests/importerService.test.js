const assert = require('assert');
const {
  parseCSVTransactions,
  parseBrazilianNumber,
  parseDate,
  integrateTransactionsIntoPortfolio
} = require('../services/importerService');

console.log('?? Testando Importador de Extrato B3 & Planilhas (CSV)...\n');

// Teste 1: Parsing de CSV no formato padrão da B3 (ponto-e-vírgula e números brasileiros)
{
  const b3Csv = `Data do Negocio;Tipo de Movimentacao;Codigo de Negociacao;Quantidade;Preco;Valor Total
15/01/2025;Compra;BBAS3;100;R$ 25,50;2550,00
20/01/2025;Compra;TAEE11;200;R$ 34,20;6840,00
10/02/2025;Compra;HGLG11;50;R$ 158,00;7900,00
12/02/2025;Venda;BBAS3;50;R$ 28,00;1400,00`;

  const txs = parseCSVTransactions(b3Csv);
  assert.strictEqual(txs.length, 4, 'Deve reconhecer 4 transações');
  assert.strictEqual(txs[0].ticker, 'BBAS3');
  assert.strictEqual(txs[0].quantity, 100);
  assert.strictEqual(txs[0].unitPrice, 25.50);
  assert.strictEqual(txs[0].type, 'BUY');
  assert.strictEqual(txs[3].type, 'SELL');
  console.log('? Teste 1 Passou: Reconhecimento do Extrato B3 com ponto-e-vírgula e R$');
}

// Teste 2: Parsing de CSV Genérico em Inglês com Vírgula
{
  const genericCsv = `Date,Ticker,Type,Quantity,Price,Fees
2025-01-10,AAPL,BUY,10,180.50,1.50
2025-02-01,VALE3,BUY,200,68.00,5.00`;

  const txs = parseCSVTransactions(genericCsv);
  assert.strictEqual(txs.length, 2);
  assert.strictEqual(txs[0].ticker, 'AAPL');
  assert.strictEqual(txs[0].unitPrice, 180.50);
  console.log('? Teste 2 Passou: Reconhecimento de CSV padrão internacional');
}

// Teste 3: Integração automática com cálculo de Preço Médio na carteira
{
  const initialPortfolio = {
    assets: [
      { ticker: 'BBAS3', quantity: 50, averagePrice: 20.00, currentPrice: 20.00 }
    ]
  };

  const newTxs = [
    { ticker: 'BBAS3', type: 'BUY', quantity: 50, unitPrice: 30.00, fees: 0, date: '2025-02-01' }, // Novo PM = (50*20 + 50*30)/100 = 25.00
    { ticker: 'MXRF11', type: 'BUY', quantity: 500, unitPrice: 10.20, fees: 0, date: '2025-02-05' } // Ativo novo
  ];

  const updated = integrateTransactionsIntoPortfolio(initialPortfolio, newTxs);
  const bbas = updated.assets.find(a => a.ticker === 'BBAS3');
  const mxrf = updated.assets.find(a => a.ticker === 'MXRF11');

  assert.strictEqual(bbas.quantity, 100);
  assert.strictEqual(bbas.averagePrice, 25.00);
  assert.strictEqual(mxrf.quantity, 500);
  assert.strictEqual(mxrf.averagePrice, 10.20);
  console.log('? Teste 3 Passou: Integração e recálculo automático de Preço Médio na carteira');
}

console.log('\n?? Todos os testes do importador passaram com 100% de sucesso!');
