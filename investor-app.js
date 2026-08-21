// Previdência Invest Application Logic
let portfolioState = { id: null, name: 'Minha Carteira Previdenciária', targetAllocations: {}, assets: [] };
let activeFilter = 'ALL';
let activeNotifFilter = 'ALL';
let retirementChart = null;
let quickActionAnimated = false;
let newsItems = [];
let newsSourceFilter = 'ALL';
let newsLastLoad = 0;
const NEWS_STALE_MS = 10 * 60 * 1000;
const PERF_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#22c55e', '#f97316', '#14b8a6'];
const PERF_PERIOD_YEARS = { '1D': 1/252, '1M': 1/12, '3M': 3/12, '6M': 0.5, '1Y': 1, '2Y': 2, '5Y': 5 };
const perfState = { tickers: [], period: '1D', metric: 'PRICE' };
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

/* ---------- Parsing helper: aceita 0,10 e 0.10 e 1.234,56 ---------- */
function parseLocaleNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && isFinite(value)) return value;
  let s = String(value).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (s === '' || s === ',' || s === '.') return fallback;
  // Formato brasileiro: 1.234,56 -> 1234.56 | 0,10 -> 0.10
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }
  initAuthGate();
  // inicia ticker imediatamente (mesmo com gate visível) para cachear e não depender só do bootstrap
  // header é inert durante login, mas deixa dados prontos para exibir assim que liberar
  try { initMarketTicker(); } catch(e) {}
});

// Função de bootstrap: roda só depois que o usuário autenticou (ou liberou o modo local)
function bootstrapApp(user) {
  loadStoredPortfolio();
  loadNotifReadSet();
  initNavigation();
  initMenu();
  initActionButtons();
  initFormAddAsset();
  initRaioXSelector();
  initRetirementSimulator();
  initPerformanceComparator();
  initTaxPage();
  initDividendsRefresh();
  initMarketTicker();
  history.replaceState(null, '', window.location.pathname + window.location.search + '#/dashboard');
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

let _splashHidden = false;
let _splashStart = Date.now();
function hideRefreshSplash() {
  if (_splashHidden) return;
  const splash = document.getElementById('refresh-splash');
  if (!splash) { _splashHidden = true; return; }
  const elapsed = Date.now() - _splashStart;
  const minShow = 650;
  const delay = elapsed < minShow ? (minShow - elapsed) : 0;
  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.classList.add('hidden');
      splash.setAttribute('aria-hidden', 'true');
      _splashHidden = true;
    }, 300);
  }, delay);
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
  if (authGateUnlocked) { if (user) populateProfileUser(user); hideRefreshSplash(); return; }
  authGateUnlocked = true;
  if (user) populateProfileUser(user);
  setGateVisible(false);
  hideRefreshSplash();
  bootstrapApp(user || null);
}

function lockApp() {
  authGateUnlocked = false;
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
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
      const remember = document.getElementById('login-remember')?.checked ?? true;
      if (typeof setPersistSessionDefault === 'function') setPersistSessionDefault(remember);
      try { sessionStorage.setItem('pv_remember', remember ? '1' : '0'); } catch (e) {}
      try { localStorage.setItem('pv_remember', remember ? '1' : '0'); } catch (e) {}
      const data = await signInUser(email, password);
      setAuthLoading(btn, false);
      if (data?.user) { unlockApp(data.user); return; }
      // Fallback: tenta obter sessão local após login
      if (typeof getSessionUser === 'function') {
        try {
          const u = await getSessionUser();
          if (u) { unlockApp(u); return; }
        } catch (e) {}
      }
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
      const remember = document.getElementById('login-remember')?.checked ?? true;
      if (typeof setPersistSessionDefault === 'function') setPersistSessionDefault(remember);
      try { sessionStorage.setItem('pv_remember', remember ? '1' : '0'); } catch (e) {}
      try { localStorage.setItem('pv_remember', remember ? '1' : '0'); } catch (e) {}
      await signInWithGoogle();
    } catch (err) {
      setAuthLoading(googleBtn, false);
      showAuthMessage('error', friendlyAuthError(err));
    }
  });

  // Modo Local (apenas quando Supabase não está configurado)
  localBtn?.addEventListener('click', () => unlockApp(null, true));

  // Listener de sessão (login, logout, OAuth redirect e refresh)
  // Restaura preferência "Manter conectado" de reloads anteriores
  try {
    const rememberFlag = (function() {
      try { const v = sessionStorage.getItem('pv_remember'); if (v === '0' || v === '1') return v; } catch(e){}
      try { const v = localStorage.getItem('pv_remember'); if (v === '0' || v === '1') return v; } catch(e){}
      return null;
    })();
    if (rememberFlag === '0' && typeof setPersistSessionDefault === 'function') {
      setPersistSessionDefault(false);
    } else if (rememberFlag === '1' && typeof setPersistSessionDefault === 'function') {
      setPersistSessionDefault(true);
    }
  } catch (e) {}
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

  // Verificação assíncrona de sessão existente (persistida no localStorage)
  // Mantém o gate visível até confirmar que não há sessão, mas desbloqueia assim que encontrar
  (async () => {
    try {
      let sessionUser = null;
      if (typeof getSessionUser === 'function') {
        const maybePromise = getSessionUser();
        sessionUser = (maybePromise && typeof maybePromise.then === 'function') ? await maybePromise : maybePromise;
      }
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
      // Fallback: validação com servidor (refresh se necessário)
      if (typeof getLoggedUser === 'function') {
        const serverUser = await getLoggedUser();
        if (serverUser) { unlockApp(serverUser); return; }
      }
    } catch (e) {
      console.warn('Falha ao restaurar sessão:', e);
    }
    // Sem sessão válida -> mantém gate de login, mas NUNCA mostra gate durante o refresh splash
    if (!authGateUnlocked) {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setGateVisible(true);
      hideRefreshSplash();
    } else {
      hideRefreshSplash();
    }
  })();
  // Fallback: garante que o splash nunca fique preso se a verificação travar
  setTimeout(() => hideRefreshSplash(), 3000);
}

