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
    if (!r.ok) return null;
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
  // Para ibov, tenta Brapi; para dólar, AwesomeAPI
  try {
    const [ibovDirect, dolarDirect] = await Promise.all([
      fetchBrapiIbovDirect(),
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
