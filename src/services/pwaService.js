/**
 * Serviço PWA: registro do Service Worker, botão de instalação (Android/Desktop + iOS),
 * detecção de nova versão publicada e badge de conectividade (online/offline).
 */
(() => {
  const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredPrompt = null;
  const SW_PATH = '/sw.js';

  const els = {
    installBtn: () => document.getElementById('btn-install-app'),
    installPopup: () => document.getElementById('pwa-install-popup'),
    installPopupBtn: () => document.getElementById('btn-install-popup'),
    installPopupLater: () => document.getElementById('btn-install-popup-later'),
    installPopupClose: () => document.getElementById('btn-install-popup-close'),
    installPopupBackdrop: () => document.getElementById('pwa-install-popup-backdrop'),
    offlineBadge: () => document.getElementById('pwa-offline-badge'),
    updateToast: () => document.getElementById('pwa-update-toast'),
    updateReload: () => document.getElementById('pwa-update-reload')
  };

  const POPUP_DISMISSED_KEY = 'pwa_install_popup_dismissed';
  const POPUP_DELAY_MS = 900;

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(SW_PATH).then((reg) => {
      reg.update();
      watchForUpdate(reg);
    }).catch((err) => {
      console.warn('Erro ao registrar Service Worker:', err);
    });
  }

  function watchForUpdate(reg) {
    if (!reg || !reg.waiting) return;

    const showToast = () => {
      const t = els.updateToast();
      if (t) t.classList.remove('hidden');
      const btn = els.updateReload();
      if (btn) {
        btn.onclick = () => {
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        };
      }
    };

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (newWorker.state === 'activated') {
            window.location.reload();
          } else {
            showToast();
          }
        }
      });
    });
  }

  function showEl(el, show) {
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.classList.toggle('flex', show);
  }

  function isPopupDismissed() {
    try { return localStorage.getItem(POPUP_DISMISSED_KEY) === '1'; } catch(e){ return false; }
  }
  function markPopupDismissed() {
    try { localStorage.setItem(POPUP_DISMISSED_KEY, '1'); } catch(e){}
  }
  function isLoginGateVisible() {
    const gate = document.getElementById('login-gate');
    return gate && !gate.classList.contains('hidden');
  }
  function showInstallPopup() {
    if (isPopupDismissed()) return;
    if (!isLoginGateVisible()) return;
    const pop = els.installPopup();
    if (!pop) return;
    // não mostrar se já está instalado (standalone)
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone) return;
    pop.classList.remove('hidden');
    if (window.lucide) lucide.createIcons({ icons: lucide.icons });
  }
  function hideInstallPopup() {
    const pop = els.installPopup();
    if (pop) pop.classList.add('hidden');
    markPopupDismissed();
  }
  function setupInstallPopup() {
    const closeBtn = els.installPopupClose();
    const laterBtn = els.installPopupLater();
    const backdrop = els.installPopupBackdrop();
    if (closeBtn) closeBtn.addEventListener('click', hideInstallPopup);
    if (laterBtn) laterBtn.addEventListener('click', hideInstallPopup);
    if (backdrop) backdrop.addEventListener('click', hideInstallPopup);
    // ESC fecha
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const pop = els.installPopup();
        if (pop && !pop.classList.contains('hidden')) hideInstallPopup();
      }
    });
  }

  async function triggerInstall(btn) {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredPrompt = null;
        showEl(els.installBtn(), false);
        hideInstallPopup();
        try { localStorage.setItem('pwa_installed','1'); } catch(e){}
      }
    } else if (IS_IOS) {
      alert('Para instalar: no Safari, toque em "Compartilhar" e depois em "Adicionar à Tela de Início".');
    } else {
      alert('Para instalar: abra o app pelo navegador e use a opção "Instalar aplicativo" no menu do navegador.');
    }
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showEl(els.installBtn(), true);
      // mostra popup no início do cadastro, uma vez
      setTimeout(showInstallPopup, POPUP_DELAY_MS);
    });

    // Fallback: se não houver beforeinstallprompt (ex: desktop já instalado ou iOS), mostra popup uma vez no login
    setTimeout(() => {
      if (!deferredPrompt && !isPopupDismissed() && isLoginGateVisible()) {
        // em iOS ou navegadores sem prompt, ainda vale mostrar o popup educativo
        showInstallPopup();
      }
      // rodapé sempre visível após popup (garante que fica no rodapé)
      const footerBtn = els.installBtn();
      if (footerBtn && isPopupDismissed()) {
        // se usuário já dispensou popup, garante rodapé visível
        footerBtn.classList.remove('hidden');
        footerBtn.classList.add('flex');
      }
    }, 1400);

    const btn = els.installBtn();
    if (btn) {
      // inicia oculto e será exibido no beforeinstallprompt ou após popup
      btn.addEventListener('click', async () => triggerInstall(btn));
    }
    const popupBtn = els.installPopupBtn();
    if (popupBtn) {
      popupBtn.addEventListener('click', async () => triggerInstall(popupBtn));
    }

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      showEl(els.installBtn(), false);
      hideInstallPopup();
      try { localStorage.setItem('pwa_installed','1'); } catch(e){}
    });
  }

  function setupConnectivityBadge() {
    const updateBadge = () => {
      if (!navigator.onLine) {
        showEl(els.offlineBadge(), true);
      } else {
        showEl(els.offlineBadge(), false);
      }
    };
    window.addEventListener('online', updateBadge);
    window.addEventListener('offline', updateBadge);
    updateBadge();
  }

  document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    setupInstallPrompt();
    setupInstallPopup();
    setupConnectivityBadge();
  });
})();