function loadStoredPortfolio() {
  try {
    const saved = localStorage.getItem('previdencia_invest_portfolio');
    if (saved) {
      portfolioState = JSON.parse(saved);
      if (portfolioState.assets && Array.isArray(portfolioState.assets)) {
        let needsSave = false;
        // 1) Migração legado: executa APENAS UMA VEZ (flag _migratedDividendsV2)
        // Antes o teste `annual < 1.5` fazia o valor correto 1,20 ser re-migrado para 14,40 a cada reload.
        if (!portfolioState._migratedDividendsV2) {
          portfolioState.assets.forEach(a => {
            const isFII = a.type === 'FII_TIJOLO' || a.type === 'FII_PAPEL';
            if (isFII && a.historicalAverageDPA > 0) {
              const monthly = Number(a.monthlyDividendEstimate) || 0;
              const annual = Number(a.historicalAverageDPA) || 0;
              // Legado real: MXRF salvo como annual=0,10 monthly=0,0083 (monthly≈annual/12 e monthly<0,04 e annual<1,0)
              // Correto 0,10/1,20 tem monthly=0,10 (>0,04) então NÃO entra.
              const isLegacy = monthly > 0 && annual > 0 && annual < 1.0 && monthly < 0.04 && Math.abs(monthly - annual/12) < 0.001;
              if (isLegacy) {
                a.monthlyDividendEstimate = Number(annual.toFixed(4));
                a.historicalAverageDPA = Number((annual * 12).toFixed(4));
              }
            }
          });
          portfolioState._migratedDividendsV2 = true;
          needsSave = true;
        }
        // 2) Reparo de dados já corrompidos por migrações repetidas (ex: 1,20 → 14,40 → 172,80)
        // Se annual > 8 e monthly*12 ≈ annual, é claramente bug de multiplicação repetida.
        portfolioState.assets.forEach(a => {
          const isFII = a.type === 'FII_TIJOLO' || a.type === 'FII_PAPEL';
          if (!isFII) return;
          let annual = Number(a.historicalAverageDPA) || 0;
          let monthly = Number(a.monthlyDividendEstimate) || 0;
          if (annual > 8 && monthly > 0.5 && Math.abs(monthly * 12 - annual) < 0.02) {
            // divide por 12 até voltar a faixa plausível (<8)
            while (annual > 8 && Math.abs(monthly * 12 - annual) < 0.02) {
              annual = Number((annual / 12).toFixed(4));
              monthly = Number((monthly / 12).toFixed(4));
            }
            if (annual !== a.historicalAverageDPA) {
              a.historicalAverageDPA = annual;
              a.monthlyDividendEstimate = monthly;
              needsSave = true;
            }
          }
        });
        if (needsSave) {
          try { localStorage.setItem('previdencia_invest_portfolio', JSON.stringify(portfolioState)); } catch(e){}
        }
      }
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

/* ============================================================
   Dividendos em tempo real (Investidor10 / StatusInvest via Brapi)
   ============================================================ */
async function handleRefreshDividends(btn) {
  const tickers = (portfolioState.assets||[]).map(a=>a.ticker);
  if (!tickers.length) { alert('Adicione ativos na carteira primeiro.'); return; }
  const targetBtn = btn || document.getElementById('btn-refresh-dividends');
  const lastEl = document.getElementById('dividends-last-update');
  if (targetBtn) { targetBtn.disabled = true; targetBtn.classList.add('opacity-60','cursor-not-allowed'); }
  const orig = targetBtn ? targetBtn.innerHTML : '';
  if (targetBtn) targetBtn.innerHTML = '<span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Atualizando...';
  try {
    if (typeof enrichPortfolioWithLiveDividends !== 'function') throw new Error('Serviço de dividendos não carregado');
    const res = await enrichPortfolioWithLiveDividends(portfolioState, { forceDividends: true });
    savePortfolioToStorage();
    renderAllViews();
    initRaioXSelector();
    if (lastEl) {
      const now = new Date();
      lastEl.innerText = '· ' + now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + ' · ' + (res.updated||0) + ' atualizados';
      lastEl.classList.remove('hidden');
    }
    // feedback sutil
    if (res.updated === 0) alert('Nenhum dividendo atualizado. Verifique a conexão ou tente novamente.');
  } catch (err) {
    console.warn('Erro ao atualizar dividendos:', err);
    alert('Falha ao buscar dividendos em tempo real. Tente novamente em instantes.\n' + (err && err.message || ''));
  } finally {
    if (targetBtn) { targetBtn.disabled = false; targetBtn.classList.remove('opacity-60','cursor-not-allowed'); targetBtn.innerHTML = orig; if (window.lucide) lucide.createIcons({icons: lucide.icons}); }
  }
}

function initDividendsRefresh() {
  document.getElementById('btn-refresh-dividends')?.addEventListener('click', (e)=> handleRefreshDividends(e.currentTarget));
  // Atualização automática: SOMENTE preço de mercado do dia (cotação).
  // Dividendos (monthlyDividendEstimate / historicalAverageDPA) NUNCA são alterados no reload – só no clique manual.
  if ((portfolioState.assets||[]).length > 0 && typeof enrichPortfolioWithLiveDividends === 'function') {
    setTimeout(async ()=>{
      try {
        const res = await enrichPortfolioWithLiveDividends(portfolioState, { forceDividends: false });
        // res.updated aqui conta apenas mudanças de preço (dividendos preservados quando force=false)
        if (res.updated > 0) { savePortfolioToStorage(); renderAllViews(); initRaioXSelector(); }
      } catch(e){ /* silencioso – mantém preço manual se API falhar */ }
    }, 1200);
  }
}

/* ============================================================
   IBOV + Dólar no cabeçalho (tempo real)
   ============================================================ */
function formatMarketPrice(value, opts = {}) {
  if (value == null || !isFinite(value)) return '—';
  const decimals = opts.decimals != null ? opts.decimals : (value >= 1000 ? 0 : 2);
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function renderMarketTicker(data) {
  const ibovPriceEl = document.getElementById('market-ibov-price');
  const ibovChangeEl = document.getElementById('market-ibov-change');
  const dolarPriceEl = document.getElementById('market-dolar-price');
  const dolarChangeEl = document.getElementById('market-dolar-change');
  const tickerEl = document.getElementById('market-ticker');
  if (!ibovPriceEl || !dolarPriceEl) return;

  const ibov = data && data.ibov;
  const dolar = data && data.dolar;

  if (ibov && ibov.price != null && isFinite(ibov.price)) {
    ibovPriceEl.innerText = formatMarketPrice(ibov.price, { decimals: 0 }) + ' pts';
    ibovPriceEl.className = 'mono font-bold ' + (ibov.changePercent > 0 ? 'text-emerald-600' : ibov.changePercent < 0 ? 'text-rose-600' : 'text-gray-700');
    if (ibovChangeEl) {
      const pct = ibov.changePercent;
      if (pct != null && isFinite(pct)) {
        const sign = pct > 0 ? '+' : '';
        ibovChangeEl.innerText = `${sign}${Number(pct).toFixed(2)}%`;
        ibovChangeEl.className = 'mono text-[11px] font-bold ' + (pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-rose-500' : 'text-gray-500');
      } else { ibovChangeEl.innerText = ''; }
    }
    ibovPriceEl.title = `${ibov.source || 'IBOV'} · ${ibov.updatedAt ? new Date(ibov.updatedAt).toLocaleTimeString('pt-BR') : ''}`;
  } else {
    ibovPriceEl.innerText = '—';
    ibovPriceEl.className = 'mono font-bold text-gray-500';
    if (ibovChangeEl) ibovChangeEl.innerText = '';
    if (ibov && ibov.error) ibovPriceEl.title = ibov.error;
  }

  if (dolar && dolar.price != null && isFinite(dolar.price)) {
    dolarPriceEl.innerText = 'R$ ' + formatMarketPrice(dolar.price, { decimals: 2 });
    dolarPriceEl.className = 'mono font-bold ' + (dolar.changePercent > 0 ? 'text-amber-600' : dolar.changePercent < 0 ? 'text-emerald-600' : 'text-gray-700');
    if (dolarChangeEl) {
      const pct = dolar.changePercent;
      if (pct != null && isFinite(pct)) {
        const sign = pct > 0 ? '+' : '';
        dolarChangeEl.innerText = `${sign}${Number(pct).toFixed(2)}%`;
        dolarChangeEl.className = 'mono text-[11px] font-bold ' + (pct > 0 ? 'text-rose-500' : pct < 0 ? 'text-emerald-600' : 'text-gray-500');
      } else { dolarChangeEl.innerText = ''; }
    }
    dolarPriceEl.title = `${dolar.source || 'USD/BRL'} · ${dolar.updatedAt ? new Date(dolar.updatedAt).toLocaleTimeString('pt-BR') : ''}`;
  } else {
    dolarPriceEl.innerText = '—';
    dolarPriceEl.className = 'mono font-bold text-gray-500';
    if (dolarChangeEl) dolarChangeEl.innerText = '';
    if (dolar && dolar.error) dolarPriceEl.title = dolar.error;
  }

  if (tickerEl && data && data.fetchedAt) {
    const t = new Date(data.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    tickerEl.title = `Atualizado às ${t} · clique para atualizar`;
  }
}

let marketTickerInterval = null;
async function refreshMarketTicker(force = false) {
  const priceEl = document.getElementById('market-ibov-price');
  if (priceEl && force) priceEl.innerText = '...';
  const dolarEl = document.getElementById('market-dolar-price');
  if (dolarEl && force) dolarEl.innerText = '...';
  try {
    if (typeof getMarketIndicators !== 'function') {
      console.warn('marketService não carregado');
      return;
    }
    const data = await getMarketIndicators({ force });
    renderMarketTicker(data);
  } catch (e) {
    console.warn('Falha ao atualizar IBOV/Dólar:', e);
    // tenta exibir cache expirado
    try {
      const raw = localStorage.getItem('previdencia_invest_market_cache');
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.data) renderMarketTicker(c.data);
      }
    } catch (e2) {}
  }
}

let marketTickerInitialized = false;
function initMarketTicker() {
  // renderiza cache imediatamente para não ficar "—"
  try {
    const raw = localStorage.getItem('previdencia_invest_market_cache');
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.data) renderMarketTicker(c.data);
    }
  } catch (e) {}
  // busca ao vivo (sempre tenta, mesmo se já inicializado)
  setTimeout(() => refreshMarketTicker(false), 400);
  if (marketTickerInitialized) return;
  marketTickerInitialized = true;
  // clique para atualizar (idempotente)
  document.getElementById('market-ticker')?.addEventListener('click', () => refreshMarketTicker(true));
  // auto refresh a cada 3 minutos
  if (marketTickerInterval) clearInterval(marketTickerInterval);
  marketTickerInterval = setInterval(() => refreshMarketTicker(false), 3 * 60 * 1000);
  // atualiza quando volta para aba visível
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshMarketTicker(false);
  });
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

  // Relatório – menu sofisticado (toggle)
  const relatorioToggle = document.getElementById('btn-relatorio-toggle');
  const relatorioSubmenu = document.getElementById('relatorio-submenu');
  const relatorioChevron = document.getElementById('icon-relatorio-chevron');
  relatorioToggle?.addEventListener('click', () => {
    const isHidden = relatorioSubmenu?.classList.contains('hidden');
    if (!relatorioSubmenu) return;
    relatorioSubmenu.classList.toggle('hidden', !isHidden);
    relatorioToggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    if (relatorioChevron) relatorioChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // Fecha o drawer no mobile ao selecionar qualquer aba
  document.querySelectorAll('#sidebar-menu .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => closeMenu());
  });
  // Mantém drawer aberto ao usar Relatório no mobile (não fecha)
  document.querySelectorAll('#relatorio-submenu button').forEach(btn => {
    btn.addEventListener('click', (e) => e.stopPropagation());
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
  if (tabId === 'tab-notificacoes') {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => c.classList.add('hidden'));
    const el = document.getElementById('tab-notificacoes');
    if (el) { el.classList.remove('hidden'); entrance(el, 'fade-in'); }
    document.querySelectorAll('.tab-btn').forEach(b=> b.classList.remove('active-tab'));
    if (window.lucide) lucide.createIcons({ icons: lucide.icons });
    if (typeof generatePortfolioAlerts === 'function') {
      const alerts = generatePortfolioAlerts(portfolioState, (typeof SHARE_CLASSES_DATA !== 'undefined') ? SHARE_CLASSES_DATA : []);
      markAllNotifsRead(alerts);
    }
  }
}

function initNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const activateTab = (btn, fromHash = false) => {
    const targetTab = btn.getAttribute('data-tab');

    tabBtns.forEach(b => {
      b.classList.remove('active-tab');
    });

    btn.classList.add('active-tab');

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

    if (targetTab === 'tab-notificacoes' && typeof generatePortfolioAlerts === 'function') {
      const alerts = generatePortfolioAlerts(portfolioState, (typeof SHARE_CLASSES_DATA !== 'undefined') ? SHARE_CLASSES_DATA : []);
      markAllNotifsRead(alerts);
    }

    if (targetTab === 'tab-performance') {
      syncPerfPortfolioTickers();
      renderPerformanceComparator();
    }

    if (window.lucide) { lucide.createIcons({ icons: lucide.icons }); }

    if (!fromHash && targetTab) {
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

  // Header search – filtra ativos na Dashboard e sincroniza com tabela
  const headerSearch = document.getElementById('header-search');
  if (headerSearch) {
    headerSearch.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const tbody = document.getElementById('assets-table-body');
      if (!tbody) return;
      // Se vazio, mostra conforme filtro atual
      if (!q) { renderAssetsTable(); return; }
      const filtered = portfolioState.assets.filter(a => {
        const matchTxt = `${a.ticker} ${a.name} ${a.type}`.toLowerCase();
        const matchFilter = activeFilter === 'ALL' || a.type === activeFilter;
        return matchFilter && matchTxt.includes(q);
      });
      // Renderização leve filtrada por busca (reusa lógica de renderAssetsTable mas com subset)
      tbody.innerHTML = '';
      filtered.forEach(asset => {
        const exchange = (asset.currency === 'USD' ? (asset.deepDive?.exchangeRateBRLUSD || 5.65) : 1);
        const curPriceBRL = asset.currentPrice * exchange;
        const avgPriceBRL = asset.averagePrice * exchange;
        const totalValBRL = curPriceBRL * asset.quantity;
        const bazin = calculateBazinCeilingPrice(asset.historicalAverageDPA, asset.targetAnnualYield || 0.06);
        const margin = calculateMarginOfSafety(bazin, asset.currentPrice);
        const yoc = calculateYieldOnCost(asset.historicalAverageDPA, asset.averagePrice);
        const monthlyPerShareBRL = (asset.monthlyDividendEstimate != null && asset.monthlyDividendEstimate !== 0) ? (Number(asset.monthlyDividendEstimate) || 0) * exchange : ((Number(asset.historicalAverageDPA) || 0) * exchange / 12);
        const monthlyTotalBRL = monthlyPerShareBRL * (Number(asset.quantity) || 0);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[rgba(236,238,240,0.5)] transition font-medium group';
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (ev) => { if (ev.target.closest('button')) return; openEditAsset(asset.ticker); });
        tr.innerHTML = `
          <td class="py-3 px-4"><div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-lg bg-[#eceef0] flex items-center justify-center font-bold text-[#00513f] text-[11px] shrink-0 border border-[rgba(190,201,195,0.3)]">${asset.ticker.slice(0, 3)}</div><div class="min-w-0"><div class="font-bold text-[#191c1e] text-xs">${asset.ticker}</div><div class="text-[11px] text-[#3e4945]/70 truncate max-w-[130px]">${asset.name}</div></div></div></td>
          <td class="py-3 px-4"><span class="chip-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getTypeBadgeClass(asset.type)}"><i data-lucide="${getTypeIcon(asset.type)}" class="shrink-0" style="width:12px;height:12px"></i> ${formatTypeLabel(asset.type)}</span></td>
          <td class="py-3 px-4 text-right text-[#3e4945] font-bold">${asset.quantity}</td>
          <td class="py-3 px-4 text-right text-[#3e4945]/70">R$ ${avgPriceBRL.toFixed(2)}</td>
          <td class="py-3 px-4 text-right font-bold ${curPriceBRL >= avgPriceBRL ? 'text-[#00513f]' : 'text-[#ba1a1a]'}">R$ ${curPriceBRL.toFixed(2)}</td>
          <td class="py-3 px-4 text-right text-[#f59e0b] font-bold">R$ ${(bazin * exchange).toFixed(2)}</td>
          <td class="py-3 px-4 text-right font-bold ${margin >= 0 ? 'text-[#00513f]' : 'text-[#ba1a1a]'}">${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%</td>
          <td class="py-3 px-4 text-right text-[#4648d4] font-bold">${yoc.toFixed(1)}%</td>
          <td class="py-3 px-4 text-right font-bold text-[#191c1e]">R$ ${totalValBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="py-3 px-4 text-right bg-[rgba(70,72,212,0.04)] whitespace-nowrap"><div class="font-bold text-[#4648d4] whitespace-nowrap">R$ ${monthlyTotalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div class="text-[10px] text-[#3e4945]/70 font-normal whitespace-nowrap">R$ ${monthlyPerShareBRL.toFixed(2)}/cota</div></td>
          <td class="py-3 px-2 text-center row-actions"><div class="flex items-center justify-center gap-1 flex-nowrap"><button onclick="event.stopPropagation(); openRaioXForTicker('${asset.ticker}')" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[rgba(6,182,212,0.08)] hover:bg-[rgba(6,182,212,0.12)] text-[#0891b2] border border-[rgba(6,182,212,0.15)] transition-colors duration-150 active:scale-95 shrink-0 lg:w-auto lg:h-auto lg:px-2.5 lg:py-1 lg:gap-1"><i data-lucide="microscope" class="shrink-0" style="width:12px;height:12px"></i> <span class="hidden lg:inline text-[11px] font-bold">Raio-X</span></button><button onclick="event.stopPropagation(); openEditAsset('${asset.ticker}')" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#00513f] hover:bg-[#006b55] text-white shadow-sm border border-[#00513f] transition-all duration-150 active:scale-95 shrink-0"><i data-lucide="pencil" class="shrink-0" style="width:11px;height:11px"></i> <span>Editar</span></button><button onclick="event.stopPropagation(); removeAssetFromPortfolio('${asset.ticker}')" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white hover:bg-[#ffdad6] text-[#3e4945] hover:text-[#ba1a1a] border border-[rgba(190,201,195,0.4)] hover:border-[#ba1a1a]/20 transition-colors duration-150 active:scale-95 shrink-0"><i data-lucide="trash-2" class="shrink-0" style="width:12px;height:12px"></i></button></div></td>`;
        tbody.appendChild(tr);
      });
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-[#3e4945]/70 text-xs">Nenhum ativo encontrado para "'+ q +'"</td></tr>';
      }
      if (window.lucide) lucide.createIcons({ icons: lucide.icons });
      staggerIn(tbody);
    });
    headerSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.target.value=''; renderAssetsTable(); }
    });
  }

  // Notificações – popup apenas ícone (DESIGN.md: pill, 8px, secondary tint)
  const notifBtn = document.getElementById('btn-header-notifications');
  const notifPopup = document.getElementById('notif-popup');
  const notifPopupList = document.getElementById('notif-popup-list');
  const notifPopupClose = document.getElementById('btn-notif-popup-close');
  const notifViewAll = document.getElementById('btn-notif-view-all');
  const notifWrapper = document.getElementById('notif-wrapper');
  const notifBackdrop = document.getElementById('notif-popup-backdrop');

  function renderNotifPopup() {
    if (!notifPopupList || typeof generatePortfolioAlerts !== 'function') return;
    const classesData = (typeof SHARE_CLASSES_DATA !== 'undefined') ? SHARE_CLASSES_DATA : [];
    const allAlerts = generatePortfolioAlerts(portfolioState, classesData);
    const filtered = allAlerts.filter(a => activeNotifFilter === 'ALL' || a.category === activeNotifFilter);
    notifPopupList.innerHTML = '';
    if (filtered.length === 0) {
      notifPopupList.innerHTML = '<div class="p-6 text-center text-[12px] text-[#3e4945]/70">Nenhuma notificação nesta categoria.</div>';
      return;
    }
    filtered.slice(0, 6).forEach(alert => {
      const isUnread = !notifReadSet.has(alert.id);
      let badge = '';
      let border = 'border-[rgba(190,201,195,0.3)] bg-white';
      if (alert.category === 'RISK') badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(186,26,26,0.08)] text-[#ba1a1a] border border-[rgba(186,26,26,0.15)]">RISCO</span>';
      else if (alert.category === 'OPPORTUNITY') badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(0,81,63,0.08)] text-[#00513f] border border-[rgba(0,81,63,0.15)]">OPORTUNIDADE</span>';
      else if (alert.category === 'DIVIDEND') badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(70,72,212,0.08)] text-[#4648d4] border border-[rgba(70,72,212,0.15)]">PROVENTO</span>';
      if (alert.category === 'RISK') border = 'border-[rgba(186,26,26,0.15)] bg-[rgba(186,26,26,0.04)]';
      else if (alert.category === 'OPPORTUNITY') border = 'border-[rgba(0,81,63,0.15)] bg-[rgba(0,81,63,0.04)]';
      const card = document.createElement('div');
      card.className = `p-3 rounded-lg border ${border} space-y-2 cursor-pointer hover:shadow-md transition ${isUnread ? '' : 'opacity-70'}`;
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2"><span class="text-[11px] font-bold text-[#191c1e]">${alert.ticker}</span> ${badge} ${isUnread ? '<span class="w-1.5 h-1.5 rounded-full bg-[#00513f] inline-block"></span>' : ''}</div>
          <span class="text-[10px] text-[#3e4945]/60">${alert.category}</span>
        </div>
        <div class="text-[12px] font-semibold text-[#191c1e] leading-tight">${alert.title}</div>
        <div class="text-[11px] text-[#3e4945] leading-relaxed line-clamp-2">${alert.message}</div>
      `;
      card.addEventListener('click', () => {
        markNotifRead(alert.id);
        updateNotifBadge(allAlerts);
        renderNotifPopup();
        renderNotificationCenter();
        // opcional: abrir ativo
        if (alert.ticker) openEditAsset(alert.ticker);
        closeNotifPopup();
      });
      notifPopupList.appendChild(card);
    });
    if (window.lucide) lucide.createIcons({ icons: lucide.icons });
  }
  function openNotifPopup() {
    if (!notifPopup || !notifBtn) return;
    renderNotifPopup();
    notifPopup.classList.remove('hidden');
    notifPopup.classList.add('flex');
    notifPopup.classList.add('flex-col');
    if (notifBackdrop) notifBackdrop.classList.remove('hidden');
    notifBtn.setAttribute('aria-expanded', 'true');
    // marca como lido ao abrir
    if (typeof generatePortfolioAlerts === 'function') {
      const alerts = generatePortfolioAlerts(portfolioState, (typeof SHARE_CLASSES_DATA !== 'undefined') ? SHARE_CLASSES_DATA : []);
      markAllNotifsRead(alerts);
    }
    if (window.lucide) lucide.createIcons({ icons: lucide.icons });
  }
  function closeNotifPopup() {
    if (!notifPopup || !notifBtn) return;
    notifPopup.classList.add('hidden');
    notifPopup.classList.remove('flex');
    if (notifBackdrop) notifBackdrop.classList.add('hidden');
    notifBtn.setAttribute('aria-expanded', 'false');
  }
  notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notifPopup.classList.contains('hidden')) openNotifPopup();
    else closeNotifPopup();
  });
  notifPopupClose?.addEventListener('click', closeNotifPopup);
  notifBackdrop?.addEventListener('click', closeNotifPopup);
  notifViewAll?.addEventListener('click', () => {
    closeNotifPopup();
    window.location.hash = '#/notificacoes';
  });
  document.addEventListener('click', (e) => {
    if (!notifPopup || notifPopup.classList.contains('hidden')) return;
    const target = e.target;
    if (!notifWrapper.contains(target) && !notifPopup.contains(target)) closeNotifPopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifPopup && !notifPopup.classList.contains('hidden')) closeNotifPopup();
  });
  // Filtros do popup (reusa activeNotifFilter global)
  const popupFilters = document.querySelectorAll('#notif-popup [data-notif-filter]');
  popupFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      popupFilters.forEach(b => b.classList.remove('active-notif-filter','bg-[rgba(0,81,63,0.08)]','text-[#00513f]','border','border-[rgba(0,81,63,0.15)]'));
      btn.classList.add('active-notif-filter');
      // sincroniza com filtro global usado em renderNotificationCenter/popup
      activeNotifFilter = btn.getAttribute('data-notif-filter');
      document.querySelectorAll('.notif-filter-btn').forEach(b=> b.classList.remove('active-notif-filter'));
      btn.classList.add('active-notif-filter');
      renderNotifPopup();
      renderNotificationCenter();
    });
  });

  const filterBtns = document.querySelectorAll('.asset-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
filterBtns.forEach(b => {
        b.classList.remove('active-filter', 'bg-[rgba(0,81,63,0.08)]', 'text-[#00513f]', 'border', 'border-[rgba(0,81,63,0.15)]');
        b.classList.add('bg-[#eceef0]', 'text-[#3e4945]', 'border-transparent');
      });
      btn.classList.add('active-filter', 'bg-[rgba(0,81,63,0.08)]', 'text-[#00513f]', 'border', 'border-[rgba(0,81,63,0.15)]');
btn.classList.remove('bg-[#eceef0]', 'text-[#3e4945]', 'border-transparent');
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
    // Renda mensal = (DPA mensal por cota em BRL) * quantidade
    // Se monthlyDividendEstimate existir, ele está na moeda original -> converter para BRL via exchange
    // Caso contrário, usar dpaAnnualBRL/12 que já está em BRL (evita double conversion)
    const monthlyPerShareBRL = (asset.monthlyDividendEstimate != null && asset.monthlyDividendEstimate !== 0)
      ? (Number(asset.monthlyDividendEstimate) || 0) * exchange
      : (dpaAnnualBRL / 12);
    totalMonthlyDividends += monthlyPerShareBRL * (Number(asset.quantity) || 0);
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
    const monthlyPerShareBRL = (asset.monthlyDividendEstimate != null && asset.monthlyDividendEstimate !== 0)
      ? (Number(asset.monthlyDividendEstimate) || 0) * exchange
      : ((Number(asset.historicalAverageDPA) || 0) * exchange / 12);
    const monthlyTotalBRL = monthlyPerShareBRL * (Number(asset.quantity) || 0);

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-[rgba(236,238,240,0.5)] transition font-medium group';
    tr.title = 'Clique para editar ' + asset.ticker;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openEditAsset(asset.ticker);
    });
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#eceef0] flex items-center justify-center font-bold text-[#00513f] text-[11px] shrink-0 border border-[rgba(190,201,195,0.3)]">
            ${asset.ticker.slice(0, 3)}
          </div>
          <div class="min-w-0">
            <div class="font-bold text-[#191c1e] text-xs">${asset.ticker}</div>
            <div class="text-[11px] text-[#3e4945]/70 truncate max-w-[130px]">${asset.name}</div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4">
        <span class="chip-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getTypeBadgeClass(asset.type)}">
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
      <td class="py-3 px-4 text-right bg-indigo-500/5 whitespace-nowrap" title="Provento mensal: ${asset.quantity}×R$ ${monthlyPerShareBRL.toFixed(2)} = R$ ${monthlyTotalBRL.toFixed(2)} — dados ao vivo via StatusInvest/Investidor10 (Brapi)">
        <div class="font-bold text-indigo-600 whitespace-nowrap">R$ ${monthlyTotalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="text-[10px] text-gray-500 font-normal whitespace-nowrap">R$ ${monthlyPerShareBRL.toFixed(2)}/cota</div>
      </td>
      <td class="py-3 px-2 text-center row-actions">
        <div class="flex items-center justify-center gap-1 flex-nowrap">
           <button onclick="event.stopPropagation(); openRaioXForTicker('${asset.ticker}')" title="Raio-X detalhado (composição e imóveis via Investidor10/StatusInvest)" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 border border-cyan-500/20 transition-colors duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 shrink-0 lg:w-auto lg:h-auto lg:px-2.5 lg:py-1 lg:gap-1">
             <i data-lucide="microscope" class="shrink-0" style="width:12px;height:12px"></i> <span class="hidden lg:inline text-[11px] font-bold">Raio-X</span>
           </button>
           <button onclick="event.stopPropagation(); openEditAsset('${asset.ticker}')" title="Editar ativo (quantidade, preço, proventos) – clique na linha também edita" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm border border-indigo-600 transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 shrink-0">
             <i data-lucide="pencil" class="shrink-0" style="width:11px;height:11px"></i> <span>Editar</span>
           </button>
           <button onclick="event.stopPropagation(); removeAssetFromPortfolio('${asset.ticker}')" title="Excluir ativo da carteira" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white hover:bg-rose-50 text-gray-500 hover:text-rose-500 border border-gray-200 hover:border-rose-200 transition-colors duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 shrink-0">
             <i data-lucide="trash-2" class="shrink-0" style="width:12px;height:12px"></i>
           </button>
         </div>
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
      diagnosticBadge = '<span class="anim-pulse-soft inline-flex items-center justify-center whitespace-nowrap leading-none px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold tracking-wide">COMPRA FORTE</span>';
    } else if (margin >= 0) {
      diagnosticBadge = '<span class="inline-flex items-center justify-center whitespace-nowrap leading-none px-3 py-1 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 text-[10px] font-bold tracking-wide">ZONA DE COMPRA</span>';
    } else {
      diagnosticBadge = '<span class="inline-flex items-center justify-center whitespace-nowrap leading-none px-3 py-1 rounded-full bg-gray-200 text-gray-500 border border-gray-300 text-[10px] font-bold tracking-wide">AGUARDAR</span>';
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
      <td class="py-3 px-4 text-center whitespace-nowrap">${diagnosticBadge}</td>
    `;
tbody.appendChild(tr);
  });

  staggerIn(tbody);

  const cashInput = document.getElementById('input-rebalance-amount');
  runRebalanceOrders(cashInput ? parseLocaleNumber(cashInput.value, 1500) : 1500);
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

  // Enriquecimento ao vivo via StatusInvest/Investidor10 (Brapi) – sempre busca se não há Raio-X ao vivo
  const isGenericRaiox = !deep.properties?.length && !deep.debtsPortfolio?.length && !deep.fixedIncomeDetails
    && (String(deep.description||'').includes('Ativo adicionado') || String(deep.description||'').includes('Ativo importado') || deep.companyName === deep.ticker);
  const needsLive = (!deep.liveInfo || isGenericRaiox) && typeof fetchAssetInfos === 'function' && !asset._raioxFetching;
  if (needsLive) {
    asset._raioxFetching = true;
    // placeholder de carregamento (mantém card parcial visível)
    const loadingHtml = `<div class="flex items-center gap-2 text-xs text-cyan-600 bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3 mb-3"><span class="w-3.5 h-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></span> Buscando Raio-X em tempo real em StatusInvest/Investidor10 e Brapi para ${asset.ticker}...<a href="https://investidor10.com.br/fiis/${asset.ticker.toLowerCase()}" target="_blank" class="ml-auto text-cyan-700 underline">abrir Investidor10</a></div>`;
    // se ainda não tem conteúdo, mostra loading; se já tem card, prepend loading
    if (!container.innerHTML.trim() || isGenericRaiox) container.innerHTML = loadingHtml;
    else container.insertAdjacentHTML('afterbegin', loadingHtml);
    fetchAssetInfos([targetTicker]).then(infos=>{
      const info = infos[targetTicker];
      if (info) {
        // atualiza deepDive com dados vivos SEM mutar valores manuais da carteira (currentPrice/dividendo)
        // Guarda tudo em deepDive.live* para exibição, preserva o que o usuário digitou.
        deep.companyName = (isGenericRaiox && info.name) ? info.name : deep.companyName;
        if (info.price && isFinite(info.price) && info.price > 0) {
          deep.livePrice = Number(info.price);
        }
        if (info.monthlyDividend != null && isFinite(info.monthlyDividend) && info.monthlyDividend > 0) {
          deep.liveMonthly = Number(info.monthlyDividend.toFixed(4));
          deep.liveAnnual = Number((info.annualDividend != null && info.annualDividend>0 ? info.annualDividend : info.monthlyDividend*12).toFixed(4));
        } else if (info.annualDividend != null && isFinite(info.annualDividend) && info.annualDividend > 0) {
          deep.liveAnnual = Number(info.annualDividend.toFixed(4));
          deep.liveMonthly = Number((info.annualDividend/12).toFixed(4));
        }
        deep.description = info.sources?.scraping?.info?.descricao ? info.sources.scraping.info.descricao : (info.name ? `${info.name} (${info.type}) — dados ao vivo via ${info.sources?.scraping?.source || info.sources?.brapi?.source || 'Brapi'}.` : deep.description);
        const live = info.sources?.scraping?.info || {};
        if (live.segment) deep.subsector = live.segment;
        if (live.cnpj) deep.cnpj = live.cnpj;
        if (info.raioxUrl) deep.infoUrl = info.raioxUrl;
        if (info.dy != null) deep.liveDy = info.dy;
        // guarda todo o Raio-X ao vivo para exibir dentro do card
        deep.liveInfo = {
          segment: live.segment || null,
          cnpj: live.cnpj || null,
          pvp: live.pvp ?? null,
          patrimonio: live.patrimonio || null,
          vacancia: live.vacancia ?? null,
          liquidez: live.liquidez || null,
          cotas: live.cotas || null,
          administrador: live.administrador || null,
          descricao: live.descricao || null
        };
        // atualiza businessModel com info ao vivo se genérico
        if (live.descricao && String(deep.businessModel||'').includes('Conforme atividade')) deep.businessModel = live.descricao.slice(0,300);
        // composição ao vivo (imóveis)
        if (info.raioxComposition && info.raioxComposition.length) {
          deep.properties = info.raioxComposition.slice(0,12).map(c=>({
            name: c.name || 'Imóvel',
            city: '—', state: 'BR',
            grossLeasableAreaM2: Number(String(c.abl||'').replace(/\./g,'').replace(',','.')) || 0,
            revenuePercent: 0, occupancyPercent: 0, mainTenants: []
          }));
        }
        // Não salva automaticamente no localStorage para não alterar carteira do usuário;
        // dados ao vivo ficam apenas em memória em deepDive.live* para exibição.
        renderRaioXDetail(targetTicker);
      } else {
        // sem dados ao vivo – mantém card genérico mas mostra aviso com link direto para Investidor10/StatusInvest
        container.insertAdjacentHTML('beforeend', `<div class="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-gray-600 flex items-center gap-2"><i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500"></i> Não foi possível carregar o Raio-X ao vivo para ${asset.ticker} (site pode estar bloqueando). <a href="https://investidor10.com.br/fiis/${asset.ticker.toLowerCase()}" target="_blank" class="text-indigo-600 underline font-bold">Abrir no Investidor10</a> <span class="mx-1">·</span> <a href="https://statusinvest.com.br/fiis/${asset.ticker.toLowerCase()}" target="_blank" class="text-indigo-600 underline font-bold">StatusInvest</a> <button onclick="delete portfolioState.assets.find(a=>a.ticker==='${asset.ticker}')._raioxFetching; renderRaioXDetail('${asset.ticker}')" class="ml-auto px-2 py-1 rounded bg-white border text-[11px]">Tentar novamente</button></div>`);
        if (window.lucide) lucide.createIcons({icons: lucide.icons});
      }
    }).catch((err)=>{
      console.warn('Raio-X ao vivo falhou', err);
      const errHtml = `<div class="mt-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-xs text-rose-700 flex items-center gap-2"><i data-lucide="wifi-off" class="w-4 h-4"></i> Falha de conexão ao buscar Investidor10/StatusInvest para ${asset.ticker}. <a href="https://investidor10.com.br/fiis/${asset.ticker.toLowerCase()}" target="_blank" class="underline font-bold">Abrir Investidor10</a><button onclick="const a=portfolioState.assets.find(x=>x.ticker==='${asset.ticker}'); if(a) delete a._raioxFetching; renderRaioXDetail('${asset.ticker}')" class="ml-auto px-2 py-1 rounded bg-white border text-[11px]">Tentar novamente</button></div>`;
      container.insertAdjacentHTML('beforeend', errHtml);
      if (window.lucide) lucide.createIcons({icons: lucide.icons});
    }).finally(()=>{ delete asset._raioxFetching; });
    // continua renderizando o genérico enquanto carrega (não retorna)
  }

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

  const monthlyPerShare = asset.monthlyDividendEstimate || (asset.historicalAverageDPA||0)/12;
  const monthlyTotalLive = monthlyPerShare * (asset.quantity||0);
  const liveBanner = deep.infoUrl ? `
    <div class="mb-3 flex flex-wrap items-center gap-2 text-[11px] bg-indigo-500/5 border border-indigo-500/15 rounded-xl px-3 py-2">
      <i data-lucide="external-link" class="w-3.5 h-3.5 text-indigo-500"></i>
      <span class="text-gray-600">Dados ao vivo via <strong>${deep.infoUrl.includes('statusinvest')?'StatusInvest':'Investidor10'}</strong>${deep.liveDy!=null?' · DY '+Number(deep.liveDy).toFixed(2)+'%':''} · Provento mensal R$ ${monthlyPerShare.toFixed(2)}/cota · Total R$ ${monthlyTotalLive.toFixed(2)}/mês</span>
      <a href="${deep.infoUrl}" target="_blank" rel="noopener" class="ml-auto inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-bold">Abrir em ${deep.infoUrl.includes('statusinvest')?'StatusInvest':'Investidor10'} <i data-lucide="arrow-up-right" class="w-3 h-3"></i></a>
    </div>` : '';

  container.innerHTML = `
    ${liveBanner}
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
        ${deep.liveInfo && (deep.liveInfo.pvp!=null || deep.liveInfo.vacancia!=null || deep.liveInfo.patrimonio || deep.liveInfo.cnpj || deep.liveInfo.liquidez) ? `
        <div class="pt-3 border-t border-gray-200/80">
          <span class="text-[11px] uppercase font-bold text-cyan-600 tracking-wider flex items-center gap-1"><i data-lucide="search" class="w-3 h-3"></i> Raio-X ao vivo (Investidor10/StatusInvest) — o que o ativo é e o que tem dentro</span>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2 text-[11px]">
            ${deep.liveInfo.cnpj ? `<div><span class="block text-gray-500">CNPJ</span><span class="font-bold text-gray-900">${deep.liveInfo.cnpj}</span></div>` : ``}
            ${deep.liveInfo.pvp!=null ? `<div><span class="block text-gray-500">P/VP</span><span class="font-bold ${Number(deep.liveInfo.pvp)<1?'text-emerald-600':'text-gray-900'}">${Number(deep.liveInfo.pvp).toFixed(2)}</span></div>` : ``}
            ${deep.liveInfo.vacancia!=null ? `<div><span class="block text-gray-500">Vacância</span><span class="font-bold ${Number(deep.liveInfo.vacancia)>5?'text-amber-600':'text-emerald-600'}">${Number(deep.liveInfo.vacancia).toFixed(2)}%</span></div>` : ``}
            ${deep.liveInfo.patrimonio ? `<div class="col-span-2 sm:col-span-1"><span class="block text-gray-500">Patrimônio</span><span class="font-bold text-gray-900 truncate block">${deep.liveInfo.patrimonio}</span></div>` : ``}
            ${deep.liveInfo.liquidez ? `<div><span class="block text-gray-500">Liquidez</span><span class="font-bold text-gray-900">${deep.liveInfo.liquidez}</span></div>` : ``}
            ${deep.liveInfo.administrador ? `<div class="col-span-2"><span class="block text-gray-500">Administrador</span><span class="font-bold text-gray-900 truncate block">${deep.liveInfo.administrador}</span></div>` : ``}
          </div>
          ${deep.properties && deep.properties.length ? `<p class="text-[10px] text-gray-500 mt-2">${deep.properties.length} ativos/imóveis mapeados abaixo — composição real do fundo.</p>` : ``}
        </div>` : ``}
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
  const targetIncome = parseLocaleNumber(document.getElementById('sim-target-income')?.value, 5000);
  const contribution = parseLocaleNumber(document.getElementById('sim-monthly-contribution')?.value, 1500);
  const yieldAnnual = (parseLocaleNumber(document.getElementById('sim-expected-yield')?.value, 8.5)) / 100;

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
    const cash = parseLocaleNumber(document.getElementById('input-rebalance-amount')?.value, 1500);
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

function getDividendEstimates(dpaInput) {
  // Novo Aporte agora pede Dividendo Mensal por cota (ex: MXRF 0,10 → 0,30 para 3 cotas)
  // Independente do tipo, convertemos mensal → anual para manter compatibilidade
  return { annual: dpaInput * 12, monthly: dpaInput };
}
function initFormAddAsset() {
  const form = document.getElementById('form-add-asset');
  if (!form) return;
  // Novo Aporte pede Dividendo Mensal (ajuste solicitado) – label fixo
  const dpaInput = document.getElementById('add-dpa');
  const dpaLabel = dpaInput ? dpaInput.closest('div')?.querySelector('label') : null;
  if (dpaLabel) dpaLabel.innerText = 'Dividendo Mensal (R$) por cota';
  if (dpaInput) { dpaInput.placeholder = '0,10'; dpaInput.value = ''; }
  // mantém compatibilidade se tipo mudar (não altera label)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ticker = document.getElementById('add-ticker').value.trim().toUpperCase();
    const type = document.getElementById('add-type').value;
    const quantity = parseLocaleNumber(document.getElementById('add-quantity').value, 0);
    const price = parseLocaleNumber(document.getElementById('add-price').value, 0);
    const dpa = parseLocaleNumber(document.getElementById('add-dpa').value, 0);

    const existingIdx = portfolioState.assets.findIndex(a => a.ticker === ticker);
    if (existingIdx >= 0) {
      const existing = portfolioState.assets[existingIdx];
      const newQty = existing.quantity + quantity;
      const newTotalCost = (existing.quantity * existing.averagePrice) + (quantity * price);
      existing.averagePrice = newTotalCost / newQty;
      existing.quantity = newQty;
      existing.currentPrice = price;
      if (dpa > 0) {
        const est = getDividendEstimates(dpa);
        existing.historicalAverageDPA = est.annual;
        existing.monthlyDividendEstimate = est.monthly;
      }
    } else {
      const est = getDividendEstimates(dpa);
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
        historicalAverageDPA: est.annual,
        monthlyDividendEstimate: est.monthly,
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

let pendingDeleteTicker = null;

function hideConfirmDeleteModal() {
  pendingDeleteTicker = null;
  document.getElementById('modal-confirm-delete')?.classList.add('hidden');
}

function showConfirmDeleteModal(ticker) {
  const asset = portfolioState.assets.find(a => a.ticker === ticker);
  if (!asset) return;
  pendingDeleteTicker = ticker;
  const msgEl = document.getElementById('confirm-delete-message');
  const detailsEl = document.getElementById('confirm-delete-details');
  if (msgEl) {
    const namePart = (asset.name && asset.name !== asset.ticker) ? ` — ${asset.name}` : '';
    msgEl.innerText = `Você tem certeza que deseja excluir ${asset.ticker}${namePart} da sua carteira?`;
  }
  if (detailsEl) {
    const totalBRL = (asset.currentPrice * asset.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    detailsEl.classList.remove('hidden');
    detailsEl.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-gray-500">Ticker</span>
        <span class="font-bold text-gray-900">${asset.ticker} <span class="text-gray-500 font-medium">· ${formatTypeLabel(asset.type)}</span></span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-gray-500">Quantidade</span>
        <span class="font-bold text-gray-900">${asset.quantity} cotas</span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-gray-500">Valor estimado</span>
        <span class="font-bold text-gray-900">R$ ${totalBRL}</span>
      </div>`;
  }
  document.getElementById('modal-confirm-delete')?.classList.remove('hidden');
  if (window.lucide) lucide.createIcons({ icons: lucide.icons });
}

