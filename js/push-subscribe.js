/**
 * Web Push — اشتراك العميل/المالك + تصدير للسيرفر
 */
(function () {
  'use strict';

  var SUBS_KEY = 'ronaq_push_subscriptions';

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function getPushConfig(config) {
    var push = (config && config.push) || {};
    return {
      enabled: push.enabled === true,
      vapidPublicKey: (push.vapidPublicKey || '').trim(),
    };
  }

  function getSubscriptions() {
    try {
      var list = JSON.parse(localStorage.getItem(SUBS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveSubscription(subscription, meta) {
    var list = getSubscriptions();
    var json = subscription.toJSON ? subscription.toJSON() : subscription;
    var key = json.endpoint || '';
    var filtered = list.filter(function (s) { return s.endpoint !== key; });
    filtered.push({
      endpoint: json.endpoint,
      keys: json.keys,
      updatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 120),
      label: (meta && meta.label) || 'عميل',
    });
    localStorage.setItem(SUBS_KEY, JSON.stringify(filtered));
    return filtered;
  }

  function subscribePush(config) {
    var cfg = getPushConfig(config);
    if (!cfg.enabled || !cfg.vapidPublicKey) {
      return Promise.reject(new Error('push-not-configured'));
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return Promise.reject(new Error('push-unsupported'));
    }

    return requestNotificationPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('permission-denied');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing) return existing;
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
        });
      });
    }).then(function (sub) {
      saveSubscription(sub, { label: 'admin' });
      return sub;
    });
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
  }

  function exportSubscriptionsFile() {
    var blob = new Blob([JSON.stringify({ subscriptions: getSubscriptions() }, null, 2)], {
      type: 'application/json',
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'push-subscriptions.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function isConfigured(config) {
    var cfg = getPushConfig(config);
    return cfg.enabled && !!cfg.vapidPublicKey;
  }

  window.RonaqPushSubscribe = {
    SUBS_KEY: SUBS_KEY,
    getPushConfig: getPushConfig,
    getSubscriptions: getSubscriptions,
    subscribePush: subscribePush,
    exportSubscriptionsFile: exportSubscriptionsFile,
    isConfigured: isConfigured,
    requestNotificationPermission: requestNotificationPermission,
  };
})();
