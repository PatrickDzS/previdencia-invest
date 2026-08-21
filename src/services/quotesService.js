/**
 * Serviço de Cotações Gratuitas do Pregão (Brapi.dev + Yahoo Finance)
 * Com Cache Inteligente e Fallback Automático para economizar requisições.
 */

const CACHE_KEY = "previdencia_invest_quotes_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos de cache
const HIST_CACHE_KEY = "previdencia_invest_hist_cache";
const HIST_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos de cache

// Períodos suportados pelo comparador -> (interval, range) do Yahoo Finance
// 1D = intraday do pregão de hoje (ao vivo), demais = histórico para decidir aporte
const HIST_RANGES = {
  '1D': { interval: '5m', range: '1d' },
  '1M': { interval: '1d', range: '1mo' },
  '3M': { interval: '1d', range: '3mo' },
  '6M': { interval: '1wk', range: '6mo' },
  '1Y': { interval: '1wk', range: '1y' },
  '2Y': { interval: '1mo', range: '2y' },
  '5Y': { interval: '1mo', range: '5y' }
};

// 3. Série histórica de preços (Yahoo Finance) para o Comparador de Performance — ao vivo e para decisão de aporte
async function fetchHistoricalSeries(ticker, period = '1Y') {
  const clean = String(ticker).toUpperCase().trim();
  if (!clean) return { ticker: clean, points: [] };

  const cfg = HIST_RANGES[period] || HIST_RANGES['1Y'];
  const key = `${clean}:${period}`;
  const cache = getHistoricalCache();
  const now = Date.now();

  // TTL menor para intraday (1D) = 2 min ao vivo, demais = 30 min
  const ttl = period === '1D' ? 2 * 60 * 1000 : HIST_CACHE_TTL_MS;
  if (cache[key] && (now - cache[key].timestamp < ttl)) {
    return { ticker: clean, points: cache[key].points, source: 'cache' };
  }

  // Normaliza ticker B3 -> .SA
  const isIntraday = period === '1D';
  let points = null;
  let source = 'yahoo';

  // 1) Tenta proxy serverless /api/yahoo (evita CORS, sempre funciona em produção/Vercel)
  try {
    const qs = new URLSearchParams({ symbol: clean, interval: cfg.interval, range: cfg.range }).toString();
    const proxyUrl = `/api/yahoo?${qs}`;
    const r = await fetch(proxyUrl);
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.points) && j.points.length > 0) {
        points = j.points;
        source = 'yahoo-proxy';
      } else if (j && j.error) {
        throw new Error(j.error);
      }
    }
  } catch (e) {
    // proxy não disponível em dev local (sem Vercel), segue para fallback direto
  }

  // 2) Fallback direto ao Yahoo (query1 -> query2) se proxy falhou
  if (!points) {
    const yahooTicker = (clean.length <= 6 && !clean.includes('.')) ? `${clean}.SA` : clean;
    const bases = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=${cfg.interval}&range=${cfg.range}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=${cfg.interval}&range=${cfg.range}`
    ];
    let lastErr = null;
    for (const url of bases) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
        const json = await response.json();
        const result = json && json.chart && json.chart.result && json.chart.result[0];
        if (!result) throw new Error(`Sem dados para ${clean}`);
        const timestamps = result.timestamp || [];
        const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
        const byDate = new Map();
        for (let i = 0; i < timestamps.length; i++) {
          const close = closes[i];
          if (typeof close === 'number' && close > 0 && isFinite(close)) {
            const d = new Date(timestamps[i] * 1000);
            // Intraday: mantém hora para gráfico ao vivo; diário: agrupa por dia (último close do dia)
            const keyDate = isIntraday ? d.toISOString() : d.toISOString().slice(0, 10);
            byDate.set(keyDate, close);
          }
        }
        points = Array.from(byDate.entries()).map(([date, close]) => ({ date, close }));
        if (points.length > 0) break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!points) throw lastErr || new Error(`Sem dados históricos para ${clean}`);
    source = 'yahoo-direct';
  }

  // Para intraday, já vem com timestamp completo; para diário, garante ordenação
  points.sort((a,b) => new Date(a.date) - new Date(b.date));

  cache[key] = { timestamp: now, points };
  saveHistoricalCache(cache);

  return { ticker: clean, points, source };
}

// Função para obter cotações com cache local
async function getLiveQuotes(tickers = [], customBrapiToken = "") {
  if (!tickers || tickers.length === 0) return {};

  const cleanTickers = [...new Set(tickers.map(t => t.toUpperCase().trim()))];
  const cachedData = getCachedQuotes();
  const now = Date.now();

  const missingTickers = [];
  const result = {};

  cleanTickers.forEach(t => {
    if (cachedData[t] && (now - cachedData[t].timestamp < CACHE_TTL_MS)) {
      result[t] = cachedData[t].data;
    } else {
      missingTickers.push(t);
    }
  });

  if (missingTickers.length === 0) {
    return result;
  }

  // Tentar buscar primeiro na Brapi
  try {
    const brapiResults = await fetchFromBrapi(missingTickers, customBrapiToken);
    Object.assign(result, brapiResults);
    saveQuotesToCache(brapiResults);
  } catch (err) {
    console.warn("Brapi API falhou ou cota excedida, tentando Yahoo Finance...", err);
    try {
      const yahooResults = await fetchFromYahoo(missingTickers);
      Object.assign(result, yahooResults);
      saveQuotesToCache(yahooResults);
    } catch (yErr) {
      console.warn("Yahoo Finance também falhou, usando valores de segurança...", yErr);
    }
  }

  return result;
}

// 1. Busca na Brapi.dev (B3 nativa com múltiplos e proventos)
async function fetchFromBrapi(tickers = [], token = "") {
  const tokenParam = token ? `?token=${token}` : "";
  const tickerList = tickers.join(",");
  const url = `https://brapi.dev/api/quote/${tickerList}${tokenParam}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Brapi HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const results = {};

  if (data && data.results) {
    data.results.forEach(item => {
      if (item.symbol) {
        results[item.symbol.toUpperCase()] = {
          ticker: item.symbol.toUpperCase(),
          name: item.longName || item.shortName || item.symbol,
          currentPrice: Number(item.regularMarketPrice) || 0,
          changePercent: Number(item.regularMarketChangePercent) || 0,
          high: Number(item.regularMarketDayHigh) || 0,
          low: Number(item.regularMarketDayLow) || 0,
          volume: item.regularMarketVolume || 0,
          source: "Brapi.dev",
          updatedAt: new Date().toISOString()
        };
      }
    });
  }

  return results;
}