async function confirmDeleteAsset() {
  const ticker = pendingDeleteTicker;
  if (!ticker) return;
  const idx = portfolioState.assets.findIndex(a => a.ticker === ticker);
  if (idx < 0) { hideConfirmDeleteModal(); return; }
  const btn = document.getElementById('btn-confirm-delete');
  if (btn) { btn.disabled = true; btn.classList.add('opacity-60', 'cursor-not-allowed'); }
  portfolioState.assets.splice(idx, 1);
  savePortfolioToStorage();
  renderAllViews();
  initRaioXSelector();
  hideConfirmDeleteModal();
  if (btn) { btn.disabled = false; btn.classList.remove('opacity-60', 'cursor-not-allowed'); }
  if (typeof deleteAssetsFromCloud === 'function') {
    try {
      await deleteAssetsFromCloud([ticker]);
    } catch (e) {
      console.warn('Erro ao excluir ativo da nuvem:', e);
    }
  }
}

function initConfirmDeleteModal() {
  if (document.getElementById('modal-confirm-delete')?.dataset.bound === '1') return;
  const modal = document.getElementById('modal-confirm-delete');
  if (modal) modal.dataset.bound = '1';
  document.getElementById('btn-close-modal-confirm-delete')?.addEventListener('click', hideConfirmDeleteModal);
  document.getElementById('btn-cancel-delete')?.addEventListener('click', hideConfirmDeleteModal);
  document.getElementById('btn-confirm-delete')?.addEventListener('click', confirmDeleteAsset);
  modal?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modal-confirm-delete') hideConfirmDeleteModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) hideConfirmDeleteModal();
  });
}

