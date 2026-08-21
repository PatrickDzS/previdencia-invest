/**
 * Serviço de informações em tempo real do ativo (dividendos + Raio-X)
 * Consome /api/asset-info (Brapi + scraping StatusInvest/Investidor10)
 */

const ASSET_INFO_CACHE_KEY = 'previdencia_invest_asset_info_cache';
const ASSET_INFO_TTL_MS = 15 * 60 * 1000; // 15 min

function getAssetInfoCache() {
  try {
    const raw = localStorage.getItem(ASSET_INFO_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveAssetInfoCache(cache) {
  try { localStorage.setItem(ASSET_INFO_CACHE_KEY, JSON.stringify(cache)); } catch(e){}
}

async function fetchAssetInfos(tickers = []) {
  const clean = [...new Set(tickers.map(t=> String(t).toUpperCase().trim()).filter(Boolean))].slice(0,20);
  if (!clean.length) return {};
  const cache = getAssetInfoCache();
  const now = Date.now();
  const missing = [];
  const result = {};
  clean.forEach(t=>{
    const c = cache[t];
    if (c && (now - c.ts < ASSET_INFO_TTL_MS)) result[t]=c.data;
    else missing.push(t);
  });
  if (!missing.length) return result;
  try {
    const qs = new URLSearchParams({ tickers: missing.join(',') }).toString();
    const r = await fetch(`/api/asset-info?${qs}`);
    if (!r.ok) throw new Error('asset-info '+r.status);
    const j = await r.json();
    const res = j.results || {};
    Object.entries(res).forEach(([k,v])=>{
      if (v && !v.error) {
        cache[k]={ts: now, data: v};
        result[k]=v;
      }
    });
    saveAssetInfoCache(cache);
  } catch(e){
    console.warn('fetchAssetInfos falhou', e);
  }
  return result;
}

async function enrichPortfolioWithLiveDividends(portfolioState, options={}) {
  const forceDividends = !!options.forceDividends;
  const tickers = (portfolioState.assets||[]).map(a=>a.ticker);
  if (!tickers.length) return { updated: 0 };
  const infos = await fetchAssetInfos(tickers);
  let updated = 0;
  portfolioState.assets.forEach(asset=>{
    const info = infos[asset.ticker.toUpperCase()];
    if (!info) return;
    // Preço – SÓ atualiza quando o usuário clicou manualmente (forceDividends=true).
    // Nunca sobrescreve automaticamente no carregamento – preserva valor manual da carteira.
    if (forceDividends && info.price && isFinite(info.price) && info.price > 0) {
      asset.currentPrice = Number(info.price);
      updated++;
    } else if (info.price && isFinite(info.price) && info.price > 0) {
      // guarda apenas como referência ao vivo sem mutar a carteira
      asset.deepDive = asset.deepDive || {};
      asset.deepDive.livePrice = Number(info.price);
    }
    // Dividendos: NÃO sobrescreve automaticamente no refresh para não bagunçar valores manuais
    // Só sobrescreve se for atualização manual (forceDividends) ou se o ativo ainda não tem dividendo
    const hasUserMonthly = asset.monthlyDividendEstimate != null && Number(asset.monthlyDividendEstimate) > 0;
    const shouldOverwrite = forceDividends || !hasUserMonthly;
    if (!shouldOverwrite) {
      // guarda live como referência sem sobrescrever o que o usuário digitou
      asset.deepDive = asset.deepDive || {};
      if (info.monthlyDividend != null && info.monthlyDividend > 0) asset.deepDive.liveMonthly = Number(info.monthlyDividend.toFixed(4));
      if (info.annualDividend != null && info.annualDividend > 0) asset.deepDive.liveAnnual = Number(info.annualDividend.toFixed(4));
      return;
    }
    if (info.monthlyDividend != null && isFinite(info.monthlyDividend) && info.monthlyDividend > 0) {
      const monthly = Number(info.monthlyDividend);
      asset.monthlyDividendEstimate = Number(monthly.toFixed(4));
      asset.historicalAverageDPA = Number((info.annualDividend != null && info.annualDividend>0 ? info.annualDividend : monthly*12).toFixed(4));
      updated++;
    } else if (info.annualDividend != null && isFinite(info.annualDividend) && info.annualDividend > 0) {
      const annual = Number(info.annualDividend);
      asset.historicalAverageDPA = Number(annual.toFixed(4));
      asset.monthlyDividendEstimate = Number((annual/12).toFixed(4));
      updated++;
    }
    // Enriquecimento Raio-X leve: guarda url fonte e composição
    if (info.raioxUrl) {
      asset.deepDive = asset.deepDive || {};
      asset.deepDive.infoUrl = info.raioxUrl;
      asset.deepDive.liveDy = info.dy;
      if (info.raioxComposition && info.raioxComposition.length) {
        asset.deepDive.liveComposition = info.raioxComposition;
      }
    }
  });
  return { updated, infos };
}

if (typeof module !== 'undefined') {
  module.exports = { fetchAssetInfos, enrichPortfolioWithLiveDividends };
}