// 2. Busca no Yahoo Finance (Gratuito, suporte a B3 com sufixo .SA e Stocks USD)
async function fetchFromYahoo(tickers = []) {
  const results = {};

  for (const ticker of tickers) {
    try {
      // Se for ativo B3 e não tiver ponto, adiciona .SA. Se for ativo em USD (ex: AAPL), usa direto
      const yahooTicker = (ticker.length <= 6 && !ticker.includes('.')) ? `${ticker}.SA` : ticker;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;

      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (meta && meta.regularMarketPrice) {
          const prevClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
          const curPrice = meta.regularMarketPrice;
          const changePct = prevClose > 0 ? ((curPrice - prevClose) / prevClose) * 100 : 0;

          results[ticker] = {
            ticker,
            name: meta.symbol || ticker,
            currentPrice: Number(curPrice.toFixed(2)),
            changePercent: Number(changePct.toFixed(2)),
            high: Number((meta.regularMarketDayHigh || curPrice).toFixed(2)),
            low: Number((meta.regularMarketDayLow || curPrice).toFixed(2)),
            currency: meta.currency || "BRL",
            source: "Yahoo Finance",
            updatedAt: new Date().toISOString()
          };
        }
      }
    } catch (e) {
      console.warn(`Erro ao buscar ${ticker} no Yahoo:`, e);
    }
  }

  return results;
}

// Gerenciamento de Cache
function getCachedQuotes() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveQuotesToCache(newQuotes = {}) {
  try {
    if (typeof localStorage === 'undefined') return;
    const current = getCachedQuotes();
    const now = Date.now();

    Object.keys(newQuotes).forEach(t => {
      current[t] = {
        timestamp: now,
        data: newQuotes[t]
      };
    });

    localStorage.setItem(CACHE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error("Erro ao salvar cache de cotações:", e);
  }
}

// Gerenciamento de Cache do Histórico
function getHistoricalCache() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(HIST_CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveHistoricalCache(cache) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(HIST_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Erro ao salvar cache de histórico:", e);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    getLiveQuotes,
    fetchFromBrapi,
    fetchFromYahoo,
    fetchHistoricalSeries
  };
}