async function removeAssetFromPortfolio(ticker) {
  showConfirmDeleteModal(ticker);
}

// ---------- Edição de Ativos ----------
function openEditAsset(ticker) {
  const asset = portfolioState.assets.find(a => a.ticker === ticker);
  if (!asset) return;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('edit-original-ticker', asset.ticker);
  setVal('edit-ticker', asset.ticker);
  setVal('edit-name', asset.name || asset.ticker);
  setVal('edit-type', asset.type || 'ACAO');
  setVal('edit-quantity', asset.quantity);
  setVal('edit-average-price', asset.averagePrice);
  setVal('edit-current-price', asset.currentPrice);
  const dpaForField = asset.monthlyDividendEstimate || (asset.historicalAverageDPA || 0) / 12;
  setVal('edit-dpa', Number(dpaForField).toFixed(2).replace('.', ','));
  // label fixo: Dividendo Mensal (solicitação do usuário) – por cota
  const editDpaLabel = document.getElementById('edit-dpa')?.closest('div')?.querySelector('label');
  if (editDpaLabel) editDpaLabel.innerText = 'Dividendo Mensal (R$) por cota';
  document.getElementById('edit-dpa')?.setAttribute('placeholder', '0,10');
  document.getElementById('modal-edit-asset')?.classList.remove('hidden');
  if (window.lucide) lucide.createIcons({ icons: lucide.icons });
}

