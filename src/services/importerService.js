/**
 * Serviço de Importação Inteligente de Extrato B3 e Planilhas (CSV)
 * Reconhece automaticamente formatos da B3, NuInvest, Rico, Clear, XP e Genéricos.
 */

function parseCSVTransactions(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(delimiter).map(h => normalizeHeader(h));

  const parsedTransactions = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const cols = splitCSVLine(rawLine, delimiter);
    if (cols.length < 3) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] ? cols[idx].trim() : '';
    });

    const tx = extractTransactionFromRow(rowObj);
    if (tx && tx.ticker && tx.quantity > 0 && tx.unitPrice > 0) {
      parsedTransactions.push(tx);
    }
  }

  return parsedTransactions;
}

function normalizeHeader(header) {
  return header
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function splitCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseBrazilianNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  
  let clean = String(val).replace(/R\$/g, '').replace(/\s/g, '').trim();

  // Se tem ponto e vírgula (ex: 1.250,50)
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } 
  // Se tem apenas vírgula (ex: 180,50 ou 2550,00)
  else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  // Se tem apenas ponto (ex: 180.50), já é formato float

  return Number(clean) || 0;
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const clean = dateStr.trim();

  // DD/MM/YYYY
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${month}-${day}`;
    }
  }

  // YYYY-MM-DD
  if (clean.includes('-')) {
    return clean;
  }

  return new Date().toISOString().slice(0, 10);
}

function extractTransactionFromRow(row) {
  let ticker = row['ticker'] || row['codigo'] || row['codigodenegociacao'] || row['ativo'] || row['symbol'] || '';
  ticker = ticker.toUpperCase().trim();
  if (ticker.length === 6 && ticker.endsWith('F')) {
    ticker = ticker.slice(0, 5);
  }

  let opRaw = (row['tipo'] || row['operacao'] || row['tipodemovimentacao'] || row['movimentacao'] || row['type'] || 'COMPRA').toUpperCase();
  let type = 'BUY';
  if (opRaw.includes('VEN') || opRaw.includes('SELL')) {
    type = 'SELL';
  } else if (opRaw.includes('DIV') || opRaw.includes('JCP') || opRaw.includes('REND')) {
    type = 'DIVIDEND';
  }

  const quantity = parseBrazilianNumber(row['quantidade'] || row['qtd'] || row['quantity'] || row['quant'] || '0');
  const unitPrice = parseBrazilianNumber(row['preco'] || row['precounitario'] || row['price'] || row['valorunitario'] || '0');
  const fees = parseBrazilianNumber(row['taxas'] || row['taxa'] || row['custos'] || row['fees'] || '0');
  const date = parseDate(row['data'] || row['datadonegocio'] || row['datamovimentacao'] || row['date'] || '');

  let assetType = 'ACAO';
  if (ticker.endsWith('11') || ticker.includes('FII')) {
    assetType = (ticker.includes('MXRF') || ticker.includes('KNCR')) ? 'FII_PAPEL' : 'FII_TIJOLO';
  } else if (ticker.length <= 4 && !ticker.match(/\d/)) {
    assetType = 'STOCK_USD';
  } else if (ticker.includes('TESOURO') || ticker.includes('CDB') || ticker.includes('LCI')) {
    assetType = 'RENDA_FIXA';
  }

  return {
    ticker,
    type,
    assetType,
    quantity,
    unitPrice,
    fees,
    date,
    totalAmount: Number(((quantity * unitPrice) + (type === 'BUY' ? fees : -fees)).toFixed(2))
  };
}

function integrateTransactionsIntoPortfolio(currentPortfolio, newTransactions = []) {
  if (!newTransactions.length) return currentPortfolio;

  const updatedPortfolio = JSON.parse(JSON.stringify(currentPortfolio));
  const txByTicker = {};

  newTransactions.forEach(tx => {
    if (!txByTicker[tx.ticker]) txByTicker[tx.ticker] = [];
    txByTicker[tx.ticker].push(tx);
  });

  Object.keys(txByTicker).forEach(ticker => {
    const txs = txByTicker[ticker];
    const assetIdx = updatedPortfolio.assets.findIndex(a => a.ticker === ticker);
    const sampleTx = txs[0];
    let existingTxs = [];

    if (assetIdx >= 0) {
      const existing = updatedPortfolio.assets[assetIdx];
      if (existing.quantity > 0) {
        existingTxs.push({
          type: 'BUY',
          quantity: existing.quantity,
          unitPrice: existing.averagePrice,
          fees: 0,
          date: '2020-01-01'
        });
      }
      
      const allTxs = [...existingTxs, ...txs];
      let totalQ = 0;
      let totalCost = 0;
      allTxs.forEach(t => {
        if (t.type === 'BUY') {
          totalQ += t.quantity;
          totalCost += (t.quantity * t.unitPrice) + (t.fees || 0);
        } else if (t.type === 'SELL') {
          const pm = totalQ > 0 ? totalCost / totalQ : 0;
          totalQ = Math.max(0, totalQ - t.quantity);
          totalCost = totalQ * pm;
        }
      });

      existing.quantity = totalQ;
      existing.averagePrice = totalQ > 0 ? Number((totalCost / totalQ).toFixed(4)) : 0;
      existing.currentPrice = txs[txs.length - 1].unitPrice;
    } else {
      let totalQ = 0;
      let totalCost = 0;
      txs.forEach(t => {
        if (t.type === 'BUY') {
          totalQ += t.quantity;
          totalCost += (t.quantity * t.unitPrice) + (t.fees || 0);
        }
      });

      const avgPrice = totalQ > 0 ? Number((totalCost / totalQ).toFixed(4)) : txs[0].unitPrice;

      updatedPortfolio.assets.push({
        id: 'ast-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        ticker,
        name: ticker,
        type: sampleTx.assetType || 'ACAO',
        quantity: totalQ,
        averagePrice: avgPrice,
        currentPrice: txs[txs.length - 1].unitPrice,
        targetWeightPercent: 10,
        targetAnnualYield: 0.06,
        historicalAverageDPA: Number((avgPrice * 0.07).toFixed(2)),
        monthlyDividendEstimate: Number(((avgPrice * 0.07) / 12).toFixed(2)),
        score: 9,
        deepDive: {
          ticker,
          companyName: ticker,
          sector: 'Geral',
          subsector: 'Geral',
          description: 'Ativo importado via planilha/extrato B3.',
          businessModel: 'Conforme atividade.',
          governance: 'NOVO_MERCADO',
          tagAlongPercent: 100,
          freeFloatPercent: 50,
          hasConsistentProfits5Years: true,
          netMarginPercent: 15,
          roePercent: 18,
          netDebtToEbitda: 1.5,
          payoutPercent: 50
        }
      });
    }
  });

  return updatedPortfolio;
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseCSVTransactions,
    parseBrazilianNumber,
    parseDate,
    integrateTransactionsIntoPortfolio
  };
}
