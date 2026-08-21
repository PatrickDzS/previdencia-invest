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

// ---------- StatusInvest / Investidor10 scraping (Raio-X dentro do card) ----------
function parseStatusInvest(html, ticker) {
  if (!html || typeof html !== 'string') return null;
  const out = {};
  const txt = html.replace(/\s+/g,' ');

  const toNum = (s)=> {
    if (!s) return null;
    const v = String(s).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'');
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // DY: Dividend Yield
  const dyMatch = html.match(/Dividend\s*Yield[^<]*<\/[^>]*>\s*<[^>]*>\s*<strong[^>]*>([\d.,]+)%/i)
    || html.match(/\bDY\b[^<]*<\/[^>]*>\s*<strong[^>]*>([\d.,]+)%/i)
    || html.match(/DY \(12M\)[^<]*<\/[^>]*>[\s\S]{0,120}?([\d.,]+)%/i);
  if (dyMatch) out.dy = toNum(dyMatch[1]);

  // Último rendimento / Dividendo mensal
  const ultimoMatch = html.match(/Último\s*rendimento[^<]*<\/[^>]*>\s*<[^>]*>\s*<strong[^>]*>R\$\s*([\d.,]+)/i)
    || html.match(/Último\s*dividendo[^<]*<\/[^>]*>\s*<[^>]*>R\$\s*([\d.,]+)/i)
    || html.match(/Rendimento[^<]*<\/[^>]*>\s*<strong[^>]*>R\$\s*([\d.,]+)/i);
  if (ultimoMatch) out.lastDividend = toNum(ultimoMatch[1]);

  // Preço atual
  const priceMatch = html.match(/"price"\s*:\s*([\d.]+)/) || html.match(/regularMarketPrice"\s*:\s*([\d.]+)/);
  if (priceMatch) out.price = Number(priceMatch[1]);
  // Investidor10 preço: <span class="value">R$ 95,20</span> perto de Cotação
  if (!out.price) {
    const invPrice = html.match(/Cota[çc][ãa]o[^<]*<\/[^>]*>\s*<[^>]*>R\$\s*([\d.,]+)/i);
    if (invPrice) out.price = toNum(invPrice[1]);
  }

  // Campos Raio-X para dentro do card
  const getField = (labelRe) => {
    const re = new RegExp(labelRe + '[^<]*<\\/[^>]*>\\s*<[^>]*>\\s*([^<]+?)\\s*<\\/', 'i');
    const m = html.match(re);
    return m ? m[1].replace(/<[^>]*>/g,'').trim() : null;
  };
  out.segment = getField('Segmento') || getField('Setor') || null;
  out.cnpj = getField('CNPJ') || null;
  out.pvp = getField('P\\/VP') ? toNum(getField('P\\/VP')) : (html.match(/P\/VP[^<]*<\/[^>]*>\s*<strong[^>]*>([\d.,]+)/i) ? toNum(html.match(/P\/VP[^<]*<\/[^>]*>\s*<strong[^>]*>([\d.,]+)/i)[1]) : null);
  out.patrimonio = getField('Patrim[ôo]nio') || getField('Patrim[ôo]nio L[íi]quido') || null;
  out.patrimonioNum = out.patrimonio ? toNum(out.patrimonio) : null;
  out.vacancia = getField('Vac[âa]ncia') ? toNum(getField('Vac[âa]ncia')) : (html.match(/Vac[âa]ncia[^<]*<\/[^>]*>\s*<strong[^>]*>([\d.,]+)%/i) ? toNum(html.match(/Vac[âa]ncia[^<]*<\/[^>]*>\s*<strong[^>]*>([\d.,]+)%/i)[1]) : null);
  out.liquidez = getField('Liquidez') || getField('Liquidez Di[áa]ria') || null;
  out.cotas = getField('Cotas? emitidas') || getField('N[úu]mero de cotas') || null;
  out.administrador = getField('Administrador') || null;
  // Descrição / O que é – pega primeiro parágrafo relevante
  const descMatch = html.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]{30,400})<\/p>/i)
    || html.match(/Sobre[^<]*<\/h\d>[^<]*<p[^>]*>([^<]{30,600})<\/p>/i);
  if (descMatch) out.descricao = descMatch[1].replace(/<[^>]*>/g,'').trim().slice(0,600);

  // Composição / Ativos: FIIs tijolo (imóveis) e FIIs papel (CRIs)
  out.composition = [];
  // Imóveis: Investidor10 tem cards de ativos
  const imoveisRe = /data-company="([^"]+)"[\s\S]{0,300}?ABL[^0-9]*([\d.,]+)\s*m/gi;
  let m;
  while ((m = imoveisRe.exec(html)) !== null) {
    out.composition.push({ name: m[1].trim(), abl: m[2].trim(), type: 'imovel' });
    if (out.composition.length >= 20) break;
  }
  // Fallback: procura linhas de tabela de ativos (Investidor10)
  if (!out.composition.length) {
    const rowRe = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]{3,80})<\/td>[\s\S]*?R\$\s*([\d.,]+)[\s\S]*?<td[^>]*>([^<]*%)/gi;
    let r;
    while ((r = rowRe.exec(html)) !== null) {
      out.composition.push({ name: r[1].trim(), value: r[2].trim(), extra: r[3].trim() });
      if (out.composition.length >= 12) break;
    }
  }
  // CRIs / Carteira para FIIs papel
  if (!out.composition.length) {
    const criRe = /CRI[^<]*<\/[^>]*>\s*<[^>]*>([^<]{5,60})</gi;
    let c;
    while ((c = criRe.exec(html)) !== null) {
      out.composition.push({ name: c[1].trim(), type: 'cri' });
      if (out.composition.length >= 12) break;
    }
  }

  // Mantém apenas campos preenchidos
  const hasData = Object.keys(out).some(k=> out[k] != null && (Array.isArray(out[k]) ? out[k].length : true));
  return hasData ? out : null;
}