function closeEditAssetModal() {
  document.getElementById('modal-edit-asset')?.classList.add('hidden');
}

function initFormEditAsset() {
  document.getElementById('btn-close-modal-edit')?.addEventListener('click', closeEditAssetModal);
  document.getElementById('modal-edit-asset')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modal-edit-asset') closeEditAssetModal();
  });
  if (!initFormEditAsset._escBound) {
    initFormEditAsset._escBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const editModal = document.getElementById('modal-edit-asset');
        if (editModal && !editModal.classList.contains('hidden')) closeEditAssetModal();
      }
    });
  }
  // label fixo mensal (não alterna mais)
  document.getElementById('edit-type')?.addEventListener('change', () => {
    const label = document.getElementById('edit-dpa')?.closest('div')?.querySelector('label');
    if (label) label.innerText = 'Dividendo Mensal (R$) por cota';
    document.getElementById('edit-dpa')?.setAttribute('placeholder', '0,10');
  });
  const form = document.getElementById('form-edit-asset');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const originalTicker = document.getElementById('edit-original-ticker')?.value.trim().toUpperCase();
    const ticker = document.getElementById('edit-ticker')?.value.trim().toUpperCase();
    const name = document.getElementById('edit-name')?.value.trim() || ticker;
    const type = document.getElementById('edit-type')?.value;
    const quantity = parseLocaleNumber(document.getElementById('edit-quantity')?.value, 0);
    const avgPrice = parseLocaleNumber(document.getElementById('edit-average-price')?.value, 0);
    const curPrice = parseLocaleNumber(document.getElementById('edit-current-price')?.value, 0);
    const dpa = parseLocaleNumber(document.getElementById('edit-dpa')?.value, 0);
    if (!ticker) { alert('Informe o ticker'); return; }
    const idx = portfolioState.assets.findIndex(a => a.ticker === originalTicker);
    if (idx < 0) { alert('Ativo não encontrado'); return; }
    if (ticker !== originalTicker && portfolioState.assets.some(a => a.ticker === ticker)) {
      alert('Já existe um ativo com o ticker ' + ticker);
      return;
    }
    const asset = portfolioState.assets[idx];
    const oldTicker = asset.ticker;
    asset.ticker = ticker;
    asset.name = name;
    asset.type = type;
    asset.quantity = quantity;
    asset.averagePrice = avgPrice;
    asset.currentPrice = curPrice;
    const estEdit = getDividendEstimates(dpa);
    asset.historicalAverageDPA = estEdit.annual;
    asset.monthlyDividendEstimate = estEdit.monthly;
    if (asset.deepDive) {
      asset.deepDive.ticker = ticker;
      asset.deepDive.companyName = name;
    }
    savePortfolioToStorage();
    renderAllViews();
    initRaioXSelector();
    closeEditAssetModal();
    // Sincroniza com nuvem: upsert novo + remove antigo se ticker mudou
    if (typeof syncPortfolioToCloud === 'function') {
      try { await syncPortfolioToCloud(portfolioState); } catch (err) { console.warn('Erro ao sincronizar edição:', err); }
    }
    if (ticker !== oldTicker && typeof deleteAssetsFromCloud === 'function') {
      try { await deleteAssetsFromCloud([oldTicker]); } catch (err) { console.warn('Erro ao remover ticker antigo da nuvem:', err); }
    }
    if (window.lucide) lucide.createIcons({ icons: lucide.icons });
  });
}

