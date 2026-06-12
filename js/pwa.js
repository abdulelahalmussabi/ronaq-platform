/**
 * PWA — تسجيل Service Worker + زر التثبيت + طلب إذن الإشعارات
 */
(function () {
  'use strict';

  var deferredPrompt = null;
  var banner = null;

  function createBanner() {
    if (banner || document.getElementById('pwaInstallBanner')) return;
    banner = document.createElement('div');
    banner.id = 'pwaInstallBanner';
    banner.className = 'pwa-banner';
    banner.hidden = true;
    banner.innerHTML =
      '<p><strong>ثبّت التطبيق</strong> — وصول أسرع وإشعارات التذكير</p>' +
      '<div class="pwa-banner__actions">' +
      '<button type="button" class="btn btn--primary btn--sm" id="pwaInstallBtn">تثبيت</button>' +
      '<button type="button" class="btn btn--outline btn--sm" id="pwaDismissBtn">لاحقاً</button>' +
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('pwaInstallBtn').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        banner.hidden = true;
      });
    });
    document.getElementById('pwaDismissBtn').addEventListener('click', function () {
      banner.hidden = true;
      try { sessionStorage.setItem('pwa_banner_dismissed', '1'); } catch (e) { /* ignore */ }
    });
  }

  function maybeShowBanner() {
    if (!deferredPrompt) return;
    try {
      if (sessionStorage.getItem('pwa_banner_dismissed')) return;
    } catch (e) { /* ignore */ }
    createBanner();
    if (banner) banner.hidden = false;
  }

  function registerSw() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    });
  }

  function bindInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      maybeShowBanner();
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      if (banner) banner.hidden = true;
    });
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
  }

  registerSw();
  bindInstallPrompt();

  window.RonaqPwa = {
    requestNotificationPermission: requestNotificationPermission,
    showLocalNotification: function (title, body, tag) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      try {
        var n = new Notification(title, {
          body: body,
          icon: 'assets/logo.svg',
          tag: tag || 'ronaq-local',
          dir: 'rtl',
          lang: 'ar',
        });
        n.onclick = function () {
          window.focus();
          n.close();
        };
        return true;
      } catch (e) {
        return false;
      }
    },
  };
})();
