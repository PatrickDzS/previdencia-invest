/**
 * Serverless: /api/market
 * Retorna IBOV e Dólar em tempo real com fallback múltiplo.
 * GET /api/market -> { ibov: { price, changePercent, ... }, dolar: { price, changePercent, ... }, fetchedAt }
 */

const UA_HEADERS = {
  'User-Agent': 'PrevidenciaInvest/1.4.0 (+https://previdencia-invest.vercel.app)',
  'Accept': 'application/json, text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
};

async function fetchWithTimeout(url, ms = 7000, headers = UA_HEADERS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}

async function fetchYahooMeta(yahooSymbol) {
  const bases = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`
  ];
  for (const url of bases) {
    try {
      const r = await fetchWithTimeout(url, 6000, {
        'User-Agent': 'PrevidenciaInvest/1.0 (+https://previdencia-invest)',
        'Accept': 'application/json'
      });
      if (!r.ok) continue;
      const j = await r.json();
      const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      if (!meta || meta.regularMarketPrice == null) continue;
      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      const cur = meta.regularMarketPrice;
      const changePct = prev && cur ? ((cur - prev) / prev) * 100 : 0;
      return {
        price: Number(cur),
        previousClose: prev ? Number(prev) : null,
        changePercent: Number.isFinite(changePct) ? Number(changePct.toFixed(2)) : 0,
        currency: meta.currency || 'BRL',
        regularMarketDayHigh: meta.regularMarketDayHigh || null,
        regularMarketDayLow: meta.regularMarketDayLow || null,
        source: 'Yahoo Finance',
        symbol: yahooSymbol,
        updatedAt: new Date().toISOString()
      };
    } catch (e) { /* next base */ }
  }
  return null;
}

async function fetchAwesomeUSD() {
  try {
    const r = await fetchWithTimeout('https://economia.awesomeapi.com.br/last/USD-BRL', 6000);
    if (!r.ok) return null;
    const j = await r.json();
    const info = j && j['USDBRL'];
    if (!info || !info.bid) return null;
    const price = Number(info.bid);
    const pct = Number(info.pctChange);
    const prev = price && Number.isFinite(pct) ? price / (1 + pct / 100) : null;
    return {
      price: Number(price.toFixed(4)),
      previousClose: prev,
      changePercent: Number.isFinite(pct) ? Number(pct.toFixed(2)) : 0,
      high: info.high ? Number(Number(info.high).toFixed(4)) : null,
      low: info.low ? Number(Number(info.low).toFixed(4)) : null,
      currency: 'BRL',
      source: 'AwesomeAPI',
      symbol: 'USD-BRL',
      updatedAt: new Date().toISOString()
    };
  } catch (e) { return null; }
}

async function fetchBrapiIbov(token) {
  // Brapi pode responder para ^BVSP como %5EBVSP
  try {
    const qs = token ? `?token=${token}` : '';
    const r = await fetchWithTimeout(`https://brapi.dev/api/quote/%5EBVSP${qs}`, 6000);
    if (!r.ok) return null;
    const j = await r.json();
    const item = j && j.results && j.results[0];
    if (!item || item.regularMarketPrice == null) return null;
    const cur = Number(item.regularMarketPrice);
    const prev = item.regularMarketPreviousClose || item.previousClose || null;
    const changePct = item.regularMarketChangePercent != null ? Number(item.regularMarketChangePercent) : (prev ? ((cur - prev)/prev)*100 : 0);
    return {
      price: cur,
      previousClose: prev ? Number(prev) : null,
      changePercent: Number.isFinite(changePct) ? Number(Number(changePct).toFixed(2)) : 0,
      currency: 'BRL',
      source: 'Brapi.dev',
      symbol: '^BVSP',
      updatedAt: new Date().toISOString()
    };
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || process.env.BRAPI_TOKEN || '';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

  try {
    // paralelo com fallback
    const [yahooIbov, yahooDolar, awesomeDolar, brapiIbov] = await Promise.all([
      fetchYahooMeta('^BVSP'),
      fetchYahooMeta('BRL=X'),
      fetchAwesomeUSD(),
      fetchBrapiIbov(token)
    ]);

    let ibov = yahooIbov || brapiIbov || null;
    // se Yahoo IBOV falhou mas brapi pegou, usa brapi; se ambos falharam, tenta Yahoo novamente com USDBRL=X fallback já feito acima
    if (!ibov) {
      // última tentativa Yahoo com ^BVSP via query2 já feita; mantém null para sinalizar erro
    }

    let dolar = awesomeDolar || yahooDolar || null;
    // prefer AwesomeAPI (mais preciso para PTAX), mas se Awesome falhou usa Yahoo
    // Se Awesome tem dados mas Yahoo também tem, mantém Awesome como principal

    // Normaliza para resposta
    const payload = {
      ibov: ibov ? {
        price: ibov.price,
        changePercent: ibov.changePercent,
        previousClose: ibov.previousClose,
        currency: ibov.currency || 'BRL',
        source: ibov.source,
        symbol: ibov.symbol,
        updatedAt: ibov.updatedAt
      } : { error: 'Indisponível', price: null, changePercent: null },
      dolar: dolar ? {
        price: dolar.price,
        changePercent: dolar.changePercent,
        previousClose: dolar.previousClose,
        currency: dolar.currency || 'BRL',
        source: dolar.source,
        symbol: dolar.symbol,
        high: dolar.high || dolar.regularMarketDayHigh || null,
        low: dolar.low || dolar.regularMarketDayLow || null,
        updatedAt: dolar.updatedAt
      } : { error: 'Indisponível', price: null, changePercent: null },
      fetchedAt: new Date().toISOString()
    };

    const hasAny = (ibov && ibov.price) || (dolar && dolar.price);
    res.statusCode = hasAny ? 200 : 502;
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message || 'Erro interno', ibov: { price: null }, dolar: { price: null }, fetchedAt: new Date().toISOString() }));
  }
};
