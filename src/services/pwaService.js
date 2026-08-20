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
    offlineBadge: () => document.getElementById('pwa-offline-badge'),
    updateToast: () => document.getElementById('pwa-update-toast'),
    updateReload: () => document.getElementById('pwa-update-reload')
  };

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

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showEl(els.installBtn(), true);
    });

    const btn = els.installBtn();
    if (btn) {
      btn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            deferredPrompt = null;
            showEl(btn, false);
          }
        } else if (IS_IOS) {
          alert('Para instalar: no Safari, toque em "Compartilhar" e depois em "Adicionar à Tela de Início".');
        } else {
          alert('Para instalar: abra o app pelo navegador e use a opção "Instalar aplicativo" no menu do navegador.');
        }
      });
    }
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
    setupConnectivityBadge();
  });
})();