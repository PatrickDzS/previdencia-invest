/**
 * Serviço de Mercado: IBOV + Dólar
 * Consome /api/market com cache local e fallback direto (AwesomeAPI/Brapi)
 */
const MARKET_CACHE_KEY = 'previdencia_invest_market_cache';
const MARKET_TTL_MS = 2 * 60 * 1000; // 2 minutos (intraday ao vivo)

function getMarketCache() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MARKET_CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveMarketCache(data) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {}
}

async function fetchAwesomeDirect() {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
    if (!r.ok) return null;
    const j = await r.json();
    const info = j && j['USDBRL'];
    if (!info || !info.bid) return null;
    return {
      price: Number(Number(info.bid).toFixed(4)),
      changePercent: Number.isFinite(Number(info.pctChange)) ? Number(Number(info.pctChange).toFixed(2)) : 0,
      source: 'AwesomeAPI'
    };
  } catch (e) { return null; }
}

async function fetchBrapiIbovDirect() {
  try {
    const r = await fetch('https://brapi.dev/api/quote/%5EBVSP');
    if (!r.ok) throw new Error('brapi '+r.status);
    const j = await r.json();
    const item = j && j.results && j.results[0];
    if (!item || item.regularMarketPrice == null) return null;
    return {
      price: Number(item.regularMarketPrice),
      changePercent: item.regularMarketChangePercent != null ? Number(Number(item.regularMarketChangePercent).toFixed(2)) : 0,
      source: 'Brapi'
    };
  } catch (e) { return null; }
}

async function fetchYahooIbovProxy() {
  const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=1d&range=1d';
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`
  ];
  for (const proxyUrl of proxies) {
    try {
      const r = await fetch(proxyUrl);
      if (!r.ok) continue;
      let json;
      if (proxyUrl.includes('allorigins.win')) {
        const wrapper = await r.json();
        if (!wrapper.contents) continue;
        json = JSON.parse(wrapper.contents);
      } else {
        json = await r.json();
      }
      const meta = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
      if (!meta || meta.regularMarketPrice == null) continue;
      const cur = Number(meta.regularMarketPrice);
      const prev = meta.chartPreviousClose || meta.previousClose || cur;
      const pct = prev ? ((cur - prev) / prev) * 100 : 0;
      return { price: cur, changePercent: Number(pct.toFixed(2)), source: 'Yahoo-proxy' };
    } catch (e) { /* next proxy */ }
  }
  return null;
}

async function fetchIbovDirect() {
  // tenta Brapi primeiro (mais estável), depois Yahoo via proxy CORS
  const brapi = await fetchBrapiIbovDirect();
  if (brapi && brapi.price) return brapi;
  const yahoo = await fetchYahooIbovProxy();
  if (yahoo && yahoo.price) return yahoo;
  return null;
}

async function getMarketIndicators(opts = {}) {
  const force = !!opts.force;
  const cached = getMarketCache();
  const now = Date.now();
  if (!force && cached && cached.data && (now - cached.ts < MARKET_TTL_MS)) {
    return cached.data;
  }

  // 1) tenta proxy serverless
  try {
    const r = await fetch('/api/market');
    if (r.ok) {
      const j = await r.json();
      // considera válido se tem pelo menos um preço
      if (j && (j.ibov?.price || j.dolar?.price)) {
        saveMarketCache(j);
        return j;
      }
    }
  } catch (e) { /* fallback direto */ }

  // 2) fallback direto (funciona sem Vercel / CORS limitado)
  // Para ibov, tenta Brapi -> Yahoo proxy; para dólar, AwesomeAPI
  try {
    const [ibovDirect, dolarDirect] = await Promise.all([
      fetchIbovDirect(),
      fetchAwesomeDirect()
    ]);
    if (ibovDirect || dolarDirect) {
      const fallback = {
        ibov: ibovDirect ? { price: ibovDirect.price, changePercent: ibovDirect.changePercent, source: ibovDirect.source, updatedAt: new Date().toISOString() } : { price: null, changePercent: null, error: 'Indisponível' },
        dolar: dolarDirect ? { price: dolarDirect.price, changePercent: dolarDirect.changePercent, source: dolarDirect.source, updatedAt: new Date().toISOString() } : { price: null, changePercent: null, error: 'Indisponível' },
        fetchedAt: new Date().toISOString(),
        source: 'fallback-direct'
      };
      // se tinha cache antigo e fallback parcial, mescla para não perder dado
      if (cached && cached.data) {
        if (!fallback.ibov.price && cached.data.ibov?.price) fallback.ibov = cached.data.ibov;
        if (!fallback.dolar.price && cached.data.dolar?.price) fallback.dolar = cached.data.dolar;
      }
      if (fallback.ibov.price || fallback.dolar.price) {
        saveMarketCache(fallback);
        return fallback;
      }
    }
  } catch (e) {}

  // 3) último recurso: retorna cache expirado se existir
  if (cached && cached.data) return cached.data;

  return { ibov: { price: null, changePercent: null, error: ' offline ' }, dolar: { price: null, changePercent: null, error: ' offline ' }, fetchedAt: new Date().toISOString() };
}

if (typeof module !== 'undefined') {
  module.exports = { getMarketIndicators };
}
