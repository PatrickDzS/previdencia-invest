// Previdência Invest Application Logic
let portfolioState = { id: null, name: 'Minha Carteira Previdenciária', targetAllocations: {}, assets: [] };
let activeFilter = 'ALL';
let retirementChart = null;
let quickActionAnimated = false;
let newsItems = [];
let newsSourceFilter = 'ALL';
let newsLastLoad = 0;
const NEWS_STALE_MS = 10 * 60 * 1000;
const PERF_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#22c55e', '#f97316', '#14b8a6'];
const PERF_PERIOD_YEARS = { '1M': 1/12, '3M': 3/12, '6M': 0.5, '1Y': 1, '2Y': 2, '5Y': 5 };
const perfState = { tickers: [], period: '1Y', metric: 'TOTAL' };
let perfLineChart = null;
let perfBarChart = null;

/* ---------- Helpers de Animação ---------- */
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function animateNumber(el, target, opts = {}) {
  if (!el) return;
  const { prefix = '', suffix = '', decimals = 0, duration = 900, onComplete } = opts;
  const fmt = (v) => `${prefix}${v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  const done = () => { el.innerText = fmt(target); if (typeof onComplete === 'function') onComplete(); };
  if (REDUCED_MOTION || target === 0) { done(); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.innerText = fmt(target * eased);
    if (p < 1) { requestAnimationFrame(step); } else { done(); }
  };
  requestAnimationFrame(step);
}

function animateBar(el, targetPercent) {
  if (!el) return;
  el.style.width = '0%';
  if (REDUCED_MOTION || targetPercent <= 0) { el.style.width = `${targetPercent}%`; return; }
  const start = performance.now();
  const duration = 800;
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.style.width = `${(eased * targetPercent).toFixed(2)}%`;
    if (p < 1) { requestAnimationFrame(step); } else { el.style.width = `${targetPercent}%`; }
  };
  requestAnimationFrame(step);
}

function entrance(el, anim = 'slide-up') {
  if (!el) return;
  el.classList.remove('anim-fade-in', 'anim-slide-up', 'anim-pop');
  void el.offsetWidth;
  el.classList.add(`anim-${anim}`);
}

function staggerIn(container, delay = 60) {
  if (!container) return;
  const children = Array.from(container.children);
  children.forEach((child, i) => {
    child.classList.add('anim-stagger-item');
    child.style.animationDelay = `${i * delay}ms`;
  });
  if (REDUCED_MOTION) {
    children.forEach((child) => child.classList.remove('anim-stagger-item'));
  }
}

function pulse(el) {
  if (!el || REDUCED_MOTION) return;
  el.classList.remove('anim-pop');
  void el.offsetWidth;
  el.classList.add('anim-pop');
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
  initAuthGate();
});

// Função de bootstrap: roda só depois que o usuário autenticou (ou liberou o modo local)
function bootstrapApp(user) {
  loadStoredPortfolio();
  initNavigation();
  initMenu();
  initActionButtons();
  initFormAddAsset();
  initRaioXSelector();
  initRetirementSimulator();
  initPerformanceComparator();
  initTaxPage();
  if (!window.location.hash) window.location.hash = '#/dashboard';
  renderAllViews();
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }

  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();

  const metricGrid = document.querySelector('#tab-dashboard > .grid');
  if (metricGrid) staggerIn(metricGrid, 80);

  if (user) populateProfileUser(user);
}

/* ============================================================
   AUTH GATE - Primeira tela acessada (segurança de acesso)
   ============================================================ */
let authGateUnlocked = false;
const AUTH_GATE_EL = () => document.getElementById('login-gate');

function isSupabaseConfigured() {
  try {
    const cfg = (typeof getSupabaseConfig === 'function') ? getSupabaseConfig() : null;
    return !!(cfg && cfg.url && cfg.anonKey);
  } catch (e) {
    return false;
  }
}

function setGateVisible(visible) {
  const gate = AUTH_GATE_EL();
  const appEls = [
    document.getElementById('sidebar-menu'),
    document.getElementById('menu-overlay'),
    document.querySelector('header'),
    document.querySelector('main')
  ];
  if (gate) gate.classList.toggle('hidden', !visible);
  document.body.classList.toggle('overflow-hidden', visible);
  appEls.forEach(el => {
    if (!el) return;
    if (visible) { el.setAttribute('inert', ''); } else { el.removeAttribute('inert'); }
  });
}

function showAuthMessage(type, text) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  if (!text) { el.className = 'hidden'; el.innerText = ''; return; }
  const styles = {
    error: 'bg-rose-500/10 text-rose-600 border border-rose-500/30',
    success: 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30',
    info: 'bg-indigo-500/10 text-indigo-700 border border-indigo-500/30'
  };
  el.className = `text-xs rounded-xl px-3 py-2.5 font-medium flex items-start gap-2 ${styles[type] || styles.info}`;
  el.innerHTML = text;
}

function setAuthLoading(btn, loading) {
  if (!btn) return;
  const span = btn.querySelector('span');
  if (loading) {
    btn.dataset.label = span ? span.innerText : btn.innerText.trim();
    if (span) span.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle mr-1.5"></span>${btn.dataset.label}`;
    btn.disabled = true;
  } else {
    if (span && btn.dataset.label) span.innerText = btn.dataset.label;
    btn.disabled = false;
  }
}

function switchAuthView(view) {
  const forms = { login: 'form-login', signup: 'form-signup', forgot: 'form-forgot' };
  Object.entries(forms).forEach(([key, id]) => {
    const f = document.getElementById(id);
    if (f) f.classList.toggle('hidden', key !== view);
  });
  showAuthMessage(null, '');
}

function friendlyAuthError(err) {
  const msg = (err && (err.message || err.error_description)) || 'Erro inesperado. Tente novamente.';
  const lower = String(msg).toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('email or password') || lower.includes('password')) {
    return 'E-mail ou senha incorretos. Verifique e tente novamente.';
  }
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('user already')) {
    return 'Este e-mail já está cadastrado. Faça login ou use a recuperação de senha.';
  }
  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('exceeded')) {
    return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
  }
  if (lower.includes('not confirmed') || lower.includes('confirm')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('fetch')) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }
  return msg;
}

function renderGateLocalOnly() {
  ['form-login', 'form-signup', 'form-forgot'].forEach(id => {
    const f = document.getElementById(id);
    if (f) f.classList.add('hidden');
  });
  const divider = document.getElementById('auth-divider');
  if (divider) divider.classList.add('hidden');
  const google = document.getElementById('btn-login-google');
  if (google) google.classList.add('hidden');
  const signupLink = document.getElementById('btn-goto-signup');
  if (signupLink) signupLink.classList.add('hidden');
  const localBtn = document.getElementById('btn-local-mode');
  if (localBtn) { localBtn.classList.remove('hidden'); localBtn.classList.add('flex'); }
  showAuthMessage('info', '<i data-lucide="wifi-off" class="w-3.5 h-3.5 mt-0.5"></i> <span><strong>Modo Local:</strong> o Supabase ainda não está configurado neste ambiente. Você pode continuar sem login, mas os dados não serão sincronizados na nuvem.</span>');
  if (window.lucide) lucide.createIcons({ icons: lucide.icons });
}

function populateProfileUser(user) {
  if (!user) return;
  const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || 'Investidor';
  const email = user.email || '';

  const nameEl = document.getElementById('profile-name');
  if (nameEl) nameEl.innerText = name;

  const formName = document.getElementById('profile-form-name');
  const formEmail = document.getElementById('profile-form-email');
  if (formName) formName.value = name;
  if (formEmail) formEmail.value = email;

  if (typeof window.applyGoogleAvatar === 'function') {
    window.applyGoogleAvatar(user);
  }
}

function unlockApp(user, isLocal = false) {
  if (authGateUnlocked) { if (user) populateProfileUser(user); return; }
  authGateUnlocked = true;
  if (user) populateProfileUser(user);
  setGateVisible(false);
  bootstrapApp(user || null);
}

function lockApp() {
  authGateUnlocked = false;
  setGateVisible(true);
  switchAuthView('login');
  if (!isSupabaseConfigured()) {
    renderGateLocalOnly();
  }
}

async function handleLogout() {
  if (!isSupabaseConfigured()) {
    // Modo Local: não há conta para encerrar, permanece no app
    alert('Você está no Modo Local (sem login). Nada para encerrar.');
    return;
  }
  try {
    if (typeof signOutUser === 'function') await signOutUser();
  } catch (err) {
    console.warn('Erro ao encerrar sessão:', err);
  }
  lockApp();
}

function initAuthGate() {
  const gate = AUTH_GATE_EL();
  if (!gate) return;

  const loginForm = document.getElementById('form-login');
  const signupForm = document.getElementById('form-signup');
  const forgotForm = document.getElementById('form-forgot');
  const googleBtn = document.getElementById('btn-login-google');
  const localBtn = document.getElementById('btn-local-mode');

  // Navegação entre os formulários
  document.getElementById('btn-goto-signup')?.addEventListener('click', () => switchAuthView('signup'));
  document.getElementById('btn-goto-login')?.addEventListener('click', () => switchAuthView('login'));
  document.getElementById('btn-goto-forgot')?.addEventListener('click', () => switchAuthView('forgot'));
  document.getElementById('btn-back-to-login')?.addEventListener('click', () => switchAuthView('login'));

  // Login e-mail/senha
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showAuthMessage('error', 'Informe o e-mail e a senha.'); return; }
    const btn = document.getElementById('btn-login-submit');
    setAuthLoading(btn, true);
    try {
      const data = await signInUser(email, password);
      setAuthLoading(btn, false);
      if (data?.user) { unlockApp(data.user); return; }
      showAuthMessage('info', 'Sessão criada. Verifique seu e-mail para confirmar o acesso.');
    } catch (err) {
      setAuthLoading(btn, false);
      showAuthMessage('error', friendlyAuthError(err));
    }
  });

  // Cadastro de conta
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    if (!name) { showAuthMessage('error', 'Informe seu nome.'); return; }
    if (password.length < 6) { showAuthMessage('error', 'A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirm) { showAuthMessage('error', 'As senhas não coincidem.'); return; }
    const btn = document.getElementById('btn-signup-submit');
    setAuthLoading(btn, true);
    try {
      const data = await signUpUser(email, password, name);
      setAuthLoading(btn, false);
      if (data?.session?.user) { unlockApp(data.session.user); return; }
      switchAuthView('login');
      showAuthMessage('success', 'Conta criada! Enviamos um link de confirmação para o seu e-mail.');
      const emailInput = document.getElementById('login-email');
      if (emailInput) emailInput.value = email;
    } catch (err) {
      setAuthLoading(btn, false);
      showAuthMessage('error', friendlyAuthError(err));
    }
  });

  // Recuperação de senha
  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) { showAuthMessage('error', 'Informe seu e-mail cadastrado.'); return; }
    const btn = document.getElementById('btn-forgot-submit');
    setAuthLoading(btn, true);
    try {
      await resetPasswordForEmail(email);
      setAuthLoading(btn, false);
      switchAuthView('login');
      showAuthMessage('success', 'Link de redefinição enviado! Verifique sua caixa de entrada.');
    } catch (err) {
      setAuthLoading(btn, false);
      showAuthMessage('error', friendlyAuthError(err));
    }
  });

  // Google OAuth
  googleBtn?.addEventListener('click', async () => {
    setAuthLoading(googleBtn, true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthLoading(googleBtn, false);
      showAuthMessage('error', friendlyAuthError(err));
    }
  });

  // Modo Local (apenas quando Supabase não está configurado)
  localBtn?.addEventListener('click', () => unlockApp(null, true));

  // Listener de sessão (login, logout, OAuth redirect e refresh)
  if (typeof onAuthStateChange === 'function') {
    onAuthStateChange((event, user) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && user) {
        unlockApp(user);
      } else if (event === 'SIGNED_OUT') {
        lockApp();
      }
    });
  }

  // Decisão inicial
  if (!isSupabaseConfigured()) {
    // Modo Local: entra direto, sem exigir e-mail/senha
    unlockApp(null, true);
    return;
  }

  const sessionUser = (typeof getSessionUser === 'function') ? getSessionUser() : null;
  if (sessionUser) {
    unlockApp(sessionUser);
    if (typeof getLoggedUser === 'function') {
      getLoggedUser().then((serverUser) => {
        if (serverUser && sessionUser.id !== serverUser.id) {
          populateProfileUser(serverUser);
        }
      }).catch(() => {});
    }
    return;
  }

  setGateVisible(true);
}

