/**
 * Serverless: /api/asset-info
 * Busca informações em tempo real de dividendos e Raio-X via Brapi + scraping de StatusInvest / Investidor10
 * Uso: /api/asset-info?ticker=MXRF11  ou  /api/asset-info?tickers=MXRF11,PETR4,BBAS3
 * Retorna: { results: { MXRF11: { ticker, type, price, monthlyDividend, annualDividend, dy, info, composition } } }
 * Fontes:
 *  - Brapi.dev (fundamental + dividends) – primária e mais estável
 *  - StatusInvest (https://statusinvest.com.br/{fiis|acoes}/{ticker}) – fallback e enriquecimento Raio-X
 *  - Investidor10 (https://investidor10.com.br/{fiis|acoes}/{ticker}) – fallback
 */

const BRAPI_BASE = 'https://brapi.dev/api/quote';
const STATUS_BASE = 'https://statusinvest.com.br';
const INV10_BASE = 'https://investidor10.com.br';

const UA_HEADERS = {
  'User-Agent': 'PrevidenciaInvest/1.4.0 (+https://previdencia-invest.vercel.app)',
  'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
};

function cleanTicker(t) {
  return String(t || '').toUpperCase().trim().replace(/\.SA$/i, '');
}

function inferCategory(ticker) {
  const t = cleanTicker(ticker);
  if (/11$/.test(t)) return { statusPath: `fiis/${t.toLowerCase()}`, inv10Path: `fiis/${t.toLowerCase()}`, type: 'FII' };
  if (/3$|4$/.test(t)) return { statusPath: `acoes/${t.toLowerCase()}`, inv10Path: `acoes/${t.toLowerCase()}`, type: 'ACAO' };
  if (/34$/.test(t)) return { statusPath: `bdr/${t.toLowerCase()}`, inv10Path: `bdrs/${t.toLowerCase()}`, type: 'BDR' };
  return { statusPath: `acoes/${t.toLowerCase()}`, inv10Path: `acoes/${t.toLowerCase()}`, type: 'ACAO' };
}

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA_HEADERS, signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}

// ---------- Brapi dividends ----------
async function fetchBrapiInfo(ticker, token) {
  const qs = new URLSearchParams({ fundamental: 'true', dividends: 'true' });
  if (token) qs.set('token', token);
  const url = `${BRAPI_BASE}/${encodeURIComponent(ticker)}?${qs.toString()}`;
  try {
    const r = await fetchWithTimeout(url, 7000);
    if (!r.ok) return null;
    const j = await r.json();
    const item = j && j.results && j.results[0];
    if (!item) return null;
    // dividends
    let monthly = null, annual = null, dy = null;
    const cash = (item.dividendsData && item.dividendsData.cashDividends) || [];
    if (cash.length) {
      // ordena por paymentDate desc
      const sorted = [...cash].sort((a,b)=> new Date(b.paymentDate) - new Date(a.paymentDate));
      const last = sorted[0];
      // sum últimos 12 (assume distribuição mensal p/ FII, anual p/ ação)
      const sum12 = sorted.slice(0,12).reduce((acc, d)=> acc + (Number(d.rate)||0), 0);
      const isFII = /11$/.test(ticker);
      if (isFII) {
        monthly = Number(last.rate) || 0;
        annual = sum12 || monthly*12;
      } else {
        annual = sum12 || Number(last.rate) || 0;
        monthly = annual/12;
      }
    }
    // fallback: se não tem dividendos, usa dividendYield do summary
    if (annual == null || annual === 0) {
      const fund = item.summaryProfile || item.defaultKeyStatistics || {};
      // tenta usar dividendYield (já é %)
    }
    // price
    const price = Number(item.regularMarketPrice) || null;
    const name = item.longName || item.shortName || ticker;
    // dy
    if (item.regularMarketPrice && annual) {
      dy = (annual / item.regularMarketPrice) * 100;
    }
    return {
      source: 'brapi',
      ticker,
      name,
      price,
      currency: 'BRL',
      annualDividend: annual != null ? Number(annual.toFixed(4)) : null,
      monthlyDividend: monthly != null ? Number(monthly.toFixed(4)) : null,
      dy: dy != null ? Number(dy.toFixed(2)) : null,
      brapiRaw: { dividends: cash.slice(0,12) }
    };
  } catch (e) {
    return null;
  }
}

