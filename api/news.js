/**
 * Função Serverless: /api/news
 * Compila as principais notícias do mercado de capitais a partir de feeds RSS.
 * NÃO armazena nada — busca, filtra, ordena e devolve o JSON do dia.
 */

const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'PrevidenciaInvest/1.0 (+https://previdencia-invest)'
  }
});

// Fontes de feeds RSS de notícias financeiras (configuráveis)
const SOURCES = [
  { id: 'infomoney', name: 'InfoMoney', url: 'https://www.infomoney.com.br/mercados/feed/' },
  { id: 'valor', name: 'Valor Invest', url: 'https://valor.globo.com/rss/valor/investimentos' },
  { id: 'exame', name: 'Exame', url: 'https://exame.com/feed/' },
  { id: 'moneytimes', name: 'Money Times', url: 'https://www.moneytimes.com.br/feed/' },
  { id: 'bloomberglinea', name: 'Bloomberg Línea', url: 'https://www.bloomberglinea.com.br/feed' },
  { id: 'cnn', name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
  { id: 'suno', name: 'Suno Notícias', url: 'https://www.suno.com.br/feed/' },
  { id: 'investing', name: 'Investing.com', url: 'https://br.investing.com/rss/news.rss' }
];

// Palavras-chave de relevância para o mercado de capitais
const KEYWORDS = [
  'ibovespa', 'bovespa', 'bolsa', 'a\u00e7\u00f5es', 'acao', 'fundo imobili', 'fii',
  'd\u00f3lar', 'dolar', 'c\u00e2mbio', 'cambio', 'juros', 'copom', 'selic', 'bcb',
  'infla\u00e7\u00e3o', 'inflacao', 'ipca', 'dividend', 'renda fixa', 'tesouro',
  'previd\u00eancia', 'previden', 'cripto', 'bitcoin', 'etf', 'bdr', 'b3 ',
  'wall street', 'fed', 'federal reserve', 'economia', 'pib', 'petr', 'vale3',
  'petrobras', 'banco', 'banco central', 'balan\u00e7o', 'lucro', 'resultado',
  'provento', 'jcp', 'mercado financeiro', 'investidor', 'bolsas', 'nasdaq',
  's&p', 'commodities', 'petr\u00f3leo', 'petroleo', 'mineradora', 'banco central'
];

const MAX_FEED_ITEMS = 60;

function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã¢/g, 'â')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã´/g, 'ô')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã¤/g, 'ä')
    .replace(/Ã¶/g, 'ö')
    .replace(/Ã£o/g, 'ão')
    .replace(/Ã£e/g, 'ãe')
    .replace(/Ãµ/g, 'õ');
}

function stripHtml(html) {
  return normalizeText(String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function isRelevant(text) {
  const lower = text.toLowerCase();
  return KEYWORDS.some((kw) => lower.includes(kw));
}

function extractImage(item) {
  const lookups = [
    item && item['media:content'] && item['media:content'].$ && item['media:content'].$.url,
    item && item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url,
    item && item.enclosure && item.enclosure.url
  ];
  for (const val of lookups) {
    if (val && /^https?:\/\//.test(String(val))) return String(val);
  }
  return null;
}

async function fetchFeed(source) {
  const feed = await parser.parseURL(source.url);
  const items = (feed.items || []).slice(0, MAX_FEED_ITEMS);

  return items.map((item) => {
    const title = normalizeText(item.title || '').trim();
    const link = item.link || '';
    const desc = stripHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 300);

    const pubDate = item.isoDate
      ? new Date(item.isoDate).toISOString()
      : (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());

    return {
      title,
      link,
      description: desc,
      source: { id: source.id, name: source.name },
      pubDate,
      image: extractImage(item)
    };
  }).filter((i) => i.title && i.link);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const limitRaw = parseInt(url.searchParams.get('limit') || '30', 10);
  const limit = Math.min(Math.max(limitRaw, 1), 60);

  const settled = await Promise.allSettled(SOURCES.map((source) => fetchFeed(source)));

  const items = [];
  const sourcesFailed = [];
  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      sourcesFailed.push(SOURCES[idx].name);
    }
  });

  const unique = new Map();
  items.forEach((item) => {
    const key = item.link.trim().toLowerCase();
    if (!key) return;
    if (!unique.has(key)) unique.set(key, item);
  });

  const filtered = Array.from(unique.values())
    .filter((item) => isRelevant(`${item.title} ${item.description}`))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, limit);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.statusCode = 200;
  res.end(JSON.stringify({
    items: filtered,
    fetchedAt: new Date().toISOString(),
    sourcesOk: SOURCES.length - sourcesFailed.length,
    sourcesFailed
  }));
};