function loadStoredPortfolio() {
  try {
    const saved = localStorage.getItem('previdencia_invest_portfolio');
    if (saved) {
      portfolioState = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Erro ao carregar dados locais:', e);
  }
}

function savePortfolioToStorage() {
  try {
    localStorage.setItem('previdencia_invest_portfolio', JSON.stringify(portfolioState));
  } catch (e) {
    console.error('Erro ao salvar:', e);
  }
}
// Menu lateral: fixo no desktop (lg+), drawer no mobile via hamburguer
function initMenu() {
  const sidebar = document.getElementById('sidebar-menu');
  const overlay = document.getElementById('menu-overlay');
  const btnToggle = document.getElementById('btn-menu-toggle');
  const btnClose = document.getElementById('btn-menu-close');
  const iconToggle = document.getElementById('icon-menu-toggle');

  const openMenu = () => {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'true');
    if (iconToggle) { iconToggle.setAttribute('data-lucide', 'x'); lucide.createIcons({ icons: lucide.icons }); }
  };

  const closeMenu = () => {
    if (!sidebar || !overlay) return;
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
    if (iconToggle) { iconToggle.setAttribute('data-lucide', 'menu'); lucide.createIcons({ icons: lucide.icons }); }
  };

  btnToggle?.addEventListener('click', () => {
    const isOpen = !sidebar.classList.contains('-translate-x-full');
    if (isOpen) { closeMenu(); } else { openMenu(); }
  });

  btnClose?.addEventListener('click', closeMenu);
  overlay?.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  // Fecha o drawer no mobile ao selecionar qualquer aba
  document.querySelectorAll('#sidebar-menu .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => closeMenu());
  });
}

/* ============================================================
   NAVEGAÇÃO POR HASH - Rotas de cada aba (#/dashboard, #/noticias...)
   ============================================================ */
const TAB_HASH_MAP = {
  dashboard: 'tab-dashboard',
  classes: 'tab-classes',
  notificacoes: 'tab-notificacoes',
  radar: 'tab-radar',
  noticias: 'tab-noticias',
  mdi: 'tab-mdi',
  raiox: 'tab-raiox',
  performance: 'tab-performance',
  academia: 'tab-academia',
  liberdade: 'tab-liberdade',
  fiscal: 'tab-fiscal',
  perfil: 'tab-perfil',
  config: 'tab-config'
};
const REVERSE_TAB_HASH_MAP = {};
Object.keys(TAB_HASH_MAP).forEach(route => {
  REVERSE_TAB_HASH_MAP[TAB_HASH_MAP[route]] = route;
});

let activateTabByButton = null;

function handleHashChange() {
  if (!authGateUnlocked || typeof activateTabByButton !== 'function') return;
  const route = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const tabId = TAB_HASH_MAP[route] || 'tab-dashboard';
  const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('data-tab') === tabId);
  if (btn) {
    activateTabByButton(btn, true);
    return;
  }
  const headerNotifBtn = document.getElementById('btn-header-notifications');
  if (tabId === 'tab-notificacoes' && headerNotifBtn) activateTabByButton(headerNotifBtn, true);
}

function initNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const headerNotifBtn = document.getElementById('btn-header-notifications');

  const activateTab = (btn, fromHash = false) => {
    const targetTab = btn.getAttribute('data-tab');
    const isHeaderNotif = btn === headerNotifBtn;

    tabBtns.forEach(b => {
      b.classList.remove('active-tab', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
      b.classList.add('text-gray-500', 'hover:bg-gray-200', 'border-transparent');
    });

    if (!isHeaderNotif) {
      btn.classList.add('active-tab', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
      btn.classList.remove('text-gray-500', 'hover:bg-gray-200', 'border-transparent');
    }

    if (headerNotifBtn) {
      headerNotifBtn.classList.toggle('ring-2', targetTab === 'tab-notificacoes');
      headerNotifBtn.classList.toggle('ring-amber-400/60', targetTab === 'tab-notificacoes');
    }

    tabContents.forEach(content => {
      content.classList.add('hidden');
    });

    const activeContent = document.getElementById(targetTab);
    if (activeContent) {
      activeContent.classList.remove('hidden');
      entrance(activeContent, 'fade-in');
    }

    if (targetTab === 'tab-liberdade' && !retirementChart) {
      updateRetirementSimulation();
    }

    if (targetTab === 'tab-raiox') {
      const select = document.getElementById('select-raiox-asset');
      if (select) renderRaioXDetail(select.value);
    }

    if (targetTab === 'tab-noticias') {
      loadNewsFeed();
    }

    if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }

    if (!fromHash && !isHeaderNotif && targetTab) {
      const route = REVERSE_TAB_HASH_MAP[targetTab] || 'dashboard';
      if (window.location.hash !== `#/${route}`) {
        window.location.hash = `#/${route}`;
      }
    }
  };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn));
  });

  activateTabByButton = activateTab;

  headerNotifBtn?.addEventListener('click', () => activateTab(headerNotifBtn));

  const filterBtns = document.querySelectorAll('.asset-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
filterBtns.forEach(b => {
        b.classList.remove('active-filter', 'bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/30');
        b.classList.add('bg-gray-200', 'text-gray-600');
      });
      btn.classList.add('active-filter', 'bg-emerald-500/10', 'text-emerald-400');
btn.classList.remove('bg-gray-200', 'text-gray-600');
      activeFilter = btn.getAttribute('data-filter');
      renderAssetsTable();
      if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
    });
  });
}