// Expor globalmente para onclick inline
if (typeof window !== 'undefined') {
  window.openEditAsset = openEditAsset;
  window.removeAssetFromPortfolio = removeAssetFromPortfolio;
  window.openRaioXForTicker = openRaioXForTicker;
}

// Hook para inicializar os modais de edição e exclusão junto ao bootstrap
const _prevBootstrapForEdit = bootstrapApp;
bootstrapApp = function(user) {
  _prevBootstrapForEdit(user);
  initFormEditAsset();
  initConfirmDeleteModal();
};

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
    'ACAO': 'bg-[rgba(0,81,63,0.08)] text-[#00513f] border-[rgba(0,81,63,0.15)]',
    'FII_TIJOLO': 'bg-[rgba(6,182,212,0.08)] text-[#0891b2] border-[rgba(6,182,212,0.15)]',
    'FII_PAPEL': 'bg-[rgba(245,158,11,0.08)] text-[#b45309] border-[rgba(245,158,11,0.15)]',
    'STOCK_USD': 'bg-[rgba(70,72,212,0.08)] text-[#4648d4] border-[rgba(70,72,212,0.15)]',
    'ETF': 'bg-[rgba(236,72,153,0.08)] text-[#be185d] border-[rgba(236,72,153,0.15)]',
    'RENDA_FIXA': 'bg-[rgba(245,158,11,0.10)] text-[#92400e] border-[rgba(245,158,11,0.20)]'
  };
  return map[type] || 'bg-[#eceef0] text-[#3e4945] border-[rgba(190,201,195,0.4)]';
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
// activeNotifFilter already declared at top

