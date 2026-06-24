/**
 * Service Worker — تخزين مؤقت للملفات الثابتة + دعم الإشعارات المحلية
 */
'use strict';

var CACHE_NAME = 'mken-platform-v9';
var SHELL = [
  './',
  './index.html',
  './book.html',
  './order.html',
  './admin.html',
  './coaching.html',
  './football-coaching.html',
  './staff.html',
  './manifest.webmanifest',
  './css/themes.css',
  './css/style.css',
  './css/platform.css',
  './css/booking.css',
  './css/order.css',
  './css/admin.css',
  './css/coaching.css',
  './css/football-coaching.css',
  './css/staff.css',
  './js/theme-early.js',
  './js/pwa.js',
  './js/activities-catalog.js',
  './js/services-catalog.js',
  './js/content-templates/hockey.js',
  './js/content-templates/bodybuilding.js',
  './js/content-templates/football.js',
  './js/services-store.js',
  './js/coaching.js',
  './js/football-coaching.js',
  './js/supabase-db.js',
  './js/booking-store.js',
  './js/team-workout-bridge.js',
  './js/whatsapp-automation.js',
  './js/staff.js',
  './assets/logo.svg',
];

function isVolatileAsset(url) {
  return /\.html(\?|$)/.test(url) ||
    /\/js\/(activities-catalog|services-catalog|services-store|ui-profiles\/registry|content-templates\/hockey)\.js/.test(url);
}

function cacheResponse(request, response) {
  if (!response || !response.ok) return;
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(request, response);
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL).catch(function () { /* offline partial ok */ });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) {
          return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (url.indexOf('data/') !== -1 && url.indexOf('.json') !== -1) {
    event.respondWith(
      fetch(event.request)
        .then(function (res) { return res; })
        .catch(function () { return caches.match(event.request); })
    );
    return;
  }
  if (isVolatileAsset(url)) {
    event.respondWith(
      fetch(event.request).then(function (res) {
        cacheResponse(event.request, res.clone());
        return res;
      }).catch(function () {
        return caches.match(event.request).then(function (cached) {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).then(function (res) {
        return res;
      }).catch(function () {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

self.addEventListener('push', function (event) {
  var data = { title: 'مكِّن', body: 'إشعار جديد', url: './index.html' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'مكِّن', {
      body: data.body || '',
      icon: './assets/logo.svg',
      badge: './assets/logo.svg',
      tag: 'mken-push',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || './index.html' },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      if (list.length) return list[0].focus();
      return self.clients.openWindow(url);
    })
  );
});
