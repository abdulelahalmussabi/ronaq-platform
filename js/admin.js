/**
 * لوحة إدارة المنصة — كل المحتوى قابل للتعديل
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  var contentAdmin = window.RonaqAdminContent;
  var socialCatalog = (window.RonaqSocialCatalog && window.RonaqSocialCatalog.PLATFORMS) || [];

  var loginView = document.getElementById('loginView');
  var adminView = document.getElementById('adminView');
  var loginForm = document.getElementById('loginForm');
  var pinInput = document.getElementById('pinInput');
  var loginError = document.getElementById('loginError');
  var activitiesList = document.getElementById('activitiesList');
  var saveBtn = document.getElementById('saveBtn');
  var exportBtn = document.getElementById('exportBtn');
  var logoutBtn = document.getElementById('logoutBtn');
  var toast = document.getElementById('toast');
  var enabledCount = document.getElementById('enabledCount');
  var brandNameInput = document.getElementById('brandNameInput');
  var brandTaglineInput = document.getElementById('brandTaglineInput');
  var phoneInput = document.getElementById('phoneInput');
  var socialList = document.getElementById('socialList');
  var themesGrid = document.getElementById('themesGrid');
  var featuredSelect = document.getElementById('featuredSelect');
  var featuredActivitySelect = document.getElementById('featuredActivitySelect');
  var brandLogoFile = document.getElementById('brandLogoFile');
  var brandLogoBtn = document.getElementById('brandLogoBtn');
  var brandLogoResetBtn = document.getElementById('brandLogoResetBtn');
  var brandLogoPreviewMount = document.getElementById('brandLogoPreviewMount');
  var pendingBrandLogo = null;
  var pendingBrandLogoTouched = false;
  var selectedTheme = 'slate';
  var activeTab = 'activities';

  // Payment settings elements
  var paymentEnabled = document.getElementById('paymentEnabled');
  var paymentProvider = document.getElementById('paymentProvider');
  var paymentPublishableKey = document.getElementById('paymentPublishableKey');
  var paymentRequire = document.getElementById('paymentRequire');
  var paymentSandbox = document.getElementById('paymentSandbox');
  var paymentCurrency = document.getElementById('paymentCurrency');

  if (contentAdmin) contentAdmin.init(store);

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function showToast(msg, type) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast toast--' + (type || 'success');
    toast.hidden = false;
    setTimeout(function () { toast.hidden = true; }, 4000);
  }

  window.RonaqAdminToast = showToast;

  function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
    renderPanel();
  }

  function showLogin() {
    loginView.hidden = false;
    adminView.hidden = true;
  }

  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.classList.toggle('admin-tab--active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-tab-panel').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== tabId;
    });
    if (tabId === 'content') {
      var cfg = store.loadConfig();
      var actId = (contentAdmin && contentAdmin.getCurrentActivityId()) || cfg.featuredActivity || cfg.enabledActivities[0];
      if (contentAdmin) contentAdmin.renderEditor(actId);
    }
    if (tabId === 'appointments' && window.RonaqAdminBooking) {
      window.RonaqAdminBooking.refresh();
    }
    if (tabId === 'orders' && window.RonaqAdminOrders) {
      window.RonaqAdminOrders.refresh();
    }
    if (tabId === 'staff' && window.RonaqAdminStaff) {
      window.RonaqAdminStaff.refresh();
    }
    if (tabId === 'developer' && window.RonaqAdminDeveloper) {
      window.RonaqAdminDeveloper.refresh();
    }
    if (tabId === 'saas' && window.RonaqAdminDeveloper) {
      window.RonaqAdminDeveloper.refresh();
    }
  }

  function getEnabledActivityIds() {
    if (!activitiesList) return [];
    var ids = [];
    activitiesList.querySelectorAll('.admin-activity__check:checked').forEach(function (cb) {
      ids.push(cb.value);
    });
    return ids;
  }

  function getEnabledServiceIds() {
    if (!activitiesList) return [];
    var ids = [];
    activitiesList.querySelectorAll('.admin-service__check:checked').forEach(function (cb) {
      ids.push(cb.value);
    });
    return ids;
  }

  function updateCount() {
    var actCount = getEnabledActivityIds().length;
    var svcCount = getEnabledServiceIds().length;
    if (enabledCount) {
      enabledCount.textContent = actCount + ' نشاط و ' + svcCount + ' خدمة مفعّلة';
    }
  }

  function updateSelects() {
    var enabledActs = getEnabledActivityIds();
    var enabledSvcs = getEnabledServiceIds();

    if (featuredActivitySelect) {
      featuredActivitySelect.innerHTML = enabledActs.map(function (id) {
        var act = store.getResolvedActivity(id);
        return act ? '<option value="' + id + '">' + esc(act.title) + '</option>' : '';
      }).join('') || '<option value="">—</option>';
    }
    if (featuredSelect) {
      featuredSelect.innerHTML = enabledSvcs.map(function (id) {
        var svc = store.getResolvedService(id);
        return svc ? '<option value="' + id + '">' + esc(svc.title) + '</option>' : '';
      }).join('') || '<option value="">—</option>';
    }
  }

  function renderSocial(config) {
    if (!socialList) return;
    var social = config.social || {};
    socialList.innerHTML = socialCatalog.map(function (platform) {
      var entry = social[platform.id] || { enabled: false, value: '' };
      var checked = entry.enabled ? ' checked' : '';
      var onClass = entry.enabled ? ' admin-social--on' : '';
      return (
        '<div class="admin-social' + onClass + '" data-platform="' + platform.id + '">' +
        '<label class="admin-social__toggle-row">' +
        '<input type="checkbox" class="admin-social__check" data-platform="' + platform.id + '"' + checked + '>' +
        '<span class="admin-social__icon">' + platform.icon + '</span>' +
        '<span class="admin-social__name">' + platform.name + '</span>' +
        '<span class="admin-service__toggle" aria-hidden="true"></span></label>' +
        '<div class="admin-social__field"' + (entry.enabled ? '' : ' hidden') + '>' +
        '<input type="text" class="admin-input admin-social__value" data-platform="' + platform.id + '"' +
        ' placeholder="' + esc(platform.placeholder) + '" value="' + esc(entry.value || '') + '" dir="ltr"></div></div>'
      );
    }).join('');

    socialList.querySelectorAll('.admin-social__check').forEach(function (input) {
      input.addEventListener('change', function () {
        var row = input.closest('.admin-social');
        var field = row.querySelector('.admin-social__field');
        row.classList.toggle('admin-social--on', input.checked);
        if (field) field.hidden = !input.checked;
      });
    });
  }

  function getSocialValues() {
    var social = {};
    socialCatalog.forEach(function (platform) {
      var row = socialList && socialList.querySelector('[data-platform="' + platform.id + '"]');
      if (!row) return;
      var check = row.querySelector('.admin-social__check');
      var valueInput = row.querySelector('.admin-social__value');
      social[platform.id] = {
        enabled: !!(check && check.checked),
        value: valueInput ? valueInput.value.trim() : '',
      };
    });
    return social;
  }

  function updateBrandPreview(config) {
    var brand = store.normalizeBrand({
      name: brandNameInput ? brandNameInput.value.trim() : config.brand.name,
      tagline: brandTaglineInput ? brandTaglineInput.value.trim() : config.brand.tagline,
      logo: pendingBrandLogoTouched ? (pendingBrandLogo || '') : config.brand.logo,
    });
    if (window.RonaqBrandLogo) window.RonaqBrandLogo.apply(brand);
  }

  function renderBrand(config) {
    pendingBrandLogo = config.brand.logo || '';
    pendingBrandLogoTouched = false;
    if (brandNameInput) brandNameInput.value = config.brand.name;
    if (brandTaglineInput) brandTaglineInput.value = config.brand.tagline;
    updateBrandPreview(config);
  }

  function renderActivities(config) {
    var enabledActs = config.enabledActivities || [];
    var enabledSvcs = config.enabled || [];
    var catalog = store.getActivitiesCatalog();

    activitiesList.innerHTML = catalog.map(function (act) {
      var resolved = store.getResolvedActivity(act.id, config);
      var actOn = enabledActs.indexOf(act.id) !== -1;
      var services = store.getServicesForActivity(act.id);
      var servicesHtml = services.map(function (svc) {
        var resolvedSvc = store.getResolvedService(svc.id, config);
        var svcOn = enabledSvcs.indexOf(svc.id) !== -1;
        var disabled = actOn ? '' : ' disabled';
        var editHtml = contentAdmin ? contentAdmin.renderServiceEditor(svc.id) : '';
        return (
          '<div class="admin-service-wrap">' +
          '<label class="admin-service' + (svcOn && actOn ? ' admin-service--on' : '') + '">' +
          '<input type="checkbox" class="admin-service__check" value="' + svc.id + '"' +
          (svcOn && actOn ? ' checked' : '') + disabled + '>' +
          '<span class="admin-service__icon">' + resolvedSvc.icon + '</span>' +
          '<span class="admin-service__info"><strong>' + esc(resolvedSvc.title) + '</strong>' +
          '<small>' + esc(resolvedSvc.category) + '</small></span>' +
          '<span class="admin-service__toggle" aria-hidden="true"></span></label>' +
          '<details class="admin-service-details"><summary>تعديل المحتوى</summary>' + editHtml + '</details></div>'
        );
      }).join('');

      return (
        '<div class="admin-activity' + (actOn ? ' admin-activity--on' : '') + '">' +
        '<label class="admin-activity__header">' +
        '<input type="checkbox" class="admin-activity__check" value="' + act.id + '"' + (actOn ? ' checked' : '') + '>' +
        '<span class="admin-activity__icon">' + resolved.icon + '</span>' +
        '<span class="admin-activity__info">' +
        '<strong>' + esc(resolved.title) + '</strong>' +
        '<small>' + esc(resolved.tagline) + '</small></span>' +
        '<span class="admin-service__toggle" aria-hidden="true"></span></label>' +
        '<div class="admin-activity__services"' + (actOn ? '' : ' hidden') + '>' + servicesHtml + '</div></div>'
      );
    }).join('');

    activitiesList.querySelectorAll('.admin-activity__check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var block = cb.closest('.admin-activity');
        var svcBlock = block.querySelector('.admin-activity__services');
        var on = cb.checked;
        block.classList.toggle('admin-activity--on', on);
        if (svcBlock) svcBlock.hidden = !on;
        block.querySelectorAll('.admin-service__check').forEach(function (sc) {
          sc.disabled = !on;
          if (!on) { sc.checked = false; sc.closest('.admin-service').classList.remove('admin-service--on'); }
        });
        updateSelects();
        updateCount();
      });
    });

    activitiesList.querySelectorAll('.admin-service__check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        cb.closest('.admin-service').classList.toggle('admin-service--on', cb.checked);
        updateSelects();
        updateCount();
      });
    });
  }

  function renderThemes(config) {
    if (!themesGrid) return;
    selectedTheme = config.theme || 'slate';
    themesGrid.innerHTML = store.getThemesCatalog().map(function (t) {
      var active = t.id === selectedTheme ? ' theme-card--active' : '';
      var swatches = t.colors.map(function (c) {
        return '<span style="background:' + c + '"></span>';
      }).join('');
      return (
        '<button type="button" class="theme-card' + active + '" data-theme="' + t.id + '">' +
        '<div class="theme-card__swatches">' + swatches + '</div>' +
        '<strong>' + t.name + '</strong></button>'
      );
    }).join('');

    themesGrid.querySelectorAll('.theme-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedTheme = btn.getAttribute('data-theme');
        store.applyTheme(selectedTheme);
        themesGrid.querySelectorAll('.theme-card').forEach(function (b) {
          b.classList.toggle('theme-card--active', b === btn);
        });
      });
    });
  }

  function renderSupabase(config) {
    var sb = config.supabase || { enabled: false, url: '', key: '' };
    var cb = document.getElementById('supabaseEnabled');
    var urlInput = document.getElementById('supabaseUrlInput');
    var keyInput = document.getElementById('supabaseKeyInput');
    var sqlArea = document.getElementById('supabaseSqlArea');

    if (cb) cb.checked = !!sb.enabled;
    if (urlInput) urlInput.value = sb.url || '';
    if (keyInput) keyInput.value = sb.key || '';
    if (sqlArea && window.RonaqSupabaseDb) {
      sqlArea.value = window.RonaqSupabaseDb.getInitSql();
    }
  }

  function renderWhatsapp(config) {
    var wa = config.whatsappApi || {
      enabled: false,
      provider: 'none',
      url: '',
      instanceId: '',
      token: '',
      accountSid: '',
      fromNumber: '',
      sendConfirmation: true,
      sendReminder: true
    };

    var cb = document.getElementById('whatsappApiEnabled');
    var provSelect = document.getElementById('whatsappApiProvider');
    var urlInput = document.getElementById('whatsappApiUrl');
    var instInput = document.getElementById('whatsappApiInstanceId');
    var tokInput = document.getElementById('whatsappApiToken');
    var fromInput = document.getElementById('whatsappApiFromNumber');
    var confirmCb = document.getElementById('whatsappSendConfirmation');
    var remindCb = document.getElementById('whatsappSendReminder');

    if (cb) cb.checked = !!wa.enabled;
    if (provSelect) provSelect.value = wa.provider || 'none';
    if (urlInput) urlInput.value = wa.url || '';
    if (instInput) instInput.value = wa.provider === 'twilio' ? (wa.accountSid || '') : (wa.instanceId || '');
    if (tokInput) tokInput.value = wa.token || '';
    if (fromInput) fromInput.value = wa.fromNumber || '';
    if (confirmCb) confirmCb.checked = wa.sendConfirmation !== false;
    if (remindCb) remindCb.checked = wa.sendReminder !== false;

    toggleWhatsappFields(wa.provider);
  }

  function toggleWhatsappFields(provider) {
    var urlBlock = document.getElementById('whatsappUrlBlock');
    var instBlock = document.getElementById('whatsappInstanceBlock');
    var tokBlock = document.getElementById('whatsappTokenBlock');
    var fromBlock = document.getElementById('whatsappFromBlock');
    var instLabel = document.querySelector('label[for="whatsappApiInstanceId"]');
    var tokLabel = document.querySelector('label[for="whatsappApiToken"]');

    if (urlBlock) urlBlock.hidden = provider !== 'custom';
    if (instBlock) instBlock.hidden = (provider !== 'ultramsg' && provider !== 'twilio');
    if (tokBlock) tokBlock.hidden = (provider === 'none');
    if (fromBlock) fromBlock.hidden = provider !== 'twilio';

    if (instLabel) {
      instLabel.textContent = provider === 'twilio' ? 'معرف حساب Twilio (Account SID)' : 'معرف نسخة UltraMsg (Instance ID)';
    }
    if (tokLabel) {
      tokLabel.textContent = provider === 'custom' ? 'مفتاح التحقق للـ Webhook (Token)' : 'رمز المرور للربط (Token / Auth Token)';
    }
  }

  function renderPayment(config) {
    var pay = config.payment || {
      enabled: false,
      provider: 'moyasar',
      publishableKey: '',
      requirePayment: false,
      sandbox: true,
      currency: 'SAR',
    };
    if (paymentEnabled) paymentEnabled.checked = !!pay.enabled;
    if (paymentProvider) paymentProvider.value = pay.provider || 'moyasar';
    if (paymentPublishableKey) paymentPublishableKey.value = pay.publishableKey || '';
    if (paymentRequire) paymentRequire.checked = pay.requirePayment === true;
    if (paymentSandbox) paymentSandbox.checked = pay.sandbox !== false;
    if (paymentCurrency) paymentCurrency.value = pay.currency || 'SAR';
  }

  function renderSaas(config) {
    var subStatus = document.getElementById('saasSubStatus');
    var subEnd = document.getElementById('saasSubEnd');
    var slugInput = document.getElementById('tenantSlugInput');
    var slugHint = document.getElementById('tenantSlugHint');
    
    var mapsEnabled = document.getElementById('mapsEnabled');
    var mapsListingUrl = document.getElementById('mapsListingUrl');
    var mapsCity = document.getElementById('mapsCity');
    var mapsRadius = document.getElementById('mapsRadius');
    var mapsLat = document.getElementById('mapsLat');
    var mapsLng = document.getElementById('mapsLng');
    var mapsNote = document.getElementById('mapsNote');
    var previewContainer = document.getElementById('adminMapsPreviewContainer');

    var tenantSlug = store.getCurrentTenantSlug() || 'default';
    if (slugInput) slugInput.value = tenantSlug;
    if (slugHint) slugHint.textContent = tenantSlug;

    if (config.subscription) {
      var sub = config.subscription;
      var isExpired = sub.status === 'expired' || (sub.end && new Date(sub.end) < new Date());
      if (subStatus) {
        if (isExpired) {
          subStatus.textContent = 'منتهي الصلاحية (Expired)';
          subStatus.style.background = '#ff4d4f';
          subStatus.style.color = '#fff';
        } else {
          subStatus.textContent = 'نشط (Active)';
          subStatus.style.background = '#52c41a';
          subStatus.style.color = '#fff';
        }
      }
      if (subEnd && sub.end) {
        var endDate = new Date(sub.end);
        subEnd.value = endDate.toLocaleDateString('ar-SA') + ' - ' + endDate.toLocaleTimeString('ar-SA');
      }
    } else {
      if (subStatus) {
        subStatus.textContent = 'وضع محلي (غير مرتبط بسحابة)';
        subStatus.style.background = '#777';
        subStatus.style.color = '#fff';
      }
      if (subEnd) subEnd.value = 'لا ينطبق (غير مرتبط بـ Supabase)';
    }

    var area = config.serviceArea || {};
    if (mapsEnabled) mapsEnabled.checked = !!area.enabled;
    if (mapsListingUrl) mapsListingUrl.value = area.googleMapsUrl || '';
    if (mapsCity) mapsCity.value = area.city || '';
    if (mapsRadius) mapsRadius.value = area.radiusKm || 25;
    if (mapsLat) mapsLat.value = area.center ? area.center.lat : '';
    if (mapsLng) mapsLng.value = area.center ? area.center.lng : '';
    if (mapsNote) mapsNote.value = area.coverageNote || '';

    // Render Maps Preview
    updateAdminMapPreview();
  }

  function updateAdminMapPreview() {
    var mapsRadius = document.getElementById('mapsRadius');
    var mapsLat = document.getElementById('mapsLat');
    var mapsLng = document.getElementById('mapsLng');
    var previewContainer = document.getElementById('adminMapsPreviewContainer');
    
    if (!previewContainer) return;

    var radius = mapsRadius ? parseFloat(mapsRadius.value) : 25;
    var lat = mapsLat ? parseFloat(mapsLat.value) : null;
    var lng = mapsLng ? parseFloat(mapsLng.value) : null;

    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      var circleSize = Math.round(60 + ((radius - 5) / 75) * 160);
      var mapUrl = 'https://maps.google.com/maps?q=' + lat + ',' + lng + '&z=11&output=embed';
      previewContainer.innerHTML = 
        '<div class="service-area-map service-area-map--admin" style="margin-top: 15px;">' +
        '  <div class="service-area-map__frame">' +
        '    <iframe src="' + mapUrl + '" allowfullscreen="" loading="lazy" title="معاينة الخريطة"></iframe>' +
        '  </div>' +
        '  <div class="service-area-map__overlay">' +
        '    <div class="service-area-map__circle" style="width: ' + circleSize + 'px; height: ' + circleSize + 'px;"></div>' +
        '  </div>' +
        '</div>';
    } else {
      previewContainer.innerHTML = '<div class="admin-hint" style="padding: 20px; border: 1px dashed #ccc; text-align: center; margin-top: 10px;">أدخل الإحداثيات للمعاينة الجغرافية</div>';
    }
  }

  function renderPanel() {
    window.RonaqAdminPanelReload = renderPanel;
    var config = store.loadConfig();
    renderBrand(config);
    renderSocial(config);
    renderActivities(config);
    renderThemes(config);
    renderSupabase(config);
    renderWhatsapp(config);
    renderPayment(config);
    renderSaas(config);
    if (phoneInput) phoneInput.value = config.phone || '';
    updateSelects();
    if (featuredActivitySelect) featuredActivitySelect.value = config.featuredActivity || '';
    if (featuredSelect) featuredSelect.value = config.featured || '';
    updateCount();
    if (contentAdmin) {
      var actId = contentAdmin.getCurrentActivityId() || config.featuredActivity || (config.enabledActivities && config.enabledActivities[0]);
      if (actId) contentAdmin.renderEditor(actId);
    }
  }

  function collectConfig() {
    var current = store.loadConfig();
    var activities = Object.assign({}, current.activities || {});
    var services = Object.assign({}, current.services || {}, contentAdmin ? contentAdmin.collectAllServiceOverrides() : {});

    if (contentAdmin) {
      var actOv = contentAdmin.collectActivityOverride();
      if (actOv) activities[actOv.id] = actOv.data;
    }

    var sbEnabled = document.getElementById('supabaseEnabled');
    var sbUrl = document.getElementById('supabaseUrlInput');
    var sbKey = document.getElementById('supabaseKeyInput');

    var waEnabled = document.getElementById('whatsappApiEnabled');
    var waProvider = document.getElementById('whatsappApiProvider');
    var waUrl = document.getElementById('whatsappApiUrl');
    var waInst = document.getElementById('whatsappApiInstanceId');
    var waToken = document.getElementById('whatsappApiToken');
    var waFrom = document.getElementById('whatsappApiFromNumber');
    var waConfirm = document.getElementById('whatsappSendConfirmation');
    var waRemind = document.getElementById('whatsappSendReminder');

    var providerVal = waProvider ? waProvider.value : (current.whatsappApi && current.whatsappApi.provider);

    var pay = {
      enabled: paymentEnabled ? paymentEnabled.checked : (current.payment && current.payment.enabled),
      provider: paymentProvider ? paymentProvider.value : (current.payment && current.payment.provider),
      publishableKey: paymentPublishableKey ? paymentPublishableKey.value.trim() : (current.payment && current.payment.publishableKey),
      requirePayment: paymentRequire ? paymentRequire.checked : (current.payment && current.payment.requirePayment),
      sandbox: paymentSandbox ? paymentSandbox.checked : (current.payment && current.payment.sandbox),
      currency: paymentCurrency ? paymentCurrency.value : (current.payment && current.payment.currency),
    };

    var mapsEnabled = document.getElementById('mapsEnabled');
    var mapsListingUrl = document.getElementById('mapsListingUrl');
    var mapsCity = document.getElementById('mapsCity');
    var mapsRadius = document.getElementById('mapsRadius');
    var mapsLat = document.getElementById('mapsLat');
    var mapsLng = document.getElementById('mapsLng');
    var mapsNote = document.getElementById('mapsNote');

    var radiusVal = mapsRadius ? parseFloat(mapsRadius.value) : 25;
    var latVal = mapsLat ? parseFloat(mapsLat.value) : 21.485811;
    var lngVal = mapsLng ? parseFloat(mapsLng.value) : 39.192505;

    var collectedServiceArea = {
      enabled: mapsEnabled ? mapsEnabled.checked : (current.serviceArea && current.serviceArea.enabled),
      displayOnHomepage: true,
      googleMapsUrl: mapsListingUrl ? mapsListingUrl.value.trim() : (current.serviceArea && current.serviceArea.googleMapsUrl || ''),
      city: mapsCity ? mapsCity.value.trim() : (current.serviceArea && current.serviceArea.city || ''),
      radiusKm: isNaN(radiusVal) ? 25 : radiusVal,
      center: {
        lat: isNaN(latVal) ? 21.485811 : latVal,
        lng: isNaN(lngVal) ? 39.192505 : lngVal,
      },
      coverageNote: mapsNote ? mapsNote.value.trim() : (current.serviceArea && current.serviceArea.coverageNote || ''),
      showAsFullCity: true
    };

    return store.normalizeConfig({
      enabledActivities: getEnabledActivityIds(),
      enabled: getEnabledServiceIds(),
      featuredActivity: featuredActivitySelect ? featuredActivitySelect.value : current.featuredActivity,
      featured: featuredSelect ? featuredSelect.value : current.featured,
      heroFocus: featuredSelect ? featuredSelect.value : current.heroFocus,
      theme: selectedTheme,
      phone: phoneInput ? phoneInput.value : current.phone,
      brand: {
        name: brandNameInput ? brandNameInput.value.trim() : current.brand.name,
        tagline: brandTaglineInput ? brandTaglineInput.value.trim() : current.brand.tagline,
        logo: pendingBrandLogoTouched ? (pendingBrandLogo || '') : current.brand.logo,
      },
      social: getSocialValues(),
      activities: activities,
      services: services,
      heroImage: current.heroImage,
      booking: current.booking,
      serviceArea: collectedServiceArea,
      push: current.push,
      supabase: {
        enabled: sbEnabled ? sbEnabled.checked : (current.supabase && current.supabase.enabled),
        url: sbUrl ? sbUrl.value.trim() : (current.supabase && current.supabase.url),
        key: sbKey ? sbKey.value.trim() : (current.supabase && current.supabase.key),
      },
      whatsappApi: {
        enabled: waEnabled ? waEnabled.checked : (current.whatsappApi && current.whatsappApi.enabled),
        provider: providerVal,
        url: waUrl ? waUrl.value.trim() : (current.whatsappApi && current.whatsappApi.url),
        instanceId: providerVal === 'ultramsg' && waInst ? waInst.value.trim() : (current.whatsappApi && current.whatsappApi.instanceId),
        accountSid: providerVal === 'twilio' && waInst ? waInst.value.trim() : (current.whatsappApi && current.whatsappApi.accountSid),
        token: waToken ? waToken.value.trim() : (current.whatsappApi && current.whatsappApi.token),
        fromNumber: waFrom ? waFrom.value.trim() : (current.whatsappApi && current.whatsappApi.fromNumber),
        sendConfirmation: waConfirm ? waConfirm.checked : (current.whatsappApi && current.whatsappApi.sendConfirmation),
        sendReminder: waRemind ? waRemind.checked : (current.whatsappApi && current.whatsappApi.sendReminder),
      },
      payment: pay
    });
  }

  document.querySelectorAll('.admin-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // Tab Navigation between Login & Register
  var tabToLogin = document.getElementById('tabToLogin');
  var tabToRegister = document.getElementById('tabToRegister');
  var registerForm = document.getElementById('registerForm');
  var loginCardTitle = document.getElementById('loginCardTitle');
  var loginCardDesc = document.getElementById('loginCardDesc');

  if (tabToLogin && tabToRegister) {
    tabToLogin.addEventListener('click', function () {
      tabToLogin.className = 'btn btn--primary btn--sm';
      tabToRegister.className = 'btn btn--outline btn--sm';
      loginForm.hidden = false;
      registerForm.hidden = true;
      if (loginCardTitle) loginCardTitle.textContent = 'تسجيل الدخول';
      if (loginCardDesc) loginCardDesc.textContent = 'تحكم كامل بكل محتوى الواجهة والخدمات';
    });

    tabToRegister.addEventListener('click', function () {
      tabToRegister.className = 'btn btn--primary btn--sm';
      tabToLogin.className = 'btn btn--outline btn--sm';
      loginForm.hidden = true;
      registerForm.hidden = false;
      if (loginCardTitle) loginCardTitle.textContent = 'إنشاء حساب مستأجر جديد';
      if (loginCardDesc) loginCardDesc.textContent = 'ابدأ منصتك السحابية وأطلق نشاطك الرقمي فوراً';
    });
  }

  // Auth Type Selection Handler
  var loginAuthType = document.getElementById('loginAuthType');
  var loginEmailBlock = document.getElementById('loginEmailBlock');
  var loginPasswordBlock = document.getElementById('loginPasswordBlock');
  var loginPinBlock = document.getElementById('loginPinBlock');
  var loginEmailInput = document.getElementById('loginEmailInput');
  var loginPasswordInput = document.getElementById('loginPasswordInput');
  var pinInput = document.getElementById('pinInput');

  if (loginAuthType) {
    loginAuthType.addEventListener('change', function () {
      var val = this.value;
      if (val === 'saas') {
        loginEmailBlock.hidden = false;
        loginPasswordBlock.hidden = false;
        loginPinBlock.hidden = true;
        loginEmailInput.required = true;
        loginPasswordInput.required = true;
        if (pinInput) pinInput.required = false;
      } else {
        loginEmailBlock.hidden = true;
        loginPasswordBlock.hidden = true;
        loginPinBlock.hidden = false;
        loginEmailInput.required = false;
        loginPasswordInput.required = false;
        if (pinInput) pinInput.required = true;
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var authType = loginAuthType ? loginAuthType.value : 'local';

      if (authType === 'local') {
        var enteredPin = pinInput ? pinInput.value.trim() : '';
        var submitBtn = document.getElementById('loginSubmitBtn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'جاري التحقق...';
        }
        if (loginError) loginError.hidden = true;

        fetch('/api/v1/auth/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: enteredPin })
        })
        .then(function (res) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'دخول';
          }
          return res.json();
        })
        .then(function (data) {
          if (data && data.success) {
            store.setAdminLoggedIn(true);
            showAdmin();
          } else {
            if (loginError) {
              loginError.textContent = 'رمز الدخول PIN غير صحيح';
              loginError.hidden = false;
            }
          }
        })
        .catch(function (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'دخول';
          }
          if (loginError) {
            loginError.textContent = 'فشل الاتصال بالخادم: ' + err.message;
            loginError.hidden = false;
          }
        });
      } else {
        // SAAS Login via Supabase Auth
        var email = loginEmailInput ? loginEmailInput.value.trim() : '';
        var password = loginPasswordInput ? loginPasswordInput.value : '';
        var db = window.RonaqSupabaseDb;
        
        if (!db || !db.isConfigured()) {
          showToast('يرجى تهيئة وتفعيل المزامنة السحابية (Supabase) أولاً في تبويب الإعدادات.', 'error');
          return;
        }
        var client = db.getClient();
        if (!client) {
          showToast('فشل الاتصال بقاعدة البيانات.', 'error');
          return;
        }

        var submitBtn = document.getElementById('loginSubmitBtn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'جاري التحقق...';
        }
        if (loginError) loginError.hidden = true;

        client.auth.signInWithPassword({ email: email, password: password })
          .then(function (authRes) {
            if (authRes.error) throw authRes.error;
            
            // Fetch the tenant slug associated with this owner_id
            return client
              .from('ronaq_saas_clients')
              .select('tenant_slug')
              .eq('owner_id', authRes.data.user.id)
              .maybeSingle()
              .then(function (tenantRes) {
                if (tenantRes.error) throw tenantRes.error;
                if (!tenantRes.data) {
                  client.auth.signOut();
                  throw new Error('لا يوجد نشاط تجاري مرتبط بهذا البريد الإلكتروني.');
                }
                
                var tenantSlug = tenantRes.data.tenant_slug;
                store.setAdminLoggedIn(true);
                
                showToast('تم تسجيل الدخول بنجاح! 🚀');
                var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?tenant=" + tenantSlug;
                window.location.href = newUrl;
              });
          })
          .catch(function (err) {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'دخول';
            }
            if (loginError) {
              loginError.textContent = err.message || 'فشل تسجيل الدخول.';
              loginError.hidden = false;
            }
          });
      }
    });
  }

  // Register Form Submission Handler (Sign Up)
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var slug = document.getElementById('regTenantSlug').value.trim().toLowerCase();
      var name = document.getElementById('regBusinessName').value.trim();
      var email = document.getElementById('regEmail').value.trim();
      var password = document.getElementById('regPassword').value;
      var phone = document.getElementById('regPhone').value.trim();

      var db = window.RonaqSupabaseDb;
      if (!db || !db.isConfigured()) {
        showToast('يرجى ربط قاعدة بيانات Supabase أولاً للتمكن من تسجيل مستأجر جديد سحابياً.', 'error');
        return;
      }
      var client = db.getClient();
      if (!client) {
        showToast('فشل الاتصال بقاعدة البيانات.', 'error');
        return;
      }

      var regError = document.getElementById('registerError');
      var regBtn = document.getElementById('registerSubmitBtn');
      if (regError) regError.hidden = true;
      if (regBtn) {
        regBtn.disabled = true;
        regBtn.textContent = 'جاري تسجيل المستخدم...';
      }

      // Check if tenant slug is already taken
      client
        .from('ronaq_saas_clients')
        .select('id')
        .eq('tenant_slug', slug)
        .maybeSingle()
        .then(function (checkRes) {
          if (checkRes.error) throw checkRes.error;
          if (checkRes.data) throw new Error('معرّف الرابط (Tenant Slug) محجوز لعميل آخر، اختر اسماً آخر.');
          
          return client.auth.signUp({ email: email, password: password });
        })
        .then(function (signUpRes) {
          if (signUpRes.error) throw signUpRes.error;
          var user = signUpRes.data.user;
          if (!user) throw new Error('فشل تسجيل حساب المستخدم.');

          if (regBtn) regBtn.textContent = 'جاري تفعيل إعدادات النشاط...';

          var oneYear = new Date();
          oneYear.setFullYear(oneYear.getFullYear() + 1);

          var defaultTenantConfig = Object.assign({}, store.DEFAULT_CONFIG, {
            phone: phone,
            brand: {
              name: name,
              tagline: 'مرحباً بك في موقعك الجديد',
              logo: ''
            }
          });

          return client
            .from('ronaq_saas_clients')
            .insert({
              tenant_slug: slug,
              owner_id: user.id,
              business_name: name,
              email: email,
              phone: phone,
              subscription_end: oneYear.toISOString(),
              config_data: defaultTenantConfig,
              subscription_status: 'active'
            })
            .then(function (insertRes) {
              if (insertRes.error) throw insertRes.error;
              
              showToast('تم تسجيل حسابك بنجاح! يرجى تسجيل الدخول الآن. 🎉');
              if (regBtn) {
                regBtn.disabled = false;
                regBtn.textContent = 'إنشاء الحساب وتفعيل الموقع';
              }
              if (tabToLogin) tabToLogin.click();
            });
        })
        .catch(function (err) {
          if (regBtn) {
            regBtn.disabled = false;
            regBtn.textContent = 'إنشاء الحساب وتفعيل الموقع';
          }
          if (regError) {
            regError.textContent = err.message || 'فشل التسجيل.';
            regError.hidden = false;
          }
        });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      var db = window.RonaqSupabaseDb;
      if (db && db.isConfigured()) {
        var client = db.getClient();
        if (client) {
          client.auth.signOut();
        }
      }
      store.setAdminLoggedIn(false);
      showLogin();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      var cfg = collectConfig();
      if (!cfg.brand.name) {
        showToast('أدخل اسم المنشأة', 'error');
        return;
      }
      store.saveConfig(cfg);
      showToast('تم الحفظ');
      renderPanel();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      store.downloadConfigFile();
      showToast('تم تنزيل config.json');
    });
  }

  if (brandLogoBtn && brandLogoFile) {
    brandLogoBtn.addEventListener('click', function () { brandLogoFile.click(); });
    brandLogoFile.addEventListener('change', function () {
      var file = brandLogoFile.files[0];
      if (!file || file.size > 800000) return;
      var reader = new FileReader();
      reader.onload = function () {
        pendingBrandLogo = reader.result;
        pendingBrandLogoTouched = true;
        updateBrandPreview(store.loadConfig());
      };
      reader.readAsDataURL(file);
    });
  }

  if (brandLogoResetBtn) {
    brandLogoResetBtn.addEventListener('click', function () {
      pendingBrandLogo = '';
      pendingBrandLogoTouched = true;
      updateBrandPreview(store.loadConfig());
    });
  }

  if (brandNameInput) brandNameInput.addEventListener('input', function () {
    updateBrandPreview(store.loadConfig());
  });
  if (brandTaglineInput) brandTaglineInput.addEventListener('input', function () {
    updateBrandPreview(store.loadConfig());
  });

  // Change listener for WhatsApp provider
  var provSelect = document.getElementById('whatsappApiProvider');
  if (provSelect) {
    provSelect.addEventListener('change', function () {
      toggleWhatsappFields(this.value);
    });
  }

  // Supabase Event Listeners
  var supabaseSaveSettingsBtn = document.getElementById('supabaseSaveSettingsBtn');
  var supabaseTestBtn = document.getElementById('supabaseTestBtn');
  var supabaseCopySqlBtn = document.getElementById('supabaseCopySqlBtn');

  if (supabaseSaveSettingsBtn) {
    supabaseSaveSettingsBtn.addEventListener('click', function () {
      var cfg = collectConfig();
      store.saveConfig(cfg);
      
      if (window.RonaqSupabaseDb) {
        window.RonaqSupabaseDb.reinit(cfg.supabase.url, cfg.supabase.key, cfg.supabase.enabled);
      }
      
      showToast('تم حفظ إعدادات الربط السحابي ومزامنتها');
      renderPanel();
    });
  }

  if (supabaseTestBtn) {
    supabaseTestBtn.addEventListener('click', function () {
      var urlInput = document.getElementById('supabaseUrlInput');
      var keyInput = document.getElementById('supabaseKeyInput');
      var url = urlInput ? urlInput.value.trim() : '';
      var key = keyInput ? keyInput.value.trim() : '';
      
      if (!url || !key) {
        showToast('يرجى إدخال الرابط والمفتاح أولاً', 'error');
        return;
      }
      
      supabaseTestBtn.disabled = true;
      supabaseTestBtn.textContent = 'جاري الفحص...';
      
      if (window.RonaqSupabaseDb) {
        window.RonaqSupabaseDb.testConnection(url, key)
          .then(function (res) {
            supabaseTestBtn.disabled = false;
            supabaseTestBtn.textContent = 'اختبار الاتصال';
            if (res.schemaMissing) {
              showToast('اتصال ناجح! ولكن الجداول غير مهيأة بعد. يرجى تشغيل سكريبت SQL.', 'warning');
            } else {
              showToast('اتصال ناجح! الجداول مهيأة وجاهزة للعمل.', 'success');
            }
          })
          .catch(function (err) {
            supabaseTestBtn.disabled = false;
            supabaseTestBtn.textContent = 'اختبار الاتصال';
            console.error(err);
            var detail = (err && (err.message || err.details || err.code)) || 'خطأ غير معروف في الشبكة';
            showToast('فشل الاتصال: ' + detail, 'error');
          });
      } else {
        supabaseTestBtn.disabled = false;
        supabaseTestBtn.textContent = 'اختبار الاتصال';
        showToast('مكتبة الاتصال غير متوفرة.', 'error');
      }
    });
  }

  if (supabaseCopySqlBtn) {
    supabaseCopySqlBtn.addEventListener('click', function () {
      var sqlArea = document.getElementById('supabaseSqlArea');
      if (sqlArea) {
        sqlArea.select();
        document.execCommand('copy');
        showToast('تم نسخ سكريبت SQL إلى الحافظة بنجاح!');
      }
    });
  }

  // WhatsApp Event Listeners
  var whatsappSaveSettingsBtn = document.getElementById('whatsappSaveSettingsBtn');
  var whatsappTestBtn = document.getElementById('whatsappTestBtn');

  if (whatsappSaveSettingsBtn) {
    whatsappSaveSettingsBtn.addEventListener('click', function () {
      var cfg = collectConfig();
      store.saveConfig(cfg);
      showToast('تم حفظ إعدادات أتمتة الواتساب ومزامنتها');
      renderPanel();
    });
  }

  // Payment Event Listeners
  var paymentSaveSettingsBtn = document.getElementById('paymentSaveSettingsBtn');
  var supabaseCopyUpgradeSqlBtn = document.getElementById('supabaseCopyUpgradeSqlBtn');

  if (paymentSaveSettingsBtn) {
    paymentSaveSettingsBtn.addEventListener('click', function () {
      var cfg = collectConfig();
      store.saveConfig(cfg);
      showToast('تم حفظ إعدادات الدفع الإلكتروني ومزامنتها');
      renderPanel();
    });
  }

  if (supabaseCopyUpgradeSqlBtn) {
    supabaseCopyUpgradeSqlBtn.addEventListener('click', function () {
      var area = document.getElementById('supabaseUpgradeSqlArea');
      if (area) {
        area.select();
        document.execCommand('copy');
        showToast('تم نسخ سكريبت ترقية الدفع إلى الحافظة بنجاح!');
      }
    });
  }

  if (whatsappTestBtn) {
    whatsappTestBtn.addEventListener('click', function () {
      var urlInput = document.getElementById('whatsappApiUrl');
      var instInput = document.getElementById('whatsappApiInstanceId');
      var tokInput = document.getElementById('whatsappApiToken');
      var fromInput = document.getElementById('whatsappApiFromNumber');
      var provSelect = document.getElementById('whatsappApiProvider');
      
      var provider = provSelect ? provSelect.value : 'none';
      if (provider === 'none') {
        showToast('يرجى اختيار بوابة الإرسال أولاً', 'error');
        return;
      }

      var ownerPhone = store.loadConfig().phone;
      if (!ownerPhone) {
        showToast('يرجى حفظ رقم الجوال الرئيسي للمنشأة أولاً في تبويب العلامة والتواصل', 'error');
        return;
      }

      whatsappTestBtn.disabled = true;
      whatsappTestBtn.textContent = 'جاري إرسال الرسالة...';

      var testConfig = {
        whatsappApi: {
          enabled: true,
          provider: provider,
          url: urlInput ? urlInput.value.trim() : '',
          instanceId: provider === 'ultramsg' && instInput ? instInput.value.trim() : '',
          accountSid: provider === 'twilio' && instInput ? instInput.value.trim() : '',
          token: tokInput ? tokInput.value.trim() : '',
          fromNumber: fromInput ? fromInput.value.trim() : '',
        }
      };

      var testMsg = 'رسالة تجريبية من منصة مكِّن — تم ربط أتمتة الواتساب بنجاح! 🚀';
      
      if (window.RonaqWhatsappAutomation) {
        window.RonaqWhatsappAutomation.sendMessage(ownerPhone, testMsg, 'test', null, testConfig)
          .then(function (res) {
            whatsappTestBtn.disabled = false;
            whatsappTestBtn.textContent = 'اختبار الإرسال التجريبي';
            showToast('تم إرسال الرسالة التجريبية بنجاح إلى جوالك: ' + ownerPhone, 'success');
          })
          .catch(function (err) {
            whatsappTestBtn.disabled = false;
            whatsappTestBtn.textContent = 'اختبار الإرسال التجريبي';
            console.error(err);
            var detail = (err && (err.message || String(err))) || 'خطأ غير معروف';
            showToast('فشل الإرسال: ' + detail, 'error');
          });
      } else {
        whatsappTestBtn.disabled = false;
        whatsappTestBtn.textContent = 'اختبار الإرسال التجريبي';
        showToast('مكتبة الأتمتة غير محملة.', 'error');
      }
    });
  }

  function startWhatsappAutomationPolling() {
    setInterval(function () {
      if (document.hidden) return;
      var config = store.loadConfig();
      if (config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendReminder) {
        if (window.RonaqWhatsappAutomation) {
          window.RonaqWhatsappAutomation.processQueue(config);
        }
      }
    }, 60000);
  }

  // Maps live preview listeners
  var previewTriggerIds = ['mapsRadius', 'mapsLat', 'mapsLng'];
  previewTriggerIds.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateAdminMapPreview);
    }
  });

  // Renew Subscription Listener
  var renewSubBtn = document.getElementById('renewSubBtn');
  if (renewSubBtn) {
    renewSubBtn.addEventListener('click', function () {
      var select = document.getElementById('renewMonthsSelect');
      var months = select ? parseInt(select.value, 10) : 12;
      var tenantSlug = store.getCurrentTenantSlug();
      if (!tenantSlug) {
        showToast('عذراً، يجب تسجيل الدخول كمستأجر سحابي أولاً للتجديد.', 'error');
        return;
      }
      renewSubBtn.disabled = true;
      renewSubBtn.textContent = 'جاري التجديد...';
      
      store.renewSubscription(tenantSlug, months)
        .then(function () {
          renewSubBtn.disabled = false;
          renewSubBtn.textContent = 'تجديد الآن';
          showToast('تم تجديد الاشتراك بنجاح واسترجاع الإعدادات! 🎉');
          renderPanel();
        })
        .catch(function (err) {
          renewSubBtn.disabled = false;
          renewSubBtn.textContent = 'تجديد الآن';
          console.error(err);
          showToast('فشل التجديد: ' + (err.message || String(err)), 'error');
        });
    });
  }

  store.init().then(function () {
    if (store.isAdminLoggedIn()) {
      showAdmin();
      startWhatsappAutomationPolling();
    } else {
      showLogin();
    }
  });
})();