function renderAllViews() {
  renderDashboardMetrics();
  renderDailyRecommendation();
  renderAssetsTable();
  renderRadarTable();
  renderMdiMatrix();
  renderAcademyTracks();
  updateRetirementSimulation();
  renderRaioXDetail();
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}
function renderDashboardMetrics() {
  let totalPatrimony = 0;
  let totalCost = 0;
  let totalAnnualDividends = 0;
  let totalMonthlyDividends = 0;

  portfolioState.assets.forEach(asset => {
    const exchange = (asset.currency === 'USD' ? (asset.deepDive?.exchangeRateBRLUSD || 5.65) : 1);
    const curPriceBRL = asset.currentPrice * exchange;
    const avgPriceBRL = asset.averagePrice * exchange;
    
    const assetVal = curPriceBRL * asset.quantity;
    const costVal = avgPriceBRL * asset.quantity;
    
    totalPatrimony += assetVal;
    totalCost += costVal;
    
    const dpaAnnualBRL = (asset.historicalAverageDPA || 0) * exchange;
    totalAnnualDividends += (dpaAnnualBRL * asset.quantity);
    totalMonthlyDividends += ((asset.monthlyDividendEstimate || (dpaAnnualBRL / 12)) * exchange * asset.quantity);
  });

  const totalReturnBRL = totalPatrimony - totalCost;
  const totalReturnPct = totalCost > 0 ? ((totalReturnBRL / totalCost) * 100) : 0;
  const averageYoC = totalCost > 0 ? ((totalAnnualDividends / totalCost) * 100) : 0;
  
  const targetIncome = 5000;
  const capitalNeeded = (targetIncome * 12) / 0.085;
  const freedomProgress = Math.min(100, (totalPatrimony / capitalNeeded) * 100);

const patrimonyEl = document.getElementById('metric-total-patrimony');
  if (patrimonyEl) {
    animateNumber(patrimonyEl, totalPatrimony, { prefix: 'R$ ', decimals: 2 });
  }
  
  const returnEl = document.getElementById('metric-total-return');
  if (returnEl) {
    returnEl.innerHTML = `<i data-lucide="${totalReturnBRL >= 0 ? 'arrow-up-right' : 'arrow-down-right'}" class="w-3.5 h-3.5"></i> ${totalReturnBRL >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% (R$ ${Math.abs(totalReturnBRL).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
    returnEl.className = `text-xs font-medium flex items-center gap-1 ${totalReturnBRL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  }

  const monthlyDivEl = document.getElementById('metric-monthly-dividend');
  if (monthlyDivEl) {
    animateNumber(monthlyDivEl, totalMonthlyDividends, {
      prefix: 'R$ ', decimals: 2,
      onComplete: () => {
        monthlyDivEl.innerHTML = `R$ ${totalMonthlyDividends.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="text-xs font-medium text-gray-500">/mês</span>`;
      }
    });
  }

  const annualDivEl = document.getElementById('metric-annual-dividend');
  if (annualDivEl) {
    animateNumber(annualDivEl, totalAnnualDividends, { prefix: 'R$ ', decimals: 2, suffix: ' / ano projetado' });
  }

  const yocEl = document.getElementById('metric-yoc-average');
  if (yocEl) {
    animateNumber(yocEl, averageYoC, {
      decimals: 2, suffix: '%',
      onComplete: () => {
        yocEl.innerHTML = `${averageYoC.toFixed(2)}% <span class="text-xs font-medium text-gray-500">a.a.</span>`;
      }
    });
  }

  const progEl = document.getElementById('metric-freedom-progress');
  if (progEl) {
    animateNumber(progEl, freedomProgress, { decimals: 1, suffix: '%' });
  }

  const barEl = document.getElementById('metric-freedom-bar');
  if (barEl) {
    animateBar(barEl, freedomProgress);
  }
}

function renderDailyRecommendation() {
  const recEl = document.getElementById('daily-action-recommendation');
  if (!recEl) return;

  const bargains = portfolioState.assets.filter(a => {
    const bazin = calculateBazinCeilingPrice(a.historicalAverageDPA, a.targetAnnualYield || 0.06);
    return bazin > a.currentPrice;
  }).sort((a, b) => {
    const marginA = ((calculateBazinCeilingPrice(a.historicalAverageDPA, a.targetAnnualYield || 0.06) - a.currentPrice) / a.currentPrice);
    const marginB = ((calculateBazinCeilingPrice(b.historicalAverageDPA, b.targetAnnualYield || 0.06) - b.currentPrice) / b.currentPrice);
    return marginB - marginA;
  });

  if (bargains.length > 0) {
    const top = bargains[0];
    const bazin = calculateBazinCeilingPrice(top.historicalAverageDPA, top.targetAnnualYield || 0.06);
    const margin = calculateMarginOfSafety(bazin, top.currentPrice);
    recEl.innerHTML = `Hoje o ativo com maior margem de segurança na sua carteira é <strong>${top.ticker} (${top.name})</strong>. Cotação: <strong>R$ ${top.currentPrice.toFixed(2)}</strong> vs Preço Teto: <strong>R$ ${bazin.toFixed(2)}</strong> (Margem: <span class="text-emerald-400 font-bold">+${margin.toFixed(1)}%</span>). Sugestão de aporte prioritário no pregão!`;
} else {
    recEl.innerText = "Sua carteira está próxima do equilíbrio e todos os ativos estáo em faixa neutra de preço teto. Siga a disciplina de aportes regulares.";
  }

  const actionBox = document.getElementById('daily-action-box');
  if (actionBox && !quickActionAnimated) {
    quickActionAnimated = true;
    entrance(actionBox, 'pop');
  }
}
function renderAssetsTable() {
  const tbody = document.getElementById('assets-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = portfolioState.assets.filter(a => activeFilter === 'ALL' || a.type === activeFilter);

  filtered.forEach(asset => {
    const exchange = (asset.currency === 'USD' ? (asset.deepDive?.exchangeRateBRLUSD || 5.65) : 1);
    const curPriceBRL = asset.currentPrice * exchange;
    const avgPriceBRL = asset.averagePrice * exchange;
    const totalValBRL = curPriceBRL * asset.quantity;
    
    const bazin = calculateBazinCeilingPrice(asset.historicalAverageDPA, asset.targetAnnualYield || 0.06);
    const margin = calculateMarginOfSafety(bazin, asset.currentPrice);
    const yoc = calculateYieldOnCost(asset.historicalAverageDPA, asset.averagePrice);

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-200/40 transition font-medium';
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center font-bold text-emerald-400 text-[11px] shrink-0">
            ${asset.ticker.slice(0, 3)}
          </div>
          <div class="min-w-0">
            <div class="font-bold text-gray-900 text-xs">${asset.ticker}</div>
            <div class="text-[11px] text-gray-500 truncate max-w-[130px]">${asset.name}</div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4">
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${getTypeBadgeClass(asset.type)}">
          <i data-lucide="${getTypeIcon(asset.type)}" class="shrink-0" style="width:12px;height:12px"></i>
          ${formatTypeLabel(asset.type)}
        </span>
      </td>
      <td class="py-3 px-4 text-right text-gray-700 font-bold">${asset.quantity}</td>
      <td class="py-3 px-4 text-right text-gray-500">R$ ${avgPriceBRL.toFixed(2)}</td>
      <td class="py-3 px-4 text-right font-bold ${curPriceBRL >= avgPriceBRL ? 'text-emerald-400' : 'text-rose-400'}">
        R$ ${curPriceBRL.toFixed(2)}
      </td>
      <td class="py-3 px-4 text-right text-amber-400 font-bold">R$ ${(bazin * exchange).toFixed(2)}</td>
      <td class="py-3 px-4 text-right font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
        ${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%
      </td>
      <td class="py-3 px-4 text-right text-indigo-400 font-bold">${yoc.toFixed(1)}%</td>
      <td class="py-3 px-4 text-right font-bold text-gray-900">R$ ${totalValBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="py-3 px-4 text-center">
        <button onclick="openRaioXForTicker('${asset.ticker}')" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40">
          <i data-lucide="microscope" class="shrink-0" style="width:12px;height:12px"></i> Raio-X
        </button>
      </td>
    `;
tbody.appendChild(tr);
  });

  staggerIn(tbody);
}

function renderRadarTable() {
  const tbody = document.getElementById('radar-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  portfolioState.assets.forEach(asset => {
    const bazin = calculateBazinCeilingPrice(asset.historicalAverageDPA, asset.targetAnnualYield || 0.06);
    const margin = calculateMarginOfSafety(bazin, asset.currentPrice);
    const monthlyDiv = asset.monthlyDividendEstimate || (asset.historicalAverageDPA / 12);
    const magicNum = calculateMagicNumber(asset.currentPrice, monthlyDiv);
    const progress = Math.min(100, ((asset.quantity / (magicNum || 1)) * 100));

    let diagnosticBadge = '';
    if (margin >= 15) {
      diagnosticBadge = '<span class="anim-pulse-soft px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">COMPRA FORTE</span>';
    } else if (margin >= 0) {
      diagnosticBadge = '<span class="px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 text-[10px] font-bold">ZONA DE COMPRA</span>';
    } else {
      diagnosticBadge = '<span class="px-2.5 py-1 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold">AGUARDAR</span>';
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-200/40 transition font-medium';
    tr.innerHTML = `
      <td class="py-3 px-4 font-bold text-gray-900 flex items-center gap-2">
        <span>${asset.ticker}</span>
        <span class="text-[10px] text-gray-500">(${asset.type})</span>
      </td>
      <td class="py-3 px-4 text-right text-gray-700 font-bold">R$ ${asset.currentPrice.toFixed(2)}</td>
      <td class="py-3 px-4 text-right text-amber-400 font-bold">R$ ${bazin.toFixed(2)}</td>
      <td class="py-3 px-4 text-right font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
        ${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%
      </td>
      <td class="py-3 px-4 text-center font-bold text-indigo-400">${magicNum} cotas</td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-2">
          <div class="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div class="bg-indigo-500 h-1.5 rounded-full" style="width: ${progress}%"></div>
          </div>
          <span class="text-[11px] font-bold text-gray-600">${progress.toFixed(0)}%</span>
        </div>
      </td>
      <td class="py-3 px-4 text-center">${diagnosticBadge}</td>
    `;
tbody.appendChild(tr);
  });

  staggerIn(tbody);

  const cashInput = document.getElementById('input-rebalance-amount');
  runRebalanceOrders(cashInput ? Number(cashInput.value) || 1500 : 1500);
}

function runRebalanceOrders(cash) {
  const container = document.getElementById('rebalance-orders-list');
  if (!container) return;
  container.innerHTML = '';

  const mappedAssets = portfolioState.assets.map(a => ({
    ticker: a.ticker,
    currentPrice: a.currentPrice,
    currentQuantity: a.quantity,
    targetWeightPercent: a.targetWeightPercent,
    score: a.score || 9,
    ceilingPrice: calculateBazinCeilingPrice(a.historicalAverageDPA, a.targetAnnualYield || 0.06)
  }));

  const orders = calculateRebalanceOrder({ availableCash: cash, assets: mappedAssets });

  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="text-xs text-gray-500 p-2 col-span-3">Nenhuma ordem necessária para este valor. Aumente o aporte para comprar cotas inteiras.</div>';
    return;
  }

  orders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'bg-white border border-emerald-500/30 rounded-xl p-3.5 space-y-2 shadow-lg';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-sm text-gray-900">${order.ticker}</span>
        <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          +${order.suggestedQuantity} cotas
        </span>
      </div>
      <div class="flex justify-between text-xs text-gray-500">
        <span>Custo Total:</span>
        <span class="font-bold text-gray-900">R$ ${order.totalCost.toFixed(2)}</span>
      </div>
      <p class="text-[11px] text-gray-500 italic">${order.reason || 'Rebalanceamento preventivo'}</p>
    `;
container.appendChild(card);
  });

  staggerIn(container);
}
function renderMdiMatrix() {
  const tbody = document.getElementById('mdi-table-body');
  if (!tbody || typeof MODEL_MDI === 'undefined') return;
  tbody.innerHTML = '';

  const currentMonth = new Date().getMonth() + 1;

  MODEL_MDI.forEach(entry => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-200/40 transition font-medium';

    let monthsCols = '';
    for (let m = 1; m <= 12; m++) {
      const isAnnounce = entry.announcementMonths.includes(m);
      const isPay = entry.paymentMonths.includes(m);
      const isCurrent = m === currentMonth;
      const pulseCls = isCurrent ? ' anim-pulse-soft' : '';

      let cellContent = '-';
      if (isAnnounce && isPay) {
        cellContent = `<span class="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 font-bold text-[10px]${pulseCls}">A/$</span>`;
      } else if (isAnnounce) {
        cellContent = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 font-bold text-[10px]${pulseCls}">A</span>`;
      } else if (isPay) {
        cellContent = `<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-700 font-bold text-[10px]${pulseCls}">$</span>`;
      }

      monthsCols += `<td class="py-2.5 px-1 text-center">${cellContent}</td>`;
    }

    tr.innerHTML = `
      <td class="py-3 px-3 font-bold text-gray-900 flex items-center gap-1.5">
        <span>${entry.ticker}</span>
        <span class="text-[10px] text-gray-500">(${entry.name})</span>
      </td>
      <td class="py-3 px-2 text-center text-emerald-400 font-bold">${entry.historicalYield12M.toFixed(1)}%</td>
${monthsCols}
      <td class="py-3 px-3 text-center text-[11px] text-gray-500">${entry.typicalAnnouncementWindow}</td>
    `;
    tbody.appendChild(tr);
  });

  staggerIn(tbody);
}

function initRaioXSelector() {
  const select = document.getElementById('select-raiox-asset');
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '';

  portfolioState.assets.forEach(asset => {
    const opt = document.createElement('option');
    opt.value = asset.ticker;
    opt.innerText = `${asset.ticker} - ${asset.name}`;
    select.appendChild(opt);
  });

  const hasPrevious = previousValue && [...select.options].some(o => o.value === previousValue);
  if (hasPrevious) {
    select.value = previousValue;
  }

  select.onchange = (e) => {
    renderRaioXDetail(e.target.value);
  };
}

function openRaioXForTicker(ticker) {
  const tabBtn = document.querySelector('[data-tab="tab-raiox"]');
  if (tabBtn) tabBtn.click();
  const select = document.getElementById('select-raiox-asset');
  if (!select) return;
  if (ticker && [...select.options].some(o => o.value === ticker)) {
    select.value = ticker;
  }
  renderRaioXDetail(ticker || select.value);
}

function renderRaioXDetail(ticker = null) {
  const select = document.getElementById('select-raiox-asset');
  const targetTicker = ticker || (select ? select.value : portfolioState.assets[0]?.ticker);
  if (!targetTicker) return;

  const asset = portfolioState.assets.find(a => a.ticker === targetTicker) || portfolioState.assets[0];
  const deep = asset?.deepDive;
  const container = document.getElementById('raiox-detail-content');
  if (!container || !deep) return;

  const bazin = calculateBazinCeilingPrice(asset.historicalAverageDPA, asset.targetAnnualYield || 0.06);
  const margin = calculateMarginOfSafety(bazin, asset.currentPrice);

  let specificSectionHtml = '';

  if (deep.properties && deep.properties.length > 0) {
    const propsList = deep.properties.map(p => `
      <tr class="hover:bg-gray-200/40 transition">
        <td class="py-2.5 px-3 font-bold text-gray-900">${p.name}</td>
        <td class="py-2.5 px-3 text-gray-600">${p.city}/${p.state}</td>
        <td class="py-2.5 px-3 text-right text-gray-700 font-bold">${p.grossLeasableAreaM2.toLocaleString('pt-BR')} m²</td>
        <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">${p.revenuePercent}%</td>
        <td class="py-2.5 px-3 text-right text-indigo-400 font-bold">${p.occupancyPercent}%</td>
        <td class="py-2.5 px-3 text-gray-600 text-xs">${p.mainTenants.join(', ')}</td>
      </tr>
    `).join('');

    specificSectionHtml = `
      <div class="bg-white p-5 rounded-2xl border border-gray-200 space-y-3">
        <h4 class="text-sm font-bold text-gray-900 flex items-center gap-2">
          <i data-lucide="building" class="w-4 h-4 text-cyan-400"></i>
          Imóveis Físicos do Fundo (${deep.properties.length} Ativos Mapeados)
        </h4>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-xs">
            <thead class="text-gray-500 border-b border-gray-200 font-semibold">
              <tr>
                <th class="py-2 px-3">Imóvel</th>
                <th class="py-2 px-3">Localização</th>
                <th class="py-2 px-3 text-right">ABL (m²)</th>
                <th class="py-2 px-3 text-right">% Receita</th>
                <th class="py-2 px-3 text-right">Ocupação</th>
                <th class="py-2 px-3">Principais Inquilinos</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200/60">${propsList}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (deep.debtsPortfolio && deep.debtsPortfolio.length > 0) {
    const debtsList = deep.debtsPortfolio.map(d => `
      <tr class="hover:bg-gray-200/40 transition">
        <td class="py-2.5 px-3 font-bold text-gray-900">${d.code}</td>
        <td class="py-2.5 px-3 text-gray-600">${d.debtor}</td>
        <td class="py-2.5 px-3 text-center text-amber-400 font-bold">${d.indexer} + ${d.interestRateSpread}%</td>
        <td class="py-2.5 px-3 text-right text-indigo-400 font-bold">${d.ltvPercent}%</td>
        <td class="py-2.5 px-3 text-gray-500 text-xs">${d.guarantees}</td>
      </tr>
    `).join('');

    specificSectionHtml = `
      <div class="bg-white p-5 rounded-2xl border border-gray-200 space-y-3">
        <h4 class="text-sm font-bold text-gray-900 flex items-center gap-2">
          <i data-lucide="file-text" class="w-4 h-4 text-amber-400"></i>
          Dívidas e Certificados (CRIs) Financiados
        </h4>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-xs">
            <thead class="text-gray-500 border-b border-gray-200 font-semibold">
              <tr>
                <th class="py-2 px-3">Título CRI</th>
                <th class="py-2 px-3">Devedor / Tomador</th>
                <th class="py-2 px-3 text-center">Taxa Média</th>
                <th class="py-2 px-3 text-right">LTV (Risco)</th>
                <th class="py-2 px-3">Garantias Reais</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200/60">${debtsList}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (deep.fixedIncomeDetails) {
    const fi = deep.fixedIncomeDetails;
    specificSectionHtml = `
      <div class="bg-white p-5 rounded-2xl border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <span class="text-xs text-gray-500 block">Emissor / Garantia</span>
          <span class="text-sm font-bold text-gray-900">${fi.issuer} (${fi.hasFGC ? 'Com FGC até R$ 250k' : 'Risco Soberano Federal'})</span>
        </div>
        <div>
          <span class="text-xs text-gray-500 block">Indexador Contratado</span>
          <span class="text-sm font-bold text-emerald-400">${fi.indexer}</span>
        </div>
        <div>
          <span class="text-xs text-gray-500 block">Vencimento</span>
          <span class="text-sm font-bold text-amber-400">${fi.maturityDate} (Liquidez ${fi.liquidity})</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
              ${deep.companyName} (${deep.ticker})
            </h3>
            <span class="text-xs text-emerald-400 font-semibold">${deep.sector} é ${deep.subsector}</span>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            ${deep.governance}
          </span>
        </div>
        <p class="text-xs text-gray-600 leading-relaxed">${deep.description}</p>
        <div class="pt-2 border-t border-gray-200/80">
          <span class="text-[11px] uppercase font-bold text-gray-500 tracking-wider">Modelo de Negócio (De onde vem o dinheiro):</span>
          <p class="text-xs text-gray-600 mt-0.5">${deep.businessModel}</p>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col justify-between space-y-3">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Cálculo Previdenciário (Bazin)</h4>
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="text-gray-500">Cotação Atual:</span>
            <span class="font-bold text-gray-900">R$ ${asset.currentPrice.toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-gray-500">Preço Teto (6% a.a.):</span>
            <span class="font-bold text-amber-400">R$ ${bazin.toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-gray-500">Margem de Segurança:</span>
            <span class="font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%</span>
          </div>
        </div>
        <div class="p-2.5 rounded-xl bg-white border border-gray-200 text-[11px] text-gray-600">
          ${margin >= 0 ? '<i data-lucide="check-circle-2" class="w-3.5 h-3.5 inline-block align-text-bottom"></i> <strong>Zona de Compra:</strong> Ativo precificado para gerar no mínimo 6% de dividendo anual.' : '<i data-lucide="clock" class="w-3.5 h-3.5 inline-block align-text-bottom"></i> <strong>Aguardar:</strong> Cotação acima do preço teto projetado.'}
        </div>
      </div>
    </div>
    ${specificSectionHtml}
  `;

  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

function renderAcademyTracks() {
  const container = document.getElementById('academy-tracks-container');
  if (!container || typeof INVESTOR_ACADEMY_TRACKS === 'undefined') return;
  container.innerHTML = '';

  INVESTOR_ACADEMY_TRACKS.forEach(track => {
    const card = document.createElement('div');
    card.className = 'bg-white p-5 rounded-2xl border border-gray-200 space-y-4 shadow-lg';
    
    const lessonsHtml = track.lessons.map(l => `
      <div class="p-3.5 rounded-xl bg-white/80 border border-gray-200/80 space-y-1">
        <h5 class="text-xs font-bold text-emerald-400 flex items-center gap-2">
          <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-500 shrink-0"></i>
          ${l.title}
        </h5>
        <p class="text-xs text-gray-600 leading-relaxed pl-5">${l.content}</p>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-gray-200 pb-3">
        <h4 class="font-bold text-gray-900 text-sm">${track.title}</h4>
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ${track.badge}
        </span>
      </div>
      <p class="text-xs text-gray-500">${track.description}</p>
      <div class="space-y-2.5">${lessonsHtml}</div>
    `;
container.appendChild(card);
  });

  staggerIn(container);
}
function initRetirementSimulator() {
  const inputs = ['sim-target-income', 'sim-monthly-contribution', 'sim-expected-yield'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateRetirementSimulation);
    }
  });
}

function updateRetirementSimulation() {
  const targetIncome = Number(document.getElementById('sim-target-income')?.value) || 5000;
  const contribution = Number(document.getElementById('sim-monthly-contribution')?.value) || 1500;
  const yieldAnnual = (Number(document.getElementById('sim-expected-yield')?.value) || 8.5) / 100;

  let currentCap = 0;
  portfolioState.assets.forEach(a => {
    const exchange = (a.currency === 'USD' ? (a.deepDive?.exchangeRateBRLUSD || 5.65) : 1);
    currentCap += (a.currentPrice * exchange * a.quantity);
  });

  const sim = calculateRetirementProjection({
    currentCapital: currentCap,
    monthlyContribution: contribution,
    targetMonthlyPassiveIncome: targetIncome,
    expectedAnnualYield: yieldAnnual,
    reinvestDividends: true
  });

  const capEl = document.getElementById('sim-result-capital');
  if (capEl) capEl.innerText = `R$ ${sim.requiredCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const timeEl = document.getElementById('sim-result-time');
  if (timeEl) timeEl.innerText = `${sim.yearsToTarget} anos (${sim.monthsToTarget} meses)`;

  renderRetirementChart(sim.trajectory);
}

function renderRetirementChart(trajectory = []) {
  const ctx = document.getElementById('chart-retirement-trajectory');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = trajectory.map(t => `Ano ${t.year}`);
  const investedData = trajectory.map(t => t.investedFromPocket);
  const balanceData = trajectory.map(t => t.balance);

  if (retirementChart) {
    retirementChart.destroy();
  }

  retirementChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Patrimônio Total (Com Bola de Neve)',
          data: balanceData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Aportado do Seu Bolso',
          data: investedData,
          borderColor: '#6366f1',
          borderDash: [5, 5],
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#6b7280', font: { size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(156, 163, 175, 0.4)' } },
        y: {
          ticks: {
            color: '#6b7280',
            callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val)
          },
          grid: { color: 'rgba(156, 163, 175, 0.4)' }
        }
      }
    }
  });
}

function initActionButtons() {
  document.getElementById('btn-add-asset')?.addEventListener('click', () => {
    document.getElementById('modal-add-asset')?.classList.remove('hidden');
  });

  document.getElementById('btn-close-modal-add')?.addEventListener('click', () => {
    document.getElementById('modal-add-asset')?.classList.add('hidden');
  });

document.getElementById('btn-quick-rebalance')?.addEventListener('click', () => {
    const radarTab = document.querySelector('[data-tab="tab-radar"]');
    if (radarTab) radarTab.click();
  });

  document.getElementById('btn-news-refresh')?.addEventListener('click', () => {
    loadNewsFeed(true);
  });

  document.getElementById('btn-run-rebalance')?.addEventListener('click', () => {
    const cash = Number(document.getElementById('input-rebalance-amount')?.value) || 1500;
    runRebalanceOrders(cash);
  });

  document.getElementById('btn-export-backup')?.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(portfolioState, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `previdencia_invest_backup_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchor.click();
  });

  const fileInput = document.getElementById('file-import-input');
  document.getElementById('btn-import-backup')?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loaded = JSON.parse(event.target.result);
        if (loaded && loaded.assets) {
          portfolioState = loaded;
          savePortfolioToStorage();
          renderAllViews();
          initRaioXSelector();
          alert('Carteira restaurada com sucesso!');
        }
      } catch (err) {
        alert('Arquivo JSON inválido!');
      }
    };
    reader.readAsText(file);
  });
}