const NOTIF_READ_KEY = 'previdencia_invest_notifs_read';
let notifReadSet = new Set();

function loadNotifReadSet() {
  try {
    const raw = localStorage.getItem(NOTIF_READ_KEY);
    if (raw) notifReadSet = new Set(JSON.parse(raw));
  } catch (e) {
    notifReadSet = new Set();
  }
}

function saveNotifReadSet() {
  try {
    localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...notifReadSet]));
  } catch (e) {}
}

function markNotifRead(alertId) {
  if (!alertId || notifReadSet.has(alertId)) return;
  notifReadSet.add(alertId);
  saveNotifReadSet();
  if (typeof markNotificationRead === 'function') markNotificationRead(alertId);
}

function markAllNotifsRead(alerts) {
  let changed = false;
  (alerts || []).forEach(a => {
    if (a.id && !notifReadSet.has(a.id)) {
      notifReadSet.add(a.id);
      changed = true;
    }
  });
  if (changed) {
    saveNotifReadSet();
    if (typeof markNotificationRead === 'function') {
      (alerts || []).forEach(a => { if (a.id) markNotificationRead(a.id); });
    }
    updateNotifBadge(alerts || []);
    renderNotificationCenter();
  }
}

function updateNotifBadge(allAlerts) {
  const headerBadge = document.getElementById('badge-header-notif-count');
  if (!headerBadge) return;
  const unread = (allAlerts || []).filter(a => !notifReadSet.has(a.id)).length;
  headerBadge.innerText = unread;
  headerBadge.className = unread > 0
    ? 'absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-rose-500 text-white flex items-center justify-center'
    : 'hidden';
  headerBadge.dataset.count = String(unread);
}

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
    updateNotifBadge(allAlerts);
    if (headerBadge.dataset.count && headerBadge.dataset.count !== prevCount) {
      pulse(headerBadge);
    }
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
    const isUnread = !notifReadSet.has(alert.id);
    if (isUnread) card.classList.add('cursor-pointer', 'hover:shadow-2xl');
    const unreadDot = isUnread ? '<span class="notif-unread-dot w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0"></span>' : '';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-white border border-gray-200 text-gray-700">
            <i data-lucide="${iconName}" class="w-4 h-4"></i>
          </div>
          <div>
            <h4 class="font-bold text-gray-900 text-sm flex items-center gap-2">${unreadDot}${alert.title}</h4>
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

    card.addEventListener('click', () => {
      if (notifReadSet.has(alert.id)) return;
      markNotifRead(alert.id);
      updateNotifBadge(allAlerts);
      card.classList.remove('cursor-pointer', 'hover:shadow-2xl');
      card.classList.add('opacity-70', 'cursor-default');
      card.querySelectorAll('.notif-unread-dot').forEach(el => el.remove());
    });

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
        let user = null;
        if (typeof getSessionUser === 'function') {
          const maybe = getSessionUser();
          user = (maybe && typeof maybe.then === 'function') ? await maybe : maybe;
        }
        if (!user && typeof getLoggedUser === 'function') {
          try { user = await getLoggedUser(); } catch(e){}
        }
        if (user) populateProfileUser({ ...user, user_metadata: { ...(user.user_metadata||{}), full_name: name.value.trim() } });
        alert(`Perfil atualizado para ${name.value.trim()}.`);
        return;
      } catch (err) {
        alert('Erro ao salvar perfil: ' + ((err && err.message) || 'tente novamente.'));
        return;
      }
    }
    alert(`Perfil salvo para ${name.value.trim()}. Sincronização com o Supabase será ativada em breve.`);
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
  // Default: Hoje (1D) ao vivo para decidir aporte no pregão
  if (!perfState.period) perfState.period = '1D';
  perfState.tickers = [...new Set((portfolioState.assets || []).map(a => a.ticker))];

  document.getElementById('btn-perf-add-ticker')?.addEventListener('click', addPerfTicker);
  document.getElementById('perf-ticker-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addPerfTicker(); }
  });
  // Sincroniza classe ativa do período (HTML agora começa com Hoje ativo)
  document.querySelectorAll('.perf-period-btn').forEach(b => {
    const isActive = b.getAttribute('data-perf-period') === perfState.period;
    b.classList.toggle('perf-period-active', isActive);
    b.classList.toggle('bg-emerald-500/10', isActive);
    b.classList.toggle('text-emerald-400', isActive);
    b.classList.toggle('bg-gray-200', !isActive);
    b.classList.toggle('hover:bg-gray-300', !isActive);
    b.classList.toggle('text-gray-600', !isActive);
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

  document.getElementById('btn-perf-refresh')?.addEventListener('click', () => {
    renderPerformanceComparator(true);
  });

  if (window.lucide) lucide.createIcons({ icons: lucide.icons });
  renderPerfTickerChips();
}

async function renderPerformanceComparator(forceRefresh = false) {
  const tab = document.getElementById('tab-performance');
  if (!tab || tab.classList.contains('hidden')) return;

  const tableBody = document.getElementById('perf-table-body');
  const lastUpdateEl = document.getElementById('perf-last-update');
  const refreshBtn = document.getElementById('btn-perf-refresh');
  if (!tableBody) return;

  if (perfState.tickers.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Adicione tickers acima ou inclua ativos na carteira para começar a comparar. <br><span class="text-[11px] text-gray-400">Funciona com qualquer ativo do pregão — ex: PETR4, VALE3, HGLG11, KNRI11, AAPL.</span></td></tr>';
    return;
  }

  // Força atualização ao vivo: limpa cache do período atual
  if (forceRefresh) {
    try {
      const histCache = (typeof getHistoricalCache === 'function') ? getHistoricalCache() : {};
      let changed = false;
      perfState.tickers.forEach(t => {
        const k = `${t}:${perfState.period}`;
        if (histCache[k]) { delete histCache[k]; changed = true; }
      });
      if (changed && typeof saveHistoricalCache === 'function') saveHistoricalCache(histCache);
    } catch (e) {}
  }

  const periodLabel = perfState.period === '1D' ? 'pregão de hoje' : perfState.period;
  tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500"><span class="inline-block w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin align-middle mr-2"></span>Carregando ${periodLabel}...</td></tr>`;
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.classList.add('opacity-60'); }

  const settled = await Promise.allSettled(perfState.tickers.map(t => fetchHistoricalSeries(t, perfState.period)));

  const seriesByTicker = {};
  const errors = [];
  settled.forEach((res, i) => {
    const t = perfState.tickers[i];
    if (res.status === 'fulfilled' && res.value && res.value.points && res.value.points.length > 0) {
      seriesByTicker[t] = res.value;
    } else {
      const msg = res.status === 'rejected' ? (res.reason && res.reason.message) : 'sem dados';
      errors.push(`${t}: ${msg}`);
    }
  });

  if (Object.keys(seriesByTicker).length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-rose-500">Nenhum dado retornado. Verifique os tickers ou tente novamente.<br><span class="text-[11px] text-gray-400">${errors.slice(0,3).join(' · ')}</span><br><button onclick="renderPerformanceComparator(true)" class="mt-2 px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold">Tentar novamente</button></td></tr>`;
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.classList.remove('opacity-60'); }
    return;
  }

  // Mensagem de atualização
  if (errors.length > 0 && lastUpdateEl) {
    lastUpdateEl.innerHTML = `Atualizado agora · <span class="text-amber-600">${errors.length} ticker(s) sem dados</span>`;
  } else if (lastUpdateEl) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    lastUpdateEl.innerText = `Atualizado às ${hh}:${mm}`;
  }

  renderPerfLineChart(seriesByTicker);
  renderPerfBarChart(seriesByTicker);
  renderPerfTable(seriesByTicker);

  if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.classList.remove('opacity-60'); }
  if (window.lucide) lucide.createIcons({ icons: lucide.icons });

  // Se for 1D e mercado aberto, auto-refresh leve pode ser útil — não força, usuário clica em Ao vivo
}

