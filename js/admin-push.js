/**
 * إعدادات Web Push في لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  var pushApi = window.RonaqPushSubscribe;
  if (!store || !pushApi) return;

  var pushEnabled = document.getElementById('pushEnabled');
  var vapidPublicKeyInput = document.getElementById('vapidPublicKeyInput');
  var savePushBtn = document.getElementById('savePushSettingsBtn');
  var subscribePushBtn = document.getElementById('subscribePushBtn');
  var exportPushBtn = document.getElementById('exportPushSubsBtn');
  var pushStatus = document.getElementById('pushStatus');

  function toast(msg, type) {
    if (window.RonaqAdminToast) window.RonaqAdminToast(msg, type);
  }

  function loadPushSettings() {
    var cfg = store.loadConfig();
    var push = cfg.push || {};
    if (pushEnabled) pushEnabled.checked = !!push.enabled;
    if (vapidPublicKeyInput) vapidPublicKeyInput.value = push.vapidPublicKey || '';
    updatePushStatus(cfg);
  }

  function updatePushStatus(cfg) {
    if (!pushStatus) return;
    cfg = cfg || store.loadConfig();
    var subs = pushApi.getSubscriptions().length;
    if (!pushApi.isConfigured(cfg)) {
      pushStatus.textContent = 'فعّل Push وأدخل VAPID Public Key — أنشئ المفاتيح: npx web-push generate-vapid-keys';
      return;
    }
    pushStatus.textContent = subs
      ? subs + ' اشتراك محفوظ محلياً — صدّر الملف للسيرفر'
      : 'Push مفعّل — اضغط «اشتراك هذا الجهاز»';
  }

  function savePushSettings() {
    var cfg = store.loadConfig();
    cfg.push = {
      enabled: pushEnabled ? pushEnabled.checked : false,
      vapidPublicKey: vapidPublicKeyInput ? vapidPublicKeyInput.value.trim() : '',
    };
    store.saveConfig(cfg);
    updatePushStatus(cfg);
    toast('تم حفظ إعدادات Push');
  }

  function bindEvents() {
    if (savePushBtn) savePushBtn.addEventListener('click', savePushSettings);
    if (subscribePushBtn) {
      subscribePushBtn.addEventListener('click', function () {
        var cfg = store.loadConfig();
        pushApi.subscribePush(cfg).then(function () {
          updatePushStatus(cfg);
          toast('تم الاشتراك في Push على هذا الجهاز');
        }).catch(function (err) {
          var msg = err && err.message;
          if (msg === 'push-not-configured') toast('فعّل Push وأدخل VAPID Public Key أولاً', 'error');
          else if (msg === 'permission-denied') toast('تم رفض الإشعارات', 'error');
          else if (msg === 'push-unsupported') toast('المتصفح لا يدعم Push', 'error');
          else toast('فشل الاشتراك في Push', 'error');
        });
      });
    }
    if (exportPushBtn) {
      exportPushBtn.addEventListener('click', function () {
        if (!pushApi.getSubscriptions().length) {
          toast('لا توجد اشتراكات — اشترك من هذا الجهاز أولاً', 'error');
          return;
        }
        pushApi.exportSubscriptionsFile();
        toast('تم تنزيل push-subscriptions.json');
      });
    }
  }

  store.init().then(function () {
    loadPushSettings();
    bindEvents();
  });
})();