function initFormAddAsset() {
  const form = document.getElementById('form-add-asset');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ticker = document.getElementById('add-ticker').value.trim().toUpperCase();
    const type = document.getElementById('add-type').value;
    const quantity = Number(document.getElementById('add-quantity').value) || 0;
    const price = Number(document.getElementById('add-price').value) || 0;
    const dpa = Number(document.getElementById('add-dpa').value) || 0;

    const existingIdx = portfolioState.assets.findIndex(a => a.ticker === ticker);
    if (existingIdx >= 0) {
      const existing = portfolioState.assets[existingIdx];
      const newQty = existing.quantity + quantity;
      const newTotalCost = (existing.quantity * existing.averagePrice) + (quantity * price);
      existing.averagePrice = newTotalCost / newQty;
      existing.quantity = newQty;
      existing.currentPrice = price;
      if (dpa > 0) existing.historicalAverageDPA = dpa;
    } else {
      portfolioState.assets.push({
        id: 'ast-' + Date.now(),
        ticker,
        name: ticker,
        type,
        quantity,
        averagePrice: price,
        currentPrice: price,
        targetWeightPercent: 10,
        targetAnnualYield: 0.06,
        historicalAverageDPA: dpa,
        monthlyDividendEstimate: dpa / 12,
        score: 9,
        deepDive: {
          ticker,
          companyName: ticker,
          sector: 'Geral',
          subsector: 'Geral',
          description: 'Ativo adicionado pelo investidor.',
          businessModel: 'Conforme atividade.',
          governance: 'NOVO_MERCADO',
          tagAlongPercent: 100,
          freeFloatPercent: 50,
          hasConsistentProfits5Years: true,
          netMarginPercent: 15,
          roePercent: 18,
          netDebtToEbitda: 1.5,
          payoutPercent: 50
        }
      });
    }

    savePortfolioToStorage();
    renderAllViews();
    initRaioXSelector();
    document.getElementById('modal-add-asset')?.classList.add('hidden');
    form.reset();
  });
}