function formatPerfLabel(isoDate) {
  const d = new Date(isoDate);
  if (perfState.period === '1D') {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  // Para períodos maiores, mostra dia/mês
  if (perfState.period === '1M' || perfState.period === '3M') {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function renderPerfLineChart(seriesByTicker) {
  const ctx = document.getElementById('chart-perf-line');
  if (!ctx || typeof Chart === 'undefined') return;

  const allDates = new Set();
  Object.values(seriesByTicker).forEach(s => (s.points || []).forEach(p => allDates.add(p.date)));
  const sortedDates = Array.from(allDates).sort((a,b) => new Date(a) - new Date(b));
  const labels = sortedDates.map(d => formatPerfLabel(d));
  // Mapa de iso -> índice para alinhar séries com buracos (feriados/pregão)
  const dateIndex = new Map(sortedDates.map((d,i) => [d, i]));

  const datasets = [];
  let ci = 0;
  Object.entries(seriesByTicker).forEach(([ticker, s]) => {
    if (!s.points || s.points.length < 2) return;
    const first = s.points[0].close;
    if (!first) return;
    // Base 100 para comparar quem rendeu mais (ideal para decidir aporte)
    const map = new Map(s.points.map(p => [p.date, (p.close / first) * 100]));
    let last = null;
    const data = sortedDates.map(d => {
      if (map.has(d)) last = map.get(d);
      return last;
    });
    const color = PERF_COLORS[ci % PERF_COLORS.length];
    datasets.push({
      label: ticker,
      data,
      borderColor: color,
      backgroundColor: color + '22',
      fill: false,
      tension: perfState.period === '1D' ? 0.15 : 0.3,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      pointHitRadius: 12,
      pointStyle: 'circle'
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
      animation: REDUCED_MOTION ? false : { duration: 900, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      hover: { mode: 'index', intersect: false },
      elements: {
        point: { hoverRadius: 6 },
        line: { capBezierPoints: false }
      },
      plugins: {
        legend: { labels: { color: '#6b7280', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(255,255,255,0.96)',
          titleColor: '#111827',
          bodyColor: '#374151',
          borderColor: 'rgba(229,231,235,1)',
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} (base 100)`,
            title: (items) => {
              if (!items || !items[0]) return '';
              const idx = items[0].dataIndex;
              const iso = sortedDates[idx];
              if (!iso) return items[0].label;
              const d = new Date(iso);
              return perfState.period === '1D'
                ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('pt-BR');
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#6b7280', maxTicksLimit: perfState.period === '1D' ? 8 : 6 }, grid: { color: 'rgba(156,163,175,0.25)' } },
        y: { ticks: { color: '#6b7280', callback: v => v.toFixed(0) }, grid: { color: 'rgba(156,163,175,0.25)' } }
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
  const num = (id) => parseLocaleNumber(document.getElementById(id)?.value, 0);
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