// ---------- StatusInvest scraping ----------
function parseStatusInvest(html, ticker) {
  if (!html || typeof html !== 'string') return null;
  const out = {};
  // Tenta extrair DY: procura por "Dividend Yield" e valor %
  // Ex: <strong class="value">9,12%</strong> perto de DY
  const dyMatch = html.match(/Dividend\s*Yield[^<]*<\/[^>]*>\s*<[^>]*>\s*<strong[^>]*>([\d.,]+)%/i)
    || html.match(/DY[^<]*<\/[^>]*>\s*<strong[^>]*>([\d.,]+)%/i);
  if (dyMatch) {
    const v = dyMatch[1].replace(/\./g,'').replace(',','.');
    out.dy = Number(v);
  }
  // Último rendimento / Valor atual
  const ultimoMatch = html.match(/Último\s*rendimento[^<]*<\/[^>]*>\s*<[^>]*>\s*<strong[^>]*>R\$\s*([\d.,]+)/i)
    || html.match(/Rendimento[^<]*<\/[^>]*>\s*<strong[^>]*>R\$\s*([\d.,]+)/i);
  if (ultimoMatch) {
    const v = ultimoMatch[1].replace(/\./g,'').replace(',','.');
    out.lastDividend = Number(v);
  }
  // Preço atual: meta regularMarketPrice pode estar em json
  const priceMatch = html.match(/"price"\s*:\s*([\d.]+)/) || html.match(/regularMarketPrice"\s*:\s*([\d.]+)/);
  if (priceMatch) out.price = Number(priceMatch[1]);

  // Info básica: segmento / CNPJ
  const segmentoMatch = html.match(/Segmento<\/[^>]*>\s*<[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i);
  if (segmentoMatch) out.segment = segmentoMatch[1].trim();
  const cnpjMatch = html.match(/CNPJ[^<]*<\/[^>]*>\s*<[^>]*>([^<]+)<\/[^>]*>/i);
  if (cnpjMatch) out.cnpj = cnpjMatch[1].trim();

  // Composição / Ativos: tenta pegar lista de imóveis ou carteira
  // StatusInvest FIIs tem tabela de Ativos
  out.composition = [];
  // procura por imóveis: nome + ABL
  const imoveisRe = /data-company="([^"]+)"[\s\S]{0,300}?ABL[^0-9]*([\d.,]+)\s*m/gi;
  let m;
  while ((m = imoveisRe.exec(html)) !== null) {
    out.composition.push({ name: m[1].trim(), abl: m[2] });
    if (out.composition.length >= 20) break;
  }

  return Object.keys(out).length ? out : null;
}

async function fetchStatusInvest(ticker) {
  const cat = inferCategory(ticker);
  const urls = [
    `${STATUS_BASE}/${cat.statusPath}`,
    `${INV10_BASE}/${cat.inv10Path}`
  ];
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, 7000);
      if (!r.ok) continue;
      const html = await r.text();
      if (!html || html.length < 2000) continue;
      const parsed = parseStatusInvest(html, ticker);
      if (parsed && (parsed.dy != null || parsed.lastDividend != null)) {
        return { source: url.includes('statusinvest') ? 'statusinvest' : 'investidor10', url, info: parsed };
      }
      // mesmo sem dividendos, retorna html útil para Raio-X (tamanho > 5k)
      if (html.length > 8000) return { source: url.includes('statusinvest') ? 'statusinvest' : 'investidor10', url, info: parsed || { rawLength: html.length } };
    } catch (e) { /* tenta próximo */ }
  }
  return null;
}

// ---------- Handler ----------
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const single = url.searchParams.get('ticker') || url.searchParams.get('symbol') || '';
  const multi = url.searchParams.get('tickers') || url.searchParams.get('symbols') || '';
  const token = url.searchParams.get('token') || process.env.BRAPI_TOKEN || '';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=90, s-maxage=90');

  let list = [];
  if (multi) list = multi.split(',').map(s=> cleanTicker(s)).filter(Boolean).slice(0, 20);
  else if (single) list = [cleanTicker(single)];
  else {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Parâmetro ticker ou tickers obrigatório. Ex: ?ticker=MXRF11 ou ?tickers=MXRF11,PETR4' }));
    return;
  }

  const results = {};
  // Busca em paralelo com limite
  const settled = await Promise.allSettled(list.map(async (ticker) => {
    const brapi = await fetchBrapiInfo(ticker, token);
    const status = await fetchStatusInvest(ticker);
    // Merge: prioriza Brapi para dividendos, complementa com scraping
    const merged = {
      ticker,
      type: inferCategory(ticker).type,
      price: (brapi && brapi.price) || (status && status.info && status.info.price) || null,
      monthlyDividend: (brapi && brapi.monthlyDividend) || (status && status.info && status.info.lastDividend) || null,
      annualDividend: brapi ? brapi.annualDividend : null,
      dy: (brapi && brapi.dy) || (status && status.info && status.info.dy) || null,
      name: brapi ? brapi.name : null,
      sources: {
        brapi: brapi ? { ...brapi, brapiRaw: undefined } : null,
        scraping: status
      },
      // Para Raio-X: url e composição
      raioxUrl: status ? status.url : null,
      raioxComposition: status && status.info && status.info.composition ? status.info.composition : []
    };
    // Normaliza: se só tem annual, deriva monthly; se só tem monthly deriva annual
    if (merged.annualDividend == null && merged.monthlyDividend != null) {
      const isFII = /11$/.test(ticker);
      merged.annualDividend = isFII ? merged.monthlyDividend * 12 : merged.monthlyDividend * 12;
    }
    if (merged.monthlyDividend == null && merged.annualDividend != null) {
      merged.monthlyDividend = merged.annualDividend / 12;
    }
    if (merged.annualDividend != null) merged.annualDividend = Number(merged.annualDividend.toFixed(4));
    if (merged.monthlyDividend != null) merged.monthlyDividend = Number(merged.monthlyDividend.toFixed(4));
    return merged;
  }));

  settled.forEach((r, i) => {
    const t = list[i];
    if (r.status === 'fulfilled' && r.value) results[t] = r.value;
    else results[t] = { ticker: t, error: r.reason ? r.reason.message : 'erro' };
  });

  res.statusCode = 200;
  res.end(JSON.stringify({ results, fetchedAt: new Date().toISOString(), count: list.length }));
};
