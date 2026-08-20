/**
 * Serviço de Notícias do Mercado de Capitais
 * Busca o compilado do dia no endpoint serverless /api/news (RSS) e renderiza.
 * Sem armazenamento: o conteúdo é buscado a cada carga/refresh da aba.
 */

const NEWS_ENDPOINT = '/api/news';

// Cache curto em memória apenas para evitar refetch em múltiplas renderizações
let newsCache = { items: null, fetchedAt: 0, promise: null };
const NEWS_MEMORY_TTL_MS = 5 * 60 * 1000;

function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPubDate(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).replace('.', '');
  } catch (e) {
    return '';
  }
}

async function fetchMarketNews(limit = 30) {
  if (newsCache.promise) return newsCache.promise;

  newsCache.promise = (async () => {
    const response = await fetch(`${NEWS_ENDPOINT}?limit=${limit}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Erro ao buscar notícias (HTTP ${response.status}).`);
    }
    const data = await response.json();
    newsCache.items = data && Array.isArray(data.items) ? data.items : [];
    newsCache.fetchedAt = Date.now();
    return newsCache.items;
  })()
    .catch((err) => {
      newsCache.promise = null;
      throw err;
    });

  return newsCache.promise;
}

function forceRefreshNews(limit = 30) {
  newsCache.promise = null;
  newsCache.items = null;
  return fetchMarketNews(limit);
}

function renderNewsSkeleton(container) {
  if (!container) return;
  const skeletonCard = `
    <div class="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <div class="flex items-center justify-between">
        <div class="h-5 w-20 rounded-full bg-gray-200/80 skeleton-shimmer"></div>
        <div class="h-4 w-16 rounded bg-gray-200/80 skeleton-shimmer"></div>
      </div>
      <div class="space-y-2">
        <div class="h-4 w-full rounded bg-gray-200/60 skeleton-shimmer"></div>
        <div class="h-4 w-4/5 rounded bg-gray-200/60 skeleton-shimmer"></div>
      </div>
      <div class="space-y-1.5">
        <div class="h-3 w-full rounded bg-gray-200/40 skeleton-shimmer"></div>
        <div class="h-3 w-full rounded bg-gray-200/40 skeleton-shimmer"></div>
        <div class="h-3 w-2/3 rounded bg-gray-200/40 skeleton-shimmer"></div>
      </div>
      <div class="h-3 w-24 rounded bg-gray-200/80 skeleton-shimmer"></div>
    </div>
  `;
  container.innerHTML = Array.from({ length: 6 }, () => skeletonCard).join('');
}

function renderNewsError(container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="bg-white border border-rose-500/30 rounded-2xl p-6 text-center space-y-2">
      <i data-lucide="cloud-off" class="w-8 h-8 text-rose-400 mx-auto"></i>
      <p class="text-sm font-semibold text-rose-400">Não foi possível carregar as notícias agora.</p>
      <p class="text-xs text-gray-500">${escapeHTML(message)}</p>
      <p class="text-[11px] text-gray-500">Tente novamente em alguns instantes ou use o botão Atualizar.</p>
    </div>
  `;
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

function renderNewsEmpty(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-2">
      <i data-lucide="newspaper" class="w-8 h-8 text-gray-500 mx-auto"></i>
      <p class="text-sm font-semibold text-gray-600">Nenhuma notícia relevante no momento.</p>
      <p class="text-xs text-gray-500">Os feeds ainda não retornaram conteúdo filtrado para o mercado de capitais hoje.</p>
    </div>
  `;
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

function buildNewsCard(item) {
  const source = item.source || {};
  const color = { infomoney: 'emerald', valor: 'amber', exame: 'rose', moneytimes: 'sky', bloomberglinea: 'indigo', cnn: 'rose', suno: 'violet', investing: 'cyan' }[source.id] || 'gray';
  const badgeClass = `bg-${color}-500/10 text-${color}-400 border border-${color}-500/20`;
  const date = formatPubDate(item.pubDate);

  return `
    <a href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer nofollow"
       class="group bg-white hover:bg-gray-50 border border-gray-200 hover:border-${color}-500/40 rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${badgeClass}">${escapeHTML(source.name || 'Mercado')}</span>
        ${date ? `<span class="text-[11px] text-gray-500 whitespace-nowrap">${escapeHTML(date)}</span>` : ''}
      </div>
      <h3 class="text-sm font-bold text-gray-900 leading-snug group-hover:${color}-400 transition line-clamp-2">${escapeHTML(item.title)}</h3>
      ${item.description ? `<p class="text-xs text-gray-500 leading-relaxed line-clamp-3">${escapeHTML(item.description)}</p>` : ''}
      <span class="text-[11px] font-semibold text-${color}-400 flex items-center gap-1">
        Ler matéria <i data-lucide="external-link" class="w-3 h-3"></i>
      </span>
    </a>
  `;
}

function renderNewsList(container, items) {
  if (!container) return;
  if (!items || items.length === 0) {
    renderNewsEmpty(container);
    return;
  }
  container.innerHTML = items.map(buildNewsCard).join('');
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

if (typeof module !== 'undefined') {
  module.exports = {
    fetchMarketNews,
    forceRefreshNews,
    renderNewsSkeleton,
    renderNewsError,
    renderNewsEmpty,
    renderNewsList
  };
}