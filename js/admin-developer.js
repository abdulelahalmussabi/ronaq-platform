/**
 * الفوترة وتكامل المطورين (Public API & SaaS Billing) — لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  if (!store) return;

  var apiKeysList = document.getElementById('apiKeysList');
  var generateApiKeyBtn = document.getElementById('generateApiKeyBtn');
  var saasInvoicesList = document.getElementById('saasInvoicesList');
  var renewSubMoyasarBtn = document.getElementById('renewSubMoyasarBtn');
  var renewSubManualBtn = document.getElementById('renewSubManualBtn');
  var cancelSaasPaymentBtn = document.getElementById('cancelSaasPaymentBtn');
  var saasPaymentBlock = document.getElementById('saasPaymentBlock');

  var _apiKeys = [];
  var _invoices = [];

  function toast(msg, type) {
    if (window.RonaqAdminToast) window.RonaqAdminToast(msg, type);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('ar-SA');
    } catch (e) {
      return isoString;
    }
  }

  // --- API Key Management ---
  function generateRandomApiKey() {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var rand = '';
    for (var i = 0; i < 32; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'mken_live_' + rand;
  }

  function loadApiKeys() {
    if (apiKeysList) apiKeysList.innerHTML = '<p class="admin-hint">جاري تحميل المفاتيح...</p>';

    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      window.RonaqSupabaseDb.fetchApiKeys(tenantSlug)
        .then(function (keys) {
          _apiKeys = keys;
          renderApiKeys();
        })
        .catch(function (err) {
          console.warn('Failed to load api keys from Supabase', err);
          loadLocalApiKeys();
        });
    } else {
      loadLocalApiKeys();
    }
  }

  function loadLocalApiKeys() {
    try {
      var raw = localStorage.getItem('ronaq_mken_apikeys');
      _apiKeys = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _apiKeys = [];
    }
    renderApiKeys();
  }

  function renderApiKeys() {
    if (!apiKeysList) return;
    if (!_apiKeys.length) {
      apiKeysList.innerHTML = '<p class="admin-hint" style="padding:10px 0;">لا توجد مفاتيح نشطة. قم بتوليد مفتاح للربط.</p>';
      return;
    }

    var html = _apiKeys.map(function (k) {
      var masked = k.apiKey.slice(0, 14) + '...' + k.apiKey.slice(-6);
      return (
        '<div style="display:flex; justify-content:space-between; align-items:center; background:#faf8f5; border:1px solid var(--color-border); padding:10px 12px; border-radius:4px; margin-bottom:8px;">' +
        '  <div>' +
        '    <strong>' + esc(k.keyName) + '</strong><br>' +
        '    <code style="font-size:0.82rem; color:var(--color-primary); font-family:monospace; font-weight:bold;">' + esc(masked) + '</code>' +
        '    <button type="button" class="btn btn--outline btn--sm" data-copy-key="' + esc(k.apiKey) + '" style="padding:1px 6px; font-size:0.75rem; margin-right:8px;">نسخ</button>' +
        '  </div>' +
        '  <button type="button" class="btn btn--outline btn--sm" data-revoke-key="' + k.id + '" style="color:#c0392b; border-color:#c0392b15; padding:4px 8px;">إلغاء المفتاح</button>' +
        '</div>'
      );
    }).join('');

    apiKeysList.innerHTML = html;

    // Copy actions
    apiKeysList.querySelectorAll('[data-copy-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-copy-key');
        navigator.clipboard.writeText(key).then(function () {
          btn.textContent = 'تم النسخ';
          setTimeout(function () { btn.textContent = 'نسخ'; }, 1500);
        });
      });
    });

    // Revoke actions
    apiKeysList.querySelectorAll('[data-revoke-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-revoke-key');
        if (confirm('هل أنت متأكد من إلغاء/حذف مفتاح الـ API هذا؟ لن تتمكن التطبيقات الخارجية المتصلة به من الوصول للمنصة.')) {
          revokeApiKey(id);
        }
      });
    });
  }

  function generateApiKey() {
    var name = prompt('أدخل اسماً توضيحياً للمفتاح الجديد (مثال: نظام الكاشير أو موقع الووردبريس):');
    if (!name) return;
    name = name.trim();

    var keyVal = generateRandomApiKey();
    var keyObj = {
      id: 'key_' + Date.now().toString(36),
      keyName: name,
      apiKey: keyVal,
      tenantSlug: store.getCurrentTenantSlug() || 'default',
      createdAt: new Date().toISOString()
    };

    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      window.RonaqSupabaseDb.saveApiKey(keyObj, tenantSlug)
        .then(function () {
          toast('تم توليد مفتاح الـ API بنجاح سحابياً');
          loadApiKeys();
        })
        .catch(function (err) {
          toast('فشل حفظ مفتاح الـ API سحابياً: ' + err.message, 'error');
        });
    } else {
      _apiKeys.push(keyObj);
      localStorage.setItem('ronaq_mken_apikeys', JSON.stringify(_apiKeys));
      toast('تم التوليد والحفظ محلياً بنجاح');
      renderApiKeys();
    }
  }

  function revokeApiKey(id) {
    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      window.RonaqSupabaseDb.deleteApiKey(id)
        .then(function () {
          toast('تم إلغاء مفتاح الـ API بنجاح');
          loadApiKeys();
        })
        .catch(function (err) {
          toast('فشل إلغاء المفتاح سحابياً: ' + err.message, 'error');
        });
    } else {
      _apiKeys = _apiKeys.filter(function (k) { return k.id !== id; });
      localStorage.setItem('ronaq_mken_apikeys', JSON.stringify(_apiKeys));
      toast('تم الإلغاء محلياً');
      renderApiKeys();
    }
  }

  // --- SaaS Invoices & Billing ---
  function loadInvoices() {
    if (saasInvoicesList) {
      saasInvoicesList.innerHTML = '<tr><td colspan="5" class="admin-hint" style="text-align:center; padding:15px;">جاري تحميل سجل الفواتير...</td></tr>';
    }

    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      window.RonaqSupabaseDb.fetchInvoices(tenantSlug)
        .then(function (invoices) {
          _invoices = invoices;
          localStorage.setItem('ronaq_mken_invoices', JSON.stringify(invoices));
          renderInvoices();
        })
        .catch(function (err) {
          console.warn('Failed to load invoices from Supabase', err);
          loadLocalInvoices();
        });
    } else {
      loadLocalInvoices();
    }
  }

  function loadLocalInvoices() {
    try {
      var raw = localStorage.getItem('ronaq_mken_invoices');
      _invoices = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _invoices = [];
    }
    renderInvoices();
  }

  function renderInvoices() {
    if (!saasInvoicesList) return;
    if (!_invoices.length) {
      saasInvoicesList.innerHTML = '<tr><td colspan="5" class="admin-hint" style="text-align:center; padding:15px;">لا توجد فواتير سابقة.</td></tr>';
      return;
    }

    var html = _invoices.map(function (inv) {
      var statusColor = '#777';
      var statusText = 'غير مدفوعة';
      if (inv.status === 'paid') { statusColor = '#2e7d32'; statusText = 'مدفوعة'; }
      else if (inv.status === 'failed') { statusColor = '#c0392b'; statusText = 'فشلت'; }

      var pMethod = inv.paymentMethod ? ' (' + inv.paymentMethod + ')' : '';

      return (
        '<tr style="border-bottom:1px solid var(--color-border);">' +
        '  <td style="padding:10px; font-family:monospace; font-weight:bold;">' + esc(inv.paymentId || inv.id) + pMethod + '</td>' +
        '  <td style="padding:10px; font-weight:bold;">' + inv.amount + ' ريال</td>' +
        '  <td style="padding:10px;">' + inv.months + ' أشهر</td>' +
        '  <td style="padding:10px;"><span style="color:' + statusColor + '; font-weight:bold;">' + statusText + '</span></td>' +
        '  <td style="padding:10px; direction:ltr;">' + formatDate(inv.createdAt) + '</td>' +
        '</tr>'
      );
    }).join('');

    saasInvoicesList.innerHTML = html;
  }

  function getSaaSPrice(months) {
    if (months === 1) return 99;
    if (months === 3) return 249;
    if (months === 6) return 449;
    return 799; // 12 months default
  }

  // --- SaaS Online Payment via Moyasar ---
  function initSaaSPayment() {
    var select = document.getElementById('renewMonthsSelect');
    var months = select ? parseInt(select.value, 10) : 12;
    var tenantSlug = store.getCurrentTenantSlug();

    if (!tenantSlug) {
      toast('يرجى تسجيل الدخول كمستأجر سحابي أولاً للتجديد.', 'error');
      return;
    }

    var amount = getSaaSPrice(months);

    // Retrieve master publishable key from default tenant config if possible
    var masterPublishableKey = '';
    try {
      // Moyasar key is loaded from RonaqServicesStore configurations
      var raw = localStorage.getItem('ronaq_platform_config');
      if (raw) {
        var parsed = JSON.parse(raw);
        // Fallback to local storage config or use the public publishable key configured in database
        masterPublishableKey = (parsed.payment && parsed.payment.publishableKey) || '';
      }
    } catch (e) { /* ignore */ }

    if (!masterPublishableKey && window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      // Fetch default config dynamically
      window.RonaqSupabaseDb.fetchConfig('default')
        .then(function (defConfig) {
          var pKey = defConfig && defConfig.payment && defConfig.payment.publishableKey;
          if (pKey) {
            setupMoyasarSaaS(pKey, amount, months, tenantSlug);
          } else {
            // If master key is not defined, offer dummy success for test
            toast('مفتاح الدفع غير مهيأ للموقع الرئيسي. سيتم الدفع التجريبي والتجديد المباشر.', 'warning');
            processManualRenewal(months);
          }
        })
        .catch(function () {
          processManualRenewal(months);
        });
    } else if (masterPublishableKey) {
      setupMoyasarSaaS(masterPublishableKey, amount, months, tenantSlug);
    } else {
      processManualRenewal(months);
    }
  }

  function setupMoyasarSaaS(publishableKey, amount, months, tenantSlug) {
    if (!window.Moyasar) {
      toast('بوابة الدفع Moyasar غير محملة حالياً.', 'error');
      return;
    }

    if (saasPaymentBlock) saasPaymentBlock.hidden = false;

    var amtLabel = document.getElementById('saasPaymentAmountLabel');
    if (amtLabel) {
      amtLabel.textContent = 'إجمالي تكلفة تجديد الاشتراك المستحقة: ' + amount + ' SAR';
    }

    var callbackUrl = window.location.origin + window.location.pathname + 
                      '?saas_callback=1&tenant=' + encodeURIComponent(tenantSlug) + 
                      '&months=' + months;

    var formContainer = document.getElementById('saasMoyasarForm');
    if (formContainer) formContainer.innerHTML = '';

    window.Moyasar.init({
      element: '#saasMoyasarForm',
      amount: Math.round(amount * 100),
      currency: 'SAR',
      description: 'تجديد اشتراك منصة مكِّن: ' + tenantSlug + ' - ' + months + ' شهر',
      publishable_api_key: publishableKey,
      callback_url: callbackUrl,
      methods: ['creditcard', 'mada', 'applepay'],
      metadata: {
        type: 'saas_billing',
        tenant_slug: tenantSlug,
        months: months
      },
      on_completed: function (payment) {
        // Fallback local verify if redirection doesn't trigger
        handleSaaSPaymentSuccess(tenantSlug, months, payment);
      }
    });
  }

  function handleSaaSPaymentSuccess(tenantSlug, months, payment) {
    var invId = 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var invoice = {
      id: invId,
      tenantSlug: tenantSlug,
      amount: payment.amount ? (payment.amount / 100) : getSaaSPrice(months),
      months: months,
      status: 'paid',
      paymentId: payment.id,
      paymentMethod: payment.source ? (payment.source.company || payment.source.type) : 'online',
      createdAt: new Date().toISOString()
    };

    // Save invoice
    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      window.RonaqSupabaseDb.saveInvoice(invoice, tenantSlug)
        .then(function () {
          // Renew subscription in Database
          return store.renewSubscription(tenantSlug, months);
        })
        .then(function () {
          toast('تم سداد الفاتورة وتمديد اشتراكك بنجاح! 🎉');
          if (saasPaymentBlock) saasPaymentBlock.hidden = true;
          loadInvoices();
          // Reload page without query params
          setTimeout(function () {
            window.location.href = window.location.pathname;
          }, 2000);
        })
        .catch(function (err) {
          toast('فشل تحديث الاشتراك السحابي: ' + err.message, 'error');
        });
    } else {
      // Local fallback
      _invoices.unshift(invoice);
      localStorage.setItem('ronaq_mken_invoices', JSON.stringify(_invoices));
      store.renewSubscription(tenantSlug, months)
        .then(function () {
          toast('تم الدفع والتجديد محلياً بنجاح!');
          if (saasPaymentBlock) saasPaymentBlock.hidden = true;
          renderInvoices();
        });
    }
  }

  function processManualRenewal(months) {
    var tenantSlug = store.getCurrentTenantSlug();
    if (!tenantSlug) {
      toast('يرجى تسجيل الدخول كمستأجر أولاً للتجديد.', 'error');
      return;
    }

    var renewBtn = document.getElementById('renewSubManualBtn');
    if (renewBtn) {
      renewBtn.disabled = true;
      renewBtn.textContent = 'جاري التجديد...';
    }

    store.renewSubscription(tenantSlug, months)
      .then(function () {
        if (renewBtn) {
          renewBtn.disabled = false;
          renewBtn.textContent = '🔄 تجديد يدوي (للتجربة)';
        }

        // Log manual invoice
        var invId = 'inv_man_' + Date.now().toString(36);
        var invoice = {
          id: invId,
          tenantSlug: tenantSlug,
          amount: 0,
          months: months,
          status: 'paid',
          paymentId: invId,
          paymentMethod: 'manual_free',
          createdAt: new Date().toISOString()
        };

        if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
          window.RonaqSupabaseDb.saveInvoice(invoice, tenantSlug).then(loadInvoices);
        } else {
          _invoices.unshift(invoice);
          localStorage.setItem('ronaq_mken_invoices', JSON.stringify(_invoices));
          renderInvoices();
        }

        toast('تم تجديد الاشتراك يدوياً وبالمجان بنجاح! 🎉');
        // Trigger render panel to reload subscription status label
        if (window.RonaqAdminPanelReload) window.RonaqAdminPanelReload();
      })
      .catch(function (err) {
        if (renewBtn) {
          renewBtn.disabled = false;
          renewBtn.textContent = '🔄 تجديد يدوي (للتجربة)';
        }
        toast('فشل التجديد اليدوي: ' + err.message, 'error');
      });
  }

  function checkSaaSCallback() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('saas_callback') === '1') {
      var tenantSlug = params.get('tenant');
      var months = parseInt(params.get('months'), 10) || 12;
      var status = params.get('status');
      var paymentId = params.get('id');

      if (status === 'paid' && tenantSlug && paymentId) {
        var payment = {
          id: paymentId,
          amount: params.get('amount') ? parseInt(params.get('amount'), 10) : (getSaaSPrice(months) * 100),
          source: {
            type: 'card',
            company: params.get('message') && params.get('message').indexOf('Mada') !== -1 ? 'mada' : 'creditcard'
          }
        };
        handleSaaSPaymentSuccess(tenantSlug, months, payment);
      } else if (status === 'failed') {
        alert('فشل سداد قيمة تجديد الاشتراك. يرجى مراجعة البطاقة والمحاولة مرة أخرى.');
        window.location.href = window.location.pathname;
      }
    }
  }

  function refresh() {
    loadApiKeys();
    loadInvoices();
    checkSaaSCallback();
  }

  function bindEvents() {
    if (generateApiKeyBtn) {
      generateApiKeyBtn.addEventListener('click', generateApiKey);
    }
    if (renewSubMoyasarBtn) {
      renewSubMoyasarBtn.addEventListener('click', initSaaSPayment);
    }
    if (renewSubManualBtn) {
      renewSubManualBtn.addEventListener('click', function () {
        var select = document.getElementById('renewMonthsSelect');
        var months = select ? parseInt(select.value, 10) : 12;
        processManualRenewal(months);
      });
    }
    if (cancelSaasPaymentBtn) {
      cancelSaasPaymentBtn.addEventListener('click', function () {
        if (saasPaymentBlock) saasPaymentBlock.hidden = true;
      });
    }
  }

  window.RonaqAdminDeveloper = {
    refresh: refresh
  };

  bindEvents();
})();
