/**
 * Função Serverless: /api/yahoo
 * Proxy para Yahoo Finance Chart API com fallback para evitar CORS no browser.
 * Uso: /api/yahoo?symbol=PETR4.SA&interval=5m&range=1d
 * ou: /api/yahoo?symbols=PETR4.SA,VALE3.SA&interval=1d&range=1d (para live)
 * Retorna JSON normalizado { ticker, points: [{date, close}] } ou { results: { PETR4: {...} } }
 */

const YAHOO_BASES = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart'
];

function yahooTicker(input) {
  const clean = String(input || '').toUpperCase().trim();
  if (!clean) return '';
  if (clean.includes('.')) return clean;
  if (clean.length <= 6) return `${clean}.SA`;
  return clean;
}

async function fetchYahoo(symbol, interval, range) {
  const yahooSymbol = yahooTicker(symbol);
  let lastError = null;
  for (const base of YAHOO_BASES) {
    const url = `${base}/${encodeURIComponent(yahooSymbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'PrevidenciaInvest/1.0 (+https://previdencia-invest)',
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        lastError = new Error(`Yahoo ${res.status} for ${yahooSymbol}`);
        continue;
      }
      const json = await res.json();
      const result = json && json.chart && json.chart.result && json.chart.result[0];
      if (!result) {
        lastError = new Error(`Sem dados para ${yahooSymbol}`);
        continue;
      }
      return { yahooSymbol, raw: result, clean: String(symbol).toUpperCase().trim() };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error(`Falha ao buscar ${symbol}`);
}

function extractPoints(raw) {
  const timestamps = raw.timestamp || [];
  const closes = (raw.indicators && raw.indicators.quote && raw.indicators.quote[0] && raw.indicators.quote[0].close) || [];
  const byDate = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (typeof close === 'number' && close > 0 && isFinite(close)) {
      // Para intraday usa ISO com hora, para daily usa só data
      const d = new Date(timestamps[i] * 1000);
      // Normaliza para YYYY-MM-DD HH:MM para 1D, senão só data
      const isIntraday = (raw.meta && raw.meta.validRanges && raw.meta.validRanges.includes('1d')) || false;
      // Detecta pelo intervalo: se for 1m/5m mantém hora
      const dateKey = d.toISOString(); // mantém precisão, depois o frontend agrupa
      byDate.set(dateKey, close);
    }
  }
  // Converte para pontos ordenados {date, close}
  const points = Array.from(byDate.entries())
    .sort((a,b) => new Date(a[0]) - new Date(b[0]))
    .map(([date, close]) => ({ date, close }));
  return points;
}

function extractMeta(raw) {
  const meta = raw.meta || {};
  const prevClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
  const curPrice = meta.regularMarketPrice;
  const changePct = prevClose && curPrice ? ((curPrice - prevClose) / prevClose) * 100 : 0;
  return {
    ticker: (meta.symbol || '').replace('.SA','').toUpperCase(),
    yahooSymbol: meta.symbol || '',
    currency: meta.currency || 'BRL',
    regularMarketPrice: curPrice || null,
    previousClose: prevClose || null,
    changePercent: Number.isFinite(changePct) ? Number(changePct.toFixed(2)) : 0,
    regularMarketDayHigh: meta.regularMarketDayHigh || null,
    regularMarketDayLow: meta.regularMarketDayLow || null,
    regularMarketTime: meta.regularMarketTime || null,
    exchangeName: meta.exchangeName || meta.fullExchangeName || '',
    source: 'Yahoo Finance'
  };
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const symbol = url.searchParams.get('symbol') || url.searchParams.get('ticker') || '';
  const symbols = url.searchParams.get('symbols') || '';
  const interval = url.searchParams.get('interval') || '1d';
  const range = url.searchParams.get('range') || '1d';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try {
    if (symbols) {
      const list = symbols.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
      const settled = await Promise.allSettled(list.map(s => fetchYahoo(s, interval, range)));
      const results = {};
      settled.forEach((r, i) => {
        const clean = list[i].toUpperCase().trim();
        if (r.status === 'fulfilled') {
          const points = extractPoints(r.value.raw);
          const meta = extractMeta(r.value.raw);
          results[clean] = { ticker: clean, yahooSymbol: r.value.yahooSymbol, points, meta, source: 'yahoo' };
        } else {
          results[clean] = { ticker: clean, points: [], error: r.reason ? r.reason.message : 'erro' };
        }
      });
      res.statusCode = 200;
      res.end(JSON.stringify({ results, fetchedAt: new Date().toISOString() }));
      return;
    }

    if (!symbol) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Parâmetro symbol ou symbols é obrigatório' }));
      return;
    }

    const fetched = await fetchYahoo(symbol, interval, range);
    const points = extractPoints(fetched.raw);
    const meta = extractMeta(fetched.raw);

    res.statusCode = 200;
    res.end(JSON.stringify({
      ticker: fetched.clean,
      yahooSymbol: fetched.yahooSymbol,
      interval,
      range,
      points,
      meta,
      fetchedAt: new Date().toISOString(),
      source: 'yahoo'
    }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message || 'Erro interno', ticker: symbol || symbols }));
  }
};