function formatTypeLabel(type) {
  const map = {
    'ACAO': 'Ação',
    'FII_TIJOLO': 'FII Tijolo',
    'FII_PAPEL': 'FII Papel',
    'STOCK_USD': 'Stock (EUA)',
    'ETF': 'ETF',
    'RENDA_FIXA': 'Renda Fixa'
  };
  return map[type] || type;
}

function getTypeBadgeClass(type) {
  const map = {
    'ACAO': 'bg-emerald-500/10 text-emerald-400',
    'FII_TIJOLO': 'bg-cyan-500/10 text-cyan-400',
    'FII_PAPEL': 'bg-amber-500/10 text-amber-400',
    'STOCK_USD': 'bg-indigo-500/10 text-indigo-400',
    'ETF': 'bg-pink-500/10 text-pink-400',
    'RENDA_FIXA': 'bg-yellow-500/10 text-yellow-400'
  };
  return map[type] || 'bg-gray-200 text-gray-600';
}

function getTypeIcon(type) {
  const map = {
    'ACAO': 'trending-up',
    'FII_TIJOLO': 'building-2',
    'FII_PAPEL': 'file-text',
    'STOCK_USD': 'globe',
    'ETF': 'layers',
    'RENDA_FIXA': 'percent'
  };
  return map[type] || 'circle';
}

// 10. Renderização do Comparador de Classes (3 vs 4 vs 11)
function renderShareClassesComparison() {
  const container = document.getElementById('share-classes-container');
  if (!container || typeof SHARE_CLASSES_DATA === 'undefined') return;
  container.innerHTML = '';

  SHARE_CLASSES_DATA.forEach(item => {
    const comp = compareShareClasses(item);
    const card = document.createElement('div');
    card.className = 'bg-white p-5 rounded-2xl border border-gray-200 space-y-4 shadow-xl hover:border-gray-300 transition';

    let unitSection = '';
    if (comp.unit.price > 0) {
      unitSection = `
        <div class="p-2.5 rounded-xl bg-white/90 border border-gray-200 flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-gray-900">${comp.unit.ticker} (UNIT)</span>
            <span class="text-gray-500 block text-[11px]">Cotação: R$ ${comp.unit.price.toFixed(2)} | DY: <strong class="text-indigo-400">${comp.unit.yield.toFixed(2)}%</strong></span>
          </div>
          <div class="text-right">
            <span class="text-[11px] text-gray-500 block">Paridade Teórica: R$ ${comp.unit.theoreticalPrice.toFixed(2)}</span>
            <span class="text-xs font-bold ${comp.unit.discountPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
              ${comp.unit.discountPercent >= 0 ? 'Desconto UNIT: ' + comp.unit.discountPercent.toFixed(1) + '%' : 'Ágio UNIT: +' + Math.abs(comp.unit.discountPercent).toFixed(1) + '%'}
            </span>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <h3 class="font-semibold text-gray-900 text-base">${comp.name} (${comp.tickerBase})</h3>
          <span class="text-xs text-gray-500">Comparação ON vs PN ${comp.unit.price > 0 ? 'vs UNIT' : ''}</span>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
          Melhor: ${comp.bestChoice ? comp.bestChoice.ticker : '-'}
        </span>
      </div>

      <!-- Classes Grid -->
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 rounded-xl bg-white/90 border ${comp.bestChoice?.type === 'ON' ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-gray-200'} space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-gray-900 text-xs">${comp.on.ticker} (ON)</span>
            ${comp.bestChoice?.type === 'ON' ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-700 font-bold px-1.5 py-0.5 rounded">TOP</span>' : ''}
          </div>
          <div class="text-xs text-gray-500">Cotação: <strong class="text-gray-900">R$ ${comp.on.price.toFixed(2)}</strong></div>
          <div class="text-xs text-gray-500">DPA: R$ ${comp.on.dpa.toFixed(2)}</div>
          <div class="text-xs text-emerald-400 font-bold">Yield: ${comp.on.yield.toFixed(2)}% a.a.</div>
        </div>

        <div class="p-3 rounded-xl bg-white/90 border ${comp.bestChoice?.type === 'PN' ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-gray-200'} space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-gray-900 text-xs">${comp.pn.ticker} (PN)</span>
            ${comp.bestChoice?.type === 'PN' ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-700 font-bold px-1.5 py-0.5 rounded">TOP</span>' : ''}
          </div>
          <div class="text-xs text-gray-500">Cotação: <strong class="text-gray-900">R$ ${comp.pn.price.toFixed(2)}</strong></div>
          <div class="text-xs text-gray-500">DPA: R$ ${comp.pn.dpa.toFixed(2)}</div>
          <div class="text-xs text-emerald-400 font-bold">Yield: ${comp.pn.yield.toFixed(2)}% a.a.</div>
        </div>
      </div>

      ${unitSection}

      <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800">
        <i data-lucide="scale" class="w-3.5 h-3.5 inline-block align-text-bottom"></i> <strong>Diagnóstico:</strong> ${comp.rationale}
      </div>
    `;

container.appendChild(card);
  });

  staggerIn(container);

  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

// Injetar chamada no renderAllViews
const prevRenderAll = renderAllViews;
renderAllViews = function() {
  prevRenderAll();
  renderShareClassesComparison();
};

// 12. Módulo Interativo do Importador de Planilhas / B3
let stagedTransactions = [];

function initImporterModal() {
  const modal = document.getElementById('modal-importer');
  const btnOpen = document.getElementById('btn-open-importer');
  const btnClose = document.getElementById('btn-close-modal-importer');
  const btnCancel = document.getElementById('btn-cancel-importer');
  const dropzone = document.getElementById('dropzone-csv');
  const fileInput = document.getElementById('input-file-csv');
  const btnConfirm = document.getElementById('btn-confirm-importer');
  const btnDownloadSample = document.getElementById('btn-download-sample-csv');

  btnOpen?.addEventListener('click', () => {
    stagedTransactions = [];
    document.getElementById('preview-importer-container')?.classList.add('hidden');
    if (btnConfirm) btnConfirm.disabled = true;
    modal?.classList.remove('hidden');
    if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
  });

  const closeModal = () => modal?.classList.add('hidden');
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Download Modelo CSV
  btnDownloadSample?.addEventListener('click', () => {
    const sampleCsv = `Data;Tipo;Ticker;Quantidade;Preco;Taxas\n15/01/2025;Compra;BBAS3;100;25.50;5.00\n20/01/2025;Compra;TAEE11;200;34.20;5.00\n10/02/2025;Compra;HGLG11;50;158.00;10.00\n12/02/2025;Compra;MXRF11;1000;10.15;0.00\n15/02/2025;Compra;AAPL;10;220.00;0.00`;
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(sampleCsv);
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "modelo_transacoes_b3.csv");
    dl.click();
  });

  // Dropzone click
  dropzone?.addEventListener('click', () => fileInput?.click());

  // Drag & Drop events
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-emerald-500', 'bg-emerald-500/10');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-emerald-500', 'bg-emerald-500/10');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-emerald-500', 'bg-emerald-500/10');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCSVFile(e.dataTransfer.files[0]);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleCSVFile(e.target.files[0]);
    }
  });

  // Confirmar Importação
  btnConfirm?.addEventListener('click', () => {
    if (!stagedTransactions.length) return;
    if (typeof integrateTransactionsIntoPortfolio === 'function') {
      portfolioState = integrateTransactionsIntoPortfolio(portfolioState, stagedTransactions);
      savePortfolioToStorage();
      renderAllViews();
      initRaioXSelector();
      modal?.classList.add('hidden');
      alert(`Sucesso! ${stagedTransactions.length} transações integradas e Preço Médio recalculado.`);
    }
  });
}

function handleCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      if (typeof parseCSVTransactions === 'function') {
        const txs = parseCSVTransactions(text);
        if (txs.length === 0) {
          alert('Nenhuma transação válida encontrada. Verifique se o arquivo possui as colunas Data, Ticker, Quantidade e Preço.');
          return;
        }

        stagedTransactions = txs;
        renderImporterPreview(txs);
      }
    } catch (err) {
      console.error('Erro ao ler CSV:', err);
      alert('Erro ao processar o arquivo CSV.');
    }
  };
  reader.readAsText(file);
}

function renderImporterPreview(txs = []) {
  const container = document.getElementById('preview-importer-container');
  const countEl = document.getElementById('preview-tx-count');
  const tbody = document.getElementById('preview-importer-tbody');
  const btnConfirm = document.getElementById('btn-confirm-importer');

  if (!container || !tbody) return;

  container.classList.remove('hidden');
  if (countEl) countEl.innerText = `${txs.length} Transações Identificadas:`;
  if (btnConfirm) btnConfirm.disabled = false;

  tbody.innerHTML = '';
  txs.forEach(tx => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-200/40 transition font-medium';
    tr.innerHTML = `
      <td class="py-2 px-3 text-gray-500">${tx.date}</td>
      <td class="py-2 px-3 font-bold text-gray-900">${tx.ticker}</td>
      <td class="py-2 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${tx.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">${tx.type === 'BUY' ? 'COMPRA' : 'VENDA'}</span></td>
      <td class="py-2 px-3 text-right text-gray-700 font-bold">${tx.quantity}</td>
      <td class="py-2 px-3 text-right text-gray-600">R$ ${tx.unitPrice.toFixed(2)}</td>
      <td class="py-2 px-3 text-right font-bold text-gray-900">R$ ${tx.totalAmount.toFixed(2)}</td>
    `;
tbody.appendChild(tr);
  });

  staggerIn(tbody);
}

// Inicializar na carga da página
const prevInitActionButtonsWithImporter = initActionButtons;
initActionButtons = function() {
  prevInitActionButtonsWithImporter();
  initImporterModal();
};

// 13. Conexão Automática com o Supabase (env vars do backend, sem modal de login)
function initSupabaseAutoConnect() {
  // Inicializa o cliente via ambiente (config injetada no build pela Vercel/Backend)
  if (typeof initSupabaseClient === 'function') {
    initSupabaseClient();
  }
}

// Restaura sessão ativa (se houver) e carrega/sincroniza silenciosamente
async function silentCloudSync() {
  try {
    if (typeof getLoggedUser === 'function') {
      const user = await getLoggedUser();
      if (!user || !user.email) return;
    }
    if (typeof loadPortfolioFromCloud === 'function') {
      const cloudPortfolio = await loadPortfolioFromCloud();
      if (cloudPortfolio && cloudPortfolio.assets && cloudPortfolio.assets.length > 0) {
        portfolioState = cloudPortfolio;
        renderAllViews();
      }
    }
  } catch (err) {
    console.warn('Sincronização silenciosa indisponível:', err);
  }
}

// Inicializar Conexão Cloud
const prevInitCloudButtons = initActionButtons;
initActionButtons = function() {
  prevInitCloudButtons();
  initSupabaseAutoConnect();
  silentCloudSync();
};

// 14. Renderização do Centro de Notificações e Auditoria de Saúde
let activeNotifFilter = 'ALL';