async function fetchStatusInvest(ticker) {
  const t = cleanTicker(ticker);
  const lower = t.toLowerCase();
  // tenta todas as categorias (FII 11 pode ser ETF, BDR 34, etc) – evita erro de inferência
  const tryPaths = [
    `fiis/${lower}`, `acoes/${lower}`, `etfs/${lower}`, `bdrs/${lower}`, `bdr/${lower}`, `fundos/${lower}`
  ];
  const urls = [];
  // prioriza a categoria inferida primeiro
  const cat = inferCategory(ticker);
  urls.push(`${STATUS_BASE}/${cat.statusPath}`, `${INV10_BASE}/${cat.inv10Path}`);
  for (const p of tryPaths) {
    const sUrl = `${STATUS_BASE}/${p}`;
    const iUrl = `${INV10_BASE}/${p}`;
    if (!urls.includes(sUrl)) urls.push(sUrl);
    if (!urls.includes(iUrl)) urls.push(iUrl);
  }
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, 7000);
      if (!r.ok) continue;
      // Cloudflare pode retornar 403 com página de desafio – detecta
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = await r.text();
        if (!html || html.length < 2000) continue;
        // detecta página de bloqueio Cloudflare
        if (/Just a moment|Checking if the site connection is secure|cf-chl/i.test(html)) continue;
        const parsed = parseStatusInvest(html, ticker);
        if (parsed && (parsed.dy != null || parsed.lastDividend != null || parsed.pvp != null || parsed.composition.length)) {
          return { source: url.includes('statusinvest') ? 'statusinvest' : 'investidor10', url, info: parsed };
        }
        // mesmo sem dividendos, retorna se html é útil para Raio-X (tamanho > 5k e contém ticker)
        if (html.length > 8000 && html.toLowerCase().includes(lower)) {
          return { source: url.includes('statusinvest') ? 'statusinvest' : 'investidor10', url, info: parsed || { rawLength: html.length, segment: parsed?.segment || null } };
        }
      }
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