function renderNotificationCenter() {
const container = document.getElementById('notifications-cards-container');
  const headerBadge = document.getElementById('badge-header-notif-count');
  if (!container || typeof generatePortfolioAlerts !== 'function') return;

  const classesData = (typeof SHARE_CLASSES_DATA !== 'undefined') ? SHARE_CLASSES_DATA : [];
  const allAlerts = generatePortfolioAlerts(portfolioState, classesData);

  if (typeof syncNotificationsToCloud === 'function') {
    syncNotificationsToCloud(allAlerts);
  }

  if (headerBadge) {
    const prevCount = headerBadge.dataset.count || null;
    headerBadge.innerText = allAlerts.length;
    headerBadge.className = allAlerts.length > 0
      ? 'absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-rose-500 text-white flex items-center justify-center'
      : 'hidden';
    if (allAlerts.length > 0 && String(allAlerts.length) !== prevCount) {
      pulse(headerBadge);
    }
    headerBadge.dataset.count = String(allAlerts.length);
  }

  const filteredAlerts = allAlerts.filter(a => activeNotifFilter === 'ALL' || a.category === activeNotifFilter);

  container.innerHTML = '';
  if (filteredAlerts.length === 0) {
    container.innerHTML = '<div class="col-span-2 text-center p-8 text-gray-500 text-xs bg-gray-100/60 rounded-2xl border border-gray-200">Nenhuma notificação encontrada nesta categoria.</div>';
    return;
  }

  filteredAlerts.forEach(alert => {
    const card = document.createElement('div');
    
    let borderClass = 'border-gray-200';
    let iconName = 'info';
    let badgeHtml = '';

    if (alert.category === 'RISK') {
      borderClass = 'border-rose-500/40 bg-rose-500/10';
      iconName = 'alert-triangle';
      badgeHtml = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-600 border border-rose-500/30"><i data-lucide="alert-triangle" class="w-3 h-3 inline-block align-text-bottom"></i> RISCO DETECTADO</span>';
    } else if (alert.category === 'OPPORTUNITY') {
      borderClass = 'border-emerald-500/40 bg-emerald-500/10';
      iconName = 'sparkles';
      badgeHtml = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-700 border border-emerald-500/30"><i data-lucide="sparkles" class="w-3 h-3 inline-block align-text-bottom"></i> OPORTUNIDADE</span>';
    } else if (alert.category === 'DIVIDEND') {
      borderClass = 'border-indigo-500/40 bg-indigo-500/10';
      iconName = 'coins';
      badgeHtml = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-700 border border-indigo-500/30"><i data-lucide="coins" class="w-3 h-3 inline-block align-text-bottom"></i> PROVENTO</span>';
    }

    card.className = `bg-white p-5 rounded-2xl border ${borderClass} space-y-3 shadow-lg hover:border-gray-300 transition`;
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-white border border-gray-200 text-gray-700">
            <i data-lucide="${iconName}" class="w-4 h-4"></i>
          </div>
          <div>
            <h4 class="font-bold text-gray-900 text-sm">${alert.title}</h4>
            <span class="text-[11px] text-gray-500 font-semibold">${alert.ticker}</span>
          </div>
        </div>
        ${badgeHtml}
      </div>
      <p class="text-xs text-gray-600 leading-relaxed">${alert.message}</p>
      <div class="p-2.5 rounded-xl bg-white/80 border border-gray-200/80 text-[11px] text-gray-600 flex items-start gap-2">
        <strong class="text-amber-400 shrink-0"><i data-lucide="lightbulb" class="w-3.5 h-3.5 inline-block align-text-bottom"></i> Ação Sugerida:</strong>
        <span>${alert.actionAdvice}</span>
      </div>
    `;

container.appendChild(card);
  });

  staggerIn(container);

  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

function initNotifFilterButtons() {
  const filterBtns = document.querySelectorAll('.notif-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active-notif-filter'));
      btn.classList.add('active-notif-filter');
      activeNotifFilter = btn.getAttribute('data-notif-filter');
      renderNotificationCenter();
    });
  });
}

// Injetar chamada no renderAllViews
const prevRenderAllWithNotifs = renderAllViews;
renderAllViews = function() {
  prevRenderAllWithNotifs();
  renderNotificationCenter();
  syncPerfPortfolioTickers();
};

const prevInitActionButtonsWithNotifs = initActionButtons;
initActionButtons = function() {
  prevInitActionButtonsWithNotifs();
  initNotifFilterButtons();
  initProfilePage();
  initConfigPage();
};

function initProfilePage() {
  const saveBtn = document.getElementById('btn-save-profile');
  const pwBtn = document.getElementById('btn-change-password');
  const logoutBtn = document.getElementById('btn-logout');
  const avatarFile = document.getElementById('profile-avatar-file');
  const btnRemove = document.getElementById('btn-remove-avatar');

  const AVATAR_KEY = 'pv_avatar';
  const avatarImg = document.getElementById('profile-avatar-img');
  const avatarIcon = document.getElementById('profile-avatar-icon');
  const previewImg = document.getElementById('profile-avatar-preview-img');
  const previewIcon = document.getElementById('profile-avatar-preview-icon');

  const applyAvatar = (url) => {
    [avatarImg, previewImg].forEach(img => {
      if (!img) return;
      if (url) {
        img.src = url;
        img.classList.remove('hidden');
      } else {
        img.removeAttribute('src');
        img.classList.add('hidden');
      }
    });
    [avatarIcon, previewIcon].forEach(icon => {
      if (!icon) return;
      if (url) { icon.classList.add('hidden'); } else { icon.classList.remove('hidden'); }
    });
    if (url) { localStorage.setItem(AVATAR_KEY, url); } else { localStorage.removeItem(AVATAR_KEY); }
  };

  const savedAvatar = localStorage.getItem(AVATAR_KEY);
  if (savedAvatar) applyAvatar(savedAvatar);

  avatarFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecione um arquivo de imagem.'); return; }
    const reader = new FileReader();
    reader.onload = () => applyAvatar(reader.result);
    reader.readAsDataURL(file);
  });

  btnRemove?.addEventListener('click', () => applyAvatar(null));

  window.applyGoogleAvatar = (user) => {
    if (!user) return false;
    const url = user.photoURL || user.user_metadata?.avatar_url || user.user_metadata?.picture || user.picture || user.avatar_url;
    if (url) { applyAvatar(url); return true; }
    return false;
  };

  saveBtn?.addEventListener('click', async () => {
    const name = document.getElementById('profile-form-name');
    const email = document.getElementById('profile-form-email');
    if (!name?.value.trim() || !email?.value.trim()) {
      alert('Preencha o nome e o e-mail.');
      return;
    }
    if (typeof updateUser === 'function') {
      try {
        await updateUser({ data: { full_name: name.value.trim() } });
        const user = (typeof getSessionUser === 'function') ? getSessionUser() : null;
        if (user) populateProfileUser({ ...user, user_metadata: { ...user.user_metadata, full_name: name.value.trim() } });
        alert(`Perfil atualizado para ${name.value.trim()}.`);
        return;
      } catch (err) {
        alert('Erro ao salvar perfil: ' + ((err && err.message) || 'tente novamente.'));
        return;
      }
    }
    alert(`Perfil salvo para ${name.value.trim()}. Sincronização com o Supabase será ativada em breve.`);
  });

  pwBtn?.addEventListener('click', async () => {
    const current = document.getElementById('profile-form-current');
    const newPw = document.getElementById('profile-form-new');
    const confirm = document.getElementById('profile-form-confirm');
    if (!current?.value || !newPw?.value) {
      alert('Preencha a senha atual e a nova senha.');
      return;
    }
    if (newPw.value.length < 6) {
      alert('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPw.value !== confirm?.value) {
      alert('A nova senha e a confirmação não coincidem.');
      return;
    }
    if (typeof updateUserPassword === 'function') {
      try {
        await updateUserPassword(newPw.value);
        current.value = '';
        newPw.value = '';
        confirm.value = '';
        alert('Senha alterada com sucesso.');
        return;
      } catch (err) {
        alert('Erro ao alterar a senha: ' + ((err && err.message) || 'verifique a senha atual.'));
        return;
      }
    }
    alert('Alteração de senha disponível após a conexão com o Supabase.');
  });

  logoutBtn?.addEventListener('click', () => {
    if (typeof handleLogout === 'function') {
      handleLogout();
    } else {
      alert('Sair da conta será habilitado após a conexão com o Supabase.');
    }
  });
}

function initConfigPage() {
  const applyToggle = (btn, on) => {
    if (!btn) return;
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.classList.toggle('bg-emerald-500', on);
    btn.classList.toggle('bg-gray-300', !on);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-5', on);
      knob.classList.toggle('translate-x-0', !on);
    }
  };

  const notifBtn = document.getElementById('toggle-notif-config');
  const setNotif = (on) => {
    applyToggle(notifBtn, on);
    localStorage.setItem('pv_notifications', on ? 'on' : 'off');
  };
  notifBtn?.addEventListener('click', () => {
    setNotif(notifBtn.getAttribute('aria-checked') !== 'true');
  });
  setNotif(localStorage.getItem('pv_notifications') !== 'off');
}

/* ============================================================
   NOTÍCIAS DO MERCADO - aba dedicada ao compilado diário
   ============================================================ */
function renderNewsSourceFilters() {
  const container = document.getElementById('news-source-filters');
  if (!container) return;

  const sources = [...new Set(newsItems.map((i) => (i.source && i.source.id) || 'outros'))];
  if (sources.length <= 1) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  const chips = [{ id: 'ALL', label: 'Todas' }, ...sources.map((id) => {
    const item = newsItems.find((i) => i.source && i.source.id === id);
    return { id, label: (item && item.source.name) || id };
  })];

  container.classList.remove('hidden');
  container.innerHTML = chips.map((chip) => `
    <button data-news-filter="${chip.id}" class="news-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
      newsSourceFilter === chip.id
        ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
        : 'bg-gray-200 hover:bg-gray-300 text-gray-600 border border-gray-300'
    }">${chip.label}</button>
  `).join('');

  container.querySelectorAll('.news-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      newsSourceFilter = btn.getAttribute('data-news-filter');
      renderNewsList(document.getElementById('news-container'), filteredNewsItems());
      renderNewsSourceFilters();
      if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
    });
  });
}

function filteredNewsItems() {
  if (newsSourceFilter === 'ALL') return newsItems;
  return newsItems.filter((i) => i.source && i.source.id === newsSourceFilter);
}

function renderNewsMeta() {
  const el = document.getElementById('news-meta');
  if (!el) return;
  const count = filteredNewsItems().length;
  const fresh = (Date.now() - newsLastLoad) / 60000;
  el.classList.remove('hidden');
  el.innerHTML = `Atualizado ${fresh < 1 ? 'agora' : `há ${Math.round(fresh)} min`} · ${count} notícia${count === 1 ? '' : 's'} do dia · fontes: ${newsItems.length ? [...new Set(newsItems.map((i) => i.source && i.source.name))].join(', ') : '-'}`;
}

async function loadNewsFeed(force = false) {
  const container = document.getElementById('news-container');
  if (!container) return;

  const isStale = (Date.now() - newsLastLoad) > NEWS_STALE_MS;
  const needFetch = force || isStale || newsItems.length === 0;

  if (needFetch) {
    renderNewsSkeleton(container);
    try {
      const items = force ? await forceRefreshNews(30) : await fetchMarketNews(30);
      newsItems = Array.isArray(items) ? items : [];
      newsLastLoad = Date.now();
    } catch (err) {
      renderNewsError(container, (err && err.message) || 'Falha de conexão com o servidor de notícias.');
      return;
    }
  }

  renderNewsList(container, filteredNewsItems());
  renderNewsSourceFilters();
  renderNewsMeta();
}

/* ============================================================
   COMPARADOR DE PERFORMANCE - quem rendeu mais (gráficos + ranking)
   ============================================================ */
function perfMetricLabel(metric) {
  return {
    PRICE: 'Variação de Preço (%)',
    TOTAL: 'Retorno Total (%)',
    DY: 'Dividend Yield (%)',
    YOC: 'Yield on Cost (%)',
    MARGIN: 'Margem Bazin (%)'
  }[metric] || metric;
}

function perfFindAsset(ticker) {
  return (portfolioState.assets || []).find(a => a.ticker === ticker);
}

function perfPriceReturn(series) {
  if (!series || !series.points || series.points.length < 2) return null;
  const first = series.points[0].close;
  const last = series.points[series.points.length - 1].close;
  if (!first || !last) return null;
  return ((last / first) - 1) * 100;
}

function perfLastPrice(series) {
  if (!series || !series.points || series.points.length === 0) return null;
  return series.points[series.points.length - 1].close;
}

function perfDividendYield(asset) {
  if (!asset || !asset.historicalAverageDPA || !asset.currentPrice) return null;
  return (asset.historicalAverageDPA / asset.currentPrice) * 100;
}

function perfYieldOnCost(asset) {
  if (!asset || !asset.historicalAverageDPA || !asset.averagePrice) return null;
  return (asset.historicalAverageDPA / asset.averagePrice) * 100;
}

function perfBazinMargin(asset) {
  if (!asset || !asset.historicalAverageDPA || !asset.targetAnnualYield || !asset.currentPrice) return null;
  const ceiling = asset.historicalAverageDPA / asset.targetAnnualYield;
  if (!ceiling) return null;
  return ((ceiling - asset.currentPrice) / asset.currentPrice) * 100;
}

function perfTotalReturn(asset, series) {
  const price = perfPriceReturn(series);
  if (price === null) return null;
  const dy = perfDividendYield(asset);
  if (dy === null) return price;
  const years = PERF_PERIOD_YEARS[perfState.period] || 1;
  return price + (dy * years);
}

function computePerfMetric(ticker, series) {
  const asset = perfFindAsset(ticker);
  switch (perfState.metric) {
    case 'PRICE': return perfPriceReturn(series);
    case 'TOTAL': return perfTotalReturn(asset, series);
    case 'DY': return perfDividendYield(asset);
    case 'YOC': return perfYieldOnCost(asset);
    case 'MARGIN': return perfBazinMargin(asset);
    default: return perfTotalReturn(asset, series);
  }
}

function renderPerfTickerChips() {
  const container = document.getElementById('perf-ticker-chips');
  if (!container) return;
  container.innerHTML = '';
  perfState.tickers.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-bold';
    chip.innerHTML = `${t}<button class="perf-remove-chip hover:text-rose-500 transition" data-remove="${t}" title="Remover"><i data-lucide="x" class="w-3 h-3"></i></button>`;
    container.appendChild(chip);
  });
  container.querySelectorAll('.perf-remove-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      perfState.tickers = perfState.tickers.filter(t => t !== btn.getAttribute('data-remove'));
      renderPerfTickerChips();
      renderPerformanceComparator();
    });
  });
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
}

function addPerfTicker() {
  const input = document.getElementById('perf-ticker-input');
  const raw = (input && input.value ? input.value : '').trim().toUpperCase();
  if (!raw) return;
  if (!perfState.tickers.includes(raw)) {
    perfState.tickers.push(raw);
    renderPerfTickerChips();
    renderPerformanceComparator();
  }
  if (input) input.value = '';
}

function syncPerfPortfolioTickers() {
  const tab = document.getElementById('tab-performance');
  if (!tab) return;
  const portfolioTickers = (portfolioState.assets || []).map(a => a.ticker);
  let changed = false;
  portfolioTickers.forEach(t => {
    if (!perfState.tickers.includes(t)) { perfState.tickers.push(t); changed = true; }
  });
  if (changed) {
    renderPerfTickerChips();
    if (!tab.classList.contains('hidden')) renderPerformanceComparator();
  }
}

function initPerformanceComparator() {
  perfState.tickers = [...new Set((portfolioState.assets || []).map(a => a.ticker))];

  document.getElementById('btn-perf-add-ticker')?.addEventListener('click', addPerfTicker);
  document.getElementById('perf-ticker-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addPerfTicker(); }
  });

  document.querySelectorAll('.perf-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.perf-period-btn').forEach(b => {
        b.classList.remove('perf-period-active', 'bg-emerald-500/10', 'text-emerald-400');
        b.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-600');
      });
      btn.classList.add('perf-period-active', 'bg-emerald-500/10', 'text-emerald-400');
      btn.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-600');
      perfState.period = btn.getAttribute('data-perf-period');
      renderPerformanceComparator();
    });
  });

  document.querySelectorAll('.perf-metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.perf-metric-btn').forEach(b => {
        b.classList.remove('perf-metric-active', 'bg-emerald-500/10', 'text-emerald-400');
        b.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-600');
      });
      btn.classList.add('perf-metric-active', 'bg-emerald-500/10', 'text-emerald-400');
      btn.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-600');
      perfState.metric = btn.getAttribute('data-perf-metric');
      renderPerformanceComparator();
    });
  });

  renderPerfTickerChips();
}

async function renderPerformanceComparator() {
  const tab = document.getElementById('tab-performance');
  if (!tab || tab.classList.contains('hidden')) return;

  const tableBody = document.getElementById('perf-table-body');
  if (!tableBody) return;

  if (perfState.tickers.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Adicione tickers acima ou inclua ativos na carteira para começar a comparar.</td></tr>';
    return;
  }

  tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Carregando dados históricos...</td></tr>';

  const settled = await Promise.allSettled(perfState.tickers.map(t => fetchHistoricalSeries(t, perfState.period)));

  const seriesByTicker = {};
  settled.forEach((res, i) => {
    const t = perfState.tickers[i];
    if (res.status === 'fulfilled') seriesByTicker[t] = res.value;
  });

  renderPerfLineChart(seriesByTicker);
  renderPerfBarChart(seriesByTicker);
  renderPerfTable(seriesByTicker);
}

function renderPerfLineChart(seriesByTicker) {
  const ctx = document.getElementById('chart-perf-line');
  if (!ctx || typeof Chart === 'undefined') return;

  const allDates = new Set();
  Object.values(seriesByTicker).forEach(s => (s.points || []).forEach(p => allDates.add(p.date)));
  const labels = Array.from(allDates).sort();

  const datasets = [];
  let ci = 0;
  Object.entries(seriesByTicker).forEach(([ticker, s]) => {
    if (!s.points || s.points.length < 2) return;
    const first = s.points[0].close;
    if (!first) return;
    const map = new Map(s.points.map(p => [p.date, (p.close / first) * 100]));
    let last = null;
    const data = labels.map(d => (map.has(d) ? (last = map.get(d)) : last));
    datasets.push({
      label: ticker,
      data,
      borderColor: PERF_COLORS[ci % PERF_COLORS.length],
      backgroundColor: PERF_COLORS[ci % PERF_COLORS.length] + '22',
      fill: false,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 0
    });
    ci++;
  });

  if (perfLineChart) perfLineChart.destroy();
  if (datasets.length === 0) return;

  perfLineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#6b7280', font: { size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#6b7280', maxTicksLimit: 8 }, grid: { color: 'rgba(156,163,175,0.3)' } },
        y: { ticks: { color: '#6b7280', callback: v => v.toFixed(0) }, grid: { color: 'rgba(156,163,175,0.3)' } }
      }
    }
  });
}

function renderPerfBarChart(seriesByTicker) {
  const ctx = document.getElementById('chart-perf-bar');
  if (!ctx || typeof Chart === 'undefined') return;

  const rows = perfState.tickers
    .map(t => ({ ticker: t, value: computePerfMetric(t, seriesByTicker[t]) }))
    .filter(r => r.value !== null && isFinite(r.value))
    .sort((a, b) => b.value - a.value);

  if (perfBarChart) perfBarChart.destroy();
  if (rows.length === 0) return;

  perfBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.ticker),
      datasets: [{
        label: perfMetricLabel(perfState.metric),
        data: rows.map(r => Number(r.value.toFixed(2))),
        backgroundColor: rows.map((_, i) => PERF_COLORS[i % PERF_COLORS.length]),
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7280', callback: v => v + '%' }, grid: { color: 'rgba(156,163,175,0.3)' } },
        y: { ticks: { color: '#6b7280', font: { weight: 'bold' } }, grid: { display: false } }
      }
    }
  });
}

function renderPerfTable(seriesByTicker) {
  const tableBody = document.getElementById('perf-table-body');
  if (!tableBody) return;

  const rows = perfState.tickers.map(t => {
    const asset = perfFindAsset(t);
    const series = seriesByTicker[t];
    return {
      ticker: t,
      price: perfLastPrice(series) || (asset ? asset.currentPrice : null) || null,
      priceReturn: perfPriceReturn(series),
      totalReturn: perfTotalReturn(asset, series),
      dy: perfDividendYield(asset),
      yoc: perfYieldOnCost(asset),
      margin: perfBazinMargin(asset)
    };
  }).sort((a, b) => {
    const va = computePerfMetric(a.ticker, seriesByTicker[a.ticker]);
    const vb = computePerfMetric(b.ticker, seriesByTicker[b.ticker]);
    return (vb === null || vb === undefined ? -Infinity : vb) - (va === null || va === undefined ? -Infinity : va);
  });

  const fmtPct = (v) => (v === null || v === undefined || !isFinite(v)
    ? '<span class="text-gray-300">—</span>'
    : `<span class="${v >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`);
  const fmtPrice = (v) => (v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '<span class="text-gray-300">—</span>');

  tableBody.innerHTML = rows.map(r => `
    <tr class="hover:bg-gray-200/40 transition">
      <td class="py-2.5 px-4 font-bold text-gray-900">${r.ticker}</td>
      <td class="py-2.5 px-4 text-right text-gray-700">${fmtPrice(r.price)}</td>
      <td class="py-2.5 px-4 text-right">${fmtPct(r.priceReturn)}</td>
      <td class="py-2.5 px-4 text-right">${fmtPct(r.totalReturn)}</td>
      <td class="py-2.5 px-4 text-right">${fmtPct(r.dy)}</td>
      <td class="py-2.5 px-4 text-right">${fmtPct(r.yoc)}</td>
      <td class="py-2.5 px-4 text-right">${fmtPct(r.margin)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="text-center py-8 text-gray-500">Sem dados disponíveis para os tickers selecionados.</td></tr>';
}

/* ============================================================
   IR & DARF - Calculadora Fiscal Mensal (Supabase + localStorage)
   ============================================================ */
function initTaxPage() {
  const monthInput = document.getElementById('tax-month-input');
  if (!monthInput) return;

  monthInput.value = new Date().toISOString().slice(0, 7);
  monthInput.addEventListener('change', loadTaxForMonth);

  document.getElementById('btn-calc-tax')?.addEventListener('click', () => calculateAndRenderTax(true));

  ['tax-stock-sold', 'tax-stock-profit', 'tax-stock-loss',
   'tax-fii-sold', 'tax-fii-profit', 'tax-fii-loss'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => calculateAndRenderTax(false));
  });

  loadTaxForMonth();
}

function readTaxInputs() {
  const num = (id) => {
    const v = parseFloat(document.getElementById(id)?.value);
    return isFinite(v) ? v : 0;
  };
  return {
    yearMonth: document.getElementById('tax-month-input')?.value || new Date().toISOString().slice(0, 7),
    stockSales: [{ sellAmount: num('tax-stock-sold'), costAmount: 0, profit: num('tax-stock-profit') }],
    fiiSales: [{ sellAmount: num('tax-fii-sold'), costAmount: 0, profit: num('tax-fii-profit') }],
    accumulatedStockLossCarried: num('tax-stock-loss'),
    accumulatedFiiLossCarried: num('tax-fii-loss')
  };
}

function calculateAndRenderTax(doSync) {
  const inputs = readTaxInputs();
  if (typeof calculateMonthlyTax !== 'function') return;

  const tax = calculateMonthlyTax(inputs);
  renderTaxResults(tax);
  saveTaxLocal(inputs.yearMonth, inputs, tax);

  const status = document.getElementById('tax-save-status');

  if (doSync && typeof syncMonthlyTaxToCloud === 'function') {
    syncMonthlyTaxToCloud({
      yearMonth: inputs.yearMonth,
      totalStockSales: tax.totalStockSalesAmount,
      isStockExempt: tax.isStockExempt,
      stockRealizedProfit: tax.stockRealizedProfit,
      stockTaxableProfit: tax.stockTaxableProfit,
      stockDarfPayable: tax.stockDarfPayable,
      stockLossCarried: tax.newStockLossCarried,
      fiiRealizedProfit: tax.fiiRealizedProfit,
      fiiTaxableProfit: tax.fiiTaxableProfit,
      fiiDarfPayable: tax.fiiDarfPayable,
      fiiLossCarried: tax.newFiiLossCarried,
      totalDarfPayable: tax.totalDarfPayable
    }).then(res => {
      if (status) status.innerText = res.synced
        ? `Salvo na nuvem para ${inputs.yearMonth}.`
        : 'Cálculo local salvo. (Faça login no Supabase para sincronizar.)';
    });
  } else if (status) {
    status.innerText = `Cálculo local salvo para ${inputs.yearMonth}.`;
  }
}

function renderTaxResults(tax) {
  const result = document.getElementById('tax-result');
  if (!result) return;

  result.classList.remove('hidden');
  result.classList.add('grid');

  const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  set('tax-result-stock-sold', fmt(tax.totalStockSalesAmount));
  set('tax-result-stock-status', tax.isStockExempt
    ? '<span class="text-emerald-400">ISENTO (&lt; R$ 20k)</span>'
    : '<span class="text-amber-400">TRIBUTADO (15%)</span>');
  set('tax-result-stock-taxable', fmt(tax.stockTaxableProfit));
  set('tax-result-stock-darf', fmt(tax.stockDarfPayable));
  set('tax-result-stock-loss', fmt(tax.newStockLossCarried));

  set('tax-result-fii-sold', fmt(tax.totalFiiSalesAmount));
  set('tax-result-fii-status', '<span class="text-indigo-400">ALÍQUOTA 20%</span>');
  set('tax-result-fii-taxable', fmt(tax.fiiTaxableProfit));
  set('tax-result-fii-darf', fmt(tax.fiiDarfPayable));
  set('tax-result-fii-loss', fmt(tax.newFiiLossCarried));

  set('tax-result-total', fmt(tax.totalDarfPayable));
}

function saveTaxLocal(yearMonth, inputs, tax) {
  try {
    localStorage.setItem(`previdencia_invest_tax_${yearMonth}`, JSON.stringify({
      inputs,
      tax,
      updatedAt: new Date().toISOString()
    }));
  } catch (e) { /* armazenamento indisponível */ }
}

function loadTaxForMonth() {
  const monthInput = document.getElementById('tax-month-input');
  const ym = monthInput?.value || new Date().toISOString().slice(0, 7);
  const setInput = (id, v) => { const el = document.getElementById(id); if (el) el.value = Number(v || 0).toFixed(2); };

  const apply = (p) => {
    if (!p || !p.inputs) return;
    setInput('tax-stock-sold', p.inputs.stockSales?.[0]?.sellAmount || 0);
    setInput('tax-stock-profit', p.inputs.stockSales?.[0]?.profit || 0);
    setInput('tax-stock-loss', p.inputs.accumulatedStockLossCarried || 0);
    setInput('tax-fii-sold', p.inputs.fiiSales?.[0]?.sellAmount || 0);
    setInput('tax-fii-profit', p.inputs.fiiSales?.[0]?.profit || 0);
    setInput('tax-fii-loss', p.inputs.accumulatedFiiLossCarried || 0);
    if (p.tax) renderTaxResults(p.tax);
  };

  let payload = null;
  try {
    const raw = localStorage.getItem(`previdencia_invest_tax_${ym}`);
    if (raw) payload = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  if (payload) { apply(payload); return; }

  if (typeof loadMonthlyTaxFromCloud === 'function') {
    loadMonthlyTaxFromCloud(ym).then(cloud => {
      if (cloud) apply(cloud);
    }).catch(() => {});
  }
}
