/**
 * إعدادات المنصة: data/config.json + localStorage
 * يدعم الأنشطة الرئيسية (enabledActivities) والخدمات الفرعية (enabled)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ronaq_platform_config';
  var ADMIN_KEY = 'ronaq_platform_admin';
  var CONFIG_URL = 'data/config.json';
  var DEFAULT_PHONE = '9665056138908';

  var DEFAULT_SOCIAL = {
    whatsapp: { enabled: true, value: DEFAULT_PHONE },
    instagram: { enabled: false, value: '' },
    twitter: { enabled: false, value: '' },
    facebook: { enabled: false, value: '' },
    tiktok: { enabled: false, value: '' },
    linkedin: { enabled: false, value: '' },
  };

  var DEFAULT_BRAND = {
    name: 'اسم منشأتك',
    tagline: 'وصف مختصر لنشاطك',
    logo: '',
  };

  var DEFAULT_BOOKING = {
    enabled: true,
    slotDuration: 30,
    advanceDays: 14,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    workingHours: { start: '09:00', end: '22:00' },
    maxPerSlot: 3,
    reminders: {
      enabled: true,
      hoursBefore: [24, 2],
      windowMinutes: 60,
    },
  };

  var DEFAULT_SERVICE_AREA = {
    enabled: true,
    displayOnHomepage: true,
    city: 'جدة',
    center: { lat: 21.485811, lng: 39.192505 },
    radiusKm: 25,
    coverageNote: 'نصل إلى جميع أحياء جدة خلال ساعتين',
    showAsFullCity: true,
  };

  var DEFAULT_PUSH = {
    enabled: false,
    vapidPublicKey: '',
  };

  var DEFAULT_SUPABASE = {
    enabled: false,
    url: '',
    key: '',
  };

  var DEFAULT_WHATSAPP_API = {
    enabled: false,
    provider: 'none',
    url: '',
    instanceId: '',
    token: '',
    accountSid: '',
    fromNumber: '',
    sendConfirmation: true,
    sendReminder: true,
  };

  var DEFAULT_PAYMENT = {
    enabled: false,
    provider: 'moyasar',
    publishableKey: '',
    requirePayment: false,
    sandbox: true,
    currency: 'SAR',
  };

  var DEFAULT_CONFIG = {
    enabledActivities: [
      'barber-salon', 'car-care', 'healthcare', 'spa-wellness', 'fitness',
      'veterinary', 'restaurant', 'consulting', 'photography', 'tutoring',
      'hotels', 'travel', 'events', 'commerce',
      'maintenance', 'tech-digital', 'it-support', 'cleaning', 'renovation', 'security', 'training',
    ],
    enabled: [
      'mens-haircut', 'beard-grooming',
      'quick-wash', 'full-wash',
      'gp-consultation', 'telemedicine',
      'swedish-massage', 'moroccan-bath',
      'personal-training', 'yoga-session',
      'vet-checkup', 'pet-grooming',
      'table-booking', 'private-dining',
      'legal-consult', 'real-estate-viewing',
      'portrait-session', 'event-photography',
      'math-tutoring', 'english-tutoring',
      'standard-room', 'deluxe-room', 'umrah-package', 'domestic-tour',
      'wedding-hall', 'conference-hall', 'event-planning',
      'general-product', 'electronics-item', 'grocery-box',
      'ac', 'web-design', 'whatsapp-crm',
      'computer', 'cleaning', 'painting',
      'cameras', 'computer-basics',
    ],
    featuredActivity: 'barber-salon',
    featured: 'mens-haircut',
    heroFocus: 'mens-haircut',
    theme: 'slate',
    phone: DEFAULT_PHONE,
    social: DEFAULT_SOCIAL,
    brand: DEFAULT_BRAND,
    heroImage: '',
    activities: {},
    services: {},
    booking: DEFAULT_BOOKING,
    serviceArea: DEFAULT_SERVICE_AREA,
    push: DEFAULT_PUSH,
    supabase: DEFAULT_SUPABASE,
    whatsappApi: DEFAULT_WHATSAPP_API,
    payment: DEFAULT_PAYMENT,
    updatedAt: null,
  };

  function resolver() {
    return window.RonaqContentResolver;
  }

  var VALID_THEMES = ['terracotta', 'ocean', 'forest', 'midnight', 'desert', 'slate'];
  var _config = null;
  var _source = 'default';
  var _ready = null;
  var _currentTenantSlug = null;

  function getCurrentTenantSlug() {
    return _currentTenantSlug;
  }

  function getActivitiesCatalog() {
    return window.RonaqActivitiesCatalog || [];
  }

  function getCatalog() {
    return window.RonaqServicesCatalog || [];
  }

  function getActivityById(id) {
    return getActivitiesCatalog().find(function (a) { return a.id === id; });
  }

  function getServicesForActivity(activityId) {
    return getCatalog().filter(function (s) { return s.activityId === activityId; });
  }

  function normalizePhone(value) {
    var digits = (value || '').replace(/\D/g, '');
    if (!digits) return DEFAULT_PHONE;
    if (digits.indexOf('966') === 0) return digits;
    if (digits.indexOf('0') === 0) return '966' + digits.slice(1);
    if (digits.length === 9) return '966' + digits;
    return digits;
  }

  function formatPhoneDisplay(phone) {
    var digits = normalizePhone(phone);
    if (digits.indexOf('966') === 0 && digits.length >= 12) {
      var local = digits.slice(3);
      return '+966 ' + local.slice(0, 2) + ' ' + local.slice(2, 5) + ' ' + local.slice(5);
    }
    return '+' + digits;
  }

  function telLink(phone) { return 'tel:+' + normalizePhone(phone); }
  function waLink(phone) { return 'https://wa.me/' + normalizePhone(phone); }

  function normalizeSocial(rawSocial) {
    var social = {};
    var catalog = (window.RonaqSocialCatalog && window.RonaqSocialCatalog.PLATFORMS) || [];
    catalog.forEach(function (platform) {
      var incoming = (rawSocial && rawSocial[platform.id]) || {};
      var fallback = DEFAULT_SOCIAL[platform.id] || { enabled: false, value: '' };
      social[platform.id] = {
        enabled: !!incoming.enabled,
        value: typeof incoming.value === 'string' ? incoming.value.trim() : fallback.value,
      };
    });
    if (social.whatsapp && social.whatsapp.enabled && !social.whatsapp.value) {
      social.whatsapp.value = DEFAULT_PHONE;
    }
    return social;
  }

  function getSocialUrl(platformId, social) {
    var entry = social && social[platformId];
    if (!entry || !entry.enabled || !entry.value) return '';
    var catalog = window.RonaqSocialCatalog;
    return catalog ? catalog.buildUrl(platformId, entry.value) : '';
  }

  function getEnabledSocial(social) {
    var catalog = (window.RonaqSocialCatalog && window.RonaqSocialCatalog.PLATFORMS) || [];
    return catalog.filter(function (p) {
      var e = social[p.id];
      return e && e.enabled && e.value;
    }).map(function (p) {
      return { id: p.id, name: p.name, icon: p.icon, url: getSocialUrl(p.id, social) };
    }).filter(function (i) { return !!i.url; });
  }

  function normalizeBrand(raw) {
    var incoming = raw || {};
    return {
      name: incoming.name !== undefined ? String(incoming.name).trim() : DEFAULT_BRAND.name,
      tagline: incoming.tagline !== undefined ? String(incoming.tagline).trim() : DEFAULT_BRAND.tagline,
      logo: typeof incoming.logo === 'string' ? incoming.logo.trim() : '',
    };
  }

  function normalizeActivitiesMap(raw, cfg) {
    var map = {};
    var incoming = raw || {};
    getActivitiesCatalog().forEach(function (act) {
      var ov = incoming[act.id] || {};
      var entry = {};
      ['icon', 'title', 'shortTitle', 'tagline', 'description', 'heroImage', 'theme'].forEach(function (key) {
        if (ov[key] !== undefined && ov[key] !== '') entry[key] = ov[key];
      });
      if (ov.booking && typeof ov.booking === 'object') entry.booking = ov.booking;
      if (ov.content && typeof ov.content === 'object') entry.content = ov.content;
      if (Object.keys(entry).length) map[act.id] = entry;
    });
    return map;
  }

  function normalizeServicesMap(raw) {
    var map = {};
    var incoming = raw || {};
    getCatalog().forEach(function (svc) {
      var ov = incoming[svc.id] || {};
      var entry = {};
      ['icon', 'title', 'shortTitle', 'description', 'category', 'price'].forEach(function (key) {
        if (ov[key] !== undefined && ov[key] !== '') entry[key] = ov[key];
      });
      if (Array.isArray(ov.features) && ov.features.length) entry.features = ov.features.slice();
      if (Object.keys(entry).length) map[svc.id] = entry;
    });
    return map;
  }

  function getBrand(config) {
    return normalizeBrand((config || loadConfig()).brand);
  }

  function normalizeBooking(raw) {
    var incoming = raw || {};
    var hours = incoming.workingHours || {};
    var days = Array.isArray(incoming.workingDays) ? incoming.workingDays.slice() : DEFAULT_BOOKING.workingDays.slice();
    days = days.filter(function (d) { return d >= 0 && d <= 6; });
    if (!days.length) days = DEFAULT_BOOKING.workingDays.slice();
    return {
      enabled: incoming.enabled !== false,
      slotDuration: (function () {
        var slot = parseInt(incoming.slotDuration, 10);
        return slot >= 15 && slot <= 480 ? slot : DEFAULT_BOOKING.slotDuration;
      })(),
      advanceDays: Math.min(60, Math.max(1, parseInt(incoming.advanceDays, 10) || DEFAULT_BOOKING.advanceDays)),
      workingDays: days,
      workingHours: {
        start: /^\d{2}:\d{2}$/.test(hours.start) ? hours.start : DEFAULT_BOOKING.workingHours.start,
        end: /^\d{2}:\d{2}$/.test(hours.end) ? hours.end : DEFAULT_BOOKING.workingHours.end,
      },
      maxPerSlot: Math.max(1, parseInt(incoming.maxPerSlot, 10) || DEFAULT_BOOKING.maxPerSlot),
      reminders: (function () {
        var bookingStore = window.RonaqBookingStore;
        if (bookingStore && bookingStore.getReminderSettings) {
          return bookingStore.getReminderSettings(incoming);
        }
        var rem = incoming.reminders || {};
        return {
          enabled: rem.enabled !== false,
          hoursBefore: Array.isArray(rem.hoursBefore) && rem.hoursBefore.length ? rem.hoursBefore : [24, 2],
          windowMinutes: parseInt(rem.windowMinutes, 10) || 60,
        };
      })(),
    };
  }

  function normalizeServiceArea(raw) {
    var incoming = raw || {};
    var lat = parseFloat(incoming.center && incoming.center.lat);
    var lng = parseFloat(incoming.center && incoming.center.lng);
    return {
      enabled: incoming.enabled !== false,
      displayOnHomepage: incoming.displayOnHomepage !== false,
      city: (incoming.city && String(incoming.city).trim()) || DEFAULT_SERVICE_AREA.city,
      center: {
        lat: isNaN(lat) ? DEFAULT_SERVICE_AREA.center.lat : lat,
        lng: isNaN(lng) ? DEFAULT_SERVICE_AREA.center.lng : lng,
      },
      radiusKm: Math.min(80, Math.max(5, parseFloat(incoming.radiusKm) || DEFAULT_SERVICE_AREA.radiusKm)),
      coverageNote: typeof incoming.coverageNote === 'string' ? incoming.coverageNote.trim() : DEFAULT_SERVICE_AREA.coverageNote,
      showAsFullCity: incoming.showAsFullCity !== false,
    };
  }

  function normalizePush(raw) {
    var incoming = raw || {};
    return {
      enabled: incoming.enabled === true,
      vapidPublicKey: typeof incoming.vapidPublicKey === 'string' ? incoming.vapidPublicKey.trim() : '',
    };
  }

  function getBooking(config) {
    return normalizeBooking((config || loadConfig()).booking);
  }

  function getBookingForActivity(activityId, config) {
    config = config || loadConfig();
    var base = getBooking(config);
    var act = getResolvedActivity(activityId, config);
    if (!act || !act.booking) return base;
    var slot = parseInt(act.booking.slotDuration, 10);
    return Object.assign({}, base, {
      slotDuration: slot >= 15 && slot <= 480 ? slot : base.slotDuration,
    });
  }

  function serviceNeedsAddress(service, activityId, config) {
    if (service && service.requiresAddress) return true;
    var act = getResolvedActivity(activityId, config);
    return !!(act && act.booking && act.booking.requiresAddress);
  }

  function getBookableActivities() {
    return getEnabledActivities().filter(function (act) {
      var profile = window.RonaqUiProfile && window.RonaqUiProfile.get(act.uiProfile);
      return profile && profile.showBooking;
    });
  }

  function getOrderableActivities() {
    return getEnabledActivities().filter(function (act) {
      var profile = window.RonaqUiProfile && window.RonaqUiProfile.get(act.uiProfile);
      return profile && profile.showOrder;
    });
  }

  function pruneEnabledServices(cfg) {
    var activities = cfg.enabledActivities || [];
    var catalog = getCatalog();
    cfg.enabled = (cfg.enabled || []).filter(function (id) {
      var svc = catalog.find(function (s) { return s.id === id; });
      return svc && activities.indexOf(svc.activityId) !== -1;
    });
    if (!cfg.enabled.length && activities.length) {
      var first = activities[0];
      var svcs = getServicesForActivity(first);
      if (svcs.length) cfg.enabled = [svcs[0].id];
    }
  }

  function normalizeConfig(raw) {
    var cfg = Object.assign({}, DEFAULT_CONFIG, raw || {});
    if (!Array.isArray(cfg.enabledActivities)) cfg.enabledActivities = DEFAULT_CONFIG.enabledActivities.slice();
    if (!Array.isArray(cfg.enabled)) cfg.enabled = DEFAULT_CONFIG.enabled.slice();

    cfg.enabledActivities = cfg.enabledActivities.filter(function (id) {
      return !!getActivityById(id);
    });
    if (!cfg.enabledActivities.length) cfg.enabledActivities = ['tech-digital'];

    pruneEnabledServices(cfg);

    if (!cfg.featuredActivity || cfg.enabledActivities.indexOf(cfg.featuredActivity) === -1) {
      cfg.featuredActivity = cfg.enabledActivities[0];
    }
    if (!cfg.featured || cfg.enabled.indexOf(cfg.featured) === -1) {
      cfg.featured = cfg.enabled[0] || '';
    }
    if (!cfg.heroFocus || cfg.enabled.indexOf(cfg.heroFocus) === -1) {
      cfg.heroFocus = cfg.enabled[0] || '';
    }

    var featuredAct = getActivityById(cfg.featuredActivity);
    if (featuredAct && VALID_THEMES.indexOf(cfg.theme) === -1) {
      cfg.theme = featuredAct.defaultTheme || 'slate';
    }
    if (VALID_THEMES.indexOf(cfg.theme) === -1) cfg.theme = 'slate';

    cfg.phone = normalizePhone(cfg.phone);
    cfg.social = normalizeSocial(cfg.social);
    cfg.brand = normalizeBrand(cfg.brand);
    cfg.heroImage = typeof cfg.heroImage === 'string' ? cfg.heroImage.trim() : '';
    cfg.activities = normalizeActivitiesMap(cfg.activities, cfg);
    cfg.services = normalizeServicesMap(cfg.services);
    cfg.booking = normalizeBooking(cfg.booking);
    cfg.serviceArea = normalizeServiceArea(cfg.serviceArea);
    cfg.push = normalizePush(cfg.push);
    cfg.supabase = (function (raw) {
      var incoming = raw || {};
      return {
        enabled: incoming.enabled === true,
        url: typeof incoming.url === 'string' ? incoming.url.trim() : '',
        key: typeof incoming.key === 'string' ? incoming.key.trim() : '',
      };
    })(cfg.supabase);
    cfg.whatsappApi = (function (raw) {
      var incoming = raw || {};
      return {
        enabled: incoming.enabled === true,
        provider: typeof incoming.provider === 'string' ? incoming.provider.trim() : 'none',
        url: typeof incoming.url === 'string' ? incoming.url.trim() : '',
        instanceId: typeof incoming.instanceId === 'string' ? incoming.instanceId.trim() : '',
        token: typeof incoming.token === 'string' ? incoming.token.trim() : '',
        accountSid: typeof incoming.accountSid === 'string' ? incoming.accountSid.trim() : '',
        fromNumber: typeof incoming.fromNumber === 'string' ? incoming.fromNumber.trim() : '',
        sendConfirmation: incoming.sendConfirmation !== false,
        sendReminder: incoming.sendReminder !== false,
      };
    })(cfg.whatsappApi);
    cfg.payment = (function (raw) {
      var incoming = raw || {};
      return {
        enabled: incoming.enabled === true,
        provider: typeof incoming.provider === 'string' ? incoming.provider.trim() : 'moyasar',
        publishableKey: typeof incoming.publishableKey === 'string' ? incoming.publishableKey.trim() : '',
        requirePayment: incoming.requirePayment === true,
        sandbox: incoming.sandbox !== false,
        currency: typeof incoming.currency === 'string' ? incoming.currency.trim() : 'SAR',
      };
    })(cfg.payment);
    return cfg;
  }

  function getResolvedActivity(id, config) {
    var r = resolver();
    config = config || loadConfig();
    if (!r) return getActivityById(id);
    return r.resolveActivity(id, config, getActivityById);
  }

  function getResolvedService(id, config) {
    var r = resolver();
    config = config || loadConfig();
    if (!r) return getServiceById(id);
    return r.resolveService(id, config, getServiceById);
  }

  function getActivityContent(activityId, config) {
    var r = resolver();
    config = config || loadConfig();
    if (!r) {
      var fn = window.RonaqContentRegistry && window.RonaqContentRegistry[activityId];
      return fn ? fn() : {};
    }
    return r.resolveContent(activityId, config);
  }

  function isDataUrl(value) {
    return /^data:image\//i.test(value || '');
  }

  function resolveAssetUrl(path, updatedAt) {
    if (!path || isDataUrl(path)) return path;
    if (path.indexOf('assets/') === 0 && updatedAt) {
      var stamp = Date.parse(updatedAt);
      if (!isNaN(stamp)) return path + '?v=' + stamp;
    }
    return path;
  }

  function applyTheme(themeId) {
    var id = VALID_THEMES.indexOf(themeId) !== -1 ? themeId : 'slate';
    document.documentElement.setAttribute('data-theme', id);
    return id;
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeConfig(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return null;
  }

  function fetchServerConfig() {
    return fetch(CONFIG_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(normalizeConfig);
  }

  function pickConfig(serverCfg, localCfg) {
    if (serverCfg && localCfg) {
      var st = serverCfg.updatedAt ? Date.parse(serverCfg.updatedAt) : 0;
      var lt = localCfg.updatedAt ? Date.parse(localCfg.updatedAt) : 0;
      _source = lt > st ? 'local' : 'server';
      return lt > st ? localCfg : serverCfg;
    }
    if (localCfg) { _source = 'local'; return localCfg; }
    if (serverCfg) { _source = 'server'; return serverCfg; }
    _source = 'default';
    return normalizeConfig(null);
  }

  function detectTenantFromHostname() {
    var hostname = window.location.hostname;
    if (/^[0-9.]+$/.test(hostname)) return null;
    
    var parts = hostname.split('.');
    if (parts.length === 2 && parts[1] === 'localhost') {
      return parts[0];
    }
    if (parts.length > 2) {
      if (parts[0] === 'www') {
        if (parts.length > 3) {
          return parts[1];
        }
        return null;
      }
      return parts[0];
    }
    return null;
  }

  function init() {
    if (_ready) return _ready;
    
    // Extract tenant parameter from URL or Subdomain
    var urlParams = new URLSearchParams(window.location.search);
    var tenantSlug = urlParams.get('tenant') || urlParams.get('client');
    if (!tenantSlug) {
      tenantSlug = detectTenantFromHostname();
    }
    _currentTenantSlug = tenantSlug || null;

    var localCfg = loadFromStorage();
    if (_currentTenantSlug && localCfg && localCfg.subscription && localCfg.subscription.tenantSlug !== _currentTenantSlug) {
      localCfg = null;
    }

    _ready = fetchServerConfig()
      .then(function (s) { return pickConfig(s, localCfg); })
      .catch(function () { return localCfg || normalizeConfig(null); })
      .then(function (cfg) {
        var dbEnabled = (cfg.supabase && cfg.supabase.enabled) || _currentTenantSlug;
        var dbUrl = cfg.supabase && cfg.supabase.url;
        var dbKey = cfg.supabase && cfg.supabase.key;

        if (dbEnabled && dbUrl && dbKey && window.RonaqSupabaseDb) {
          window.RonaqSupabaseDb.reinit(dbUrl, dbKey, true);
          return window.RonaqSupabaseDb.fetchConfig(_currentTenantSlug)
            .then(function (dbCfg) {
              if (dbCfg) {
                _source = 'supabase';
                dbCfg.supabase = cfg.supabase; // Preserve credentials
                
                // Check subscription status
                if (dbCfg.subscription) {
                  var sub = dbCfg.subscription;
                  var isExpired = sub.status === 'expired' || (sub.end && new Date(sub.end) < new Date());
                  if (isExpired) {
                    // Reset to default settings in-memory
                    var expiredCfg = normalizeConfig({
                      brand: {
                        name: sub.businessName || 'مكِّن للخدمات',
                        tagline: 'عذراً، هذا الحساب منتهي الصلاحية حالياً. يرجى تجديد الاشتراك للوصول إلى الخدمات.',
                        logo: ''
                      },
                      enabledActivities: ['tech-digital'],
                      enabled: ['web-design'],
                      phone: sub.phone || DEFAULT_PHONE,
                      subscription: sub
                    });
                    return expiredCfg;
                  }
                }
                
                return normalizeConfig(dbCfg);
              }
              return cfg;
            })
            .catch(function (err) {
              console.warn('Failed to fetch config from Supabase, falling back to local/server', err);
              return cfg;
            });
        }
        return cfg;
      })
      .then(function (cfg) {
        _config = cfg;
        applyTheme(cfg.theme);
        return cfg;
      });
    return _ready;
  }

  function reload() { _ready = null; _config = null; return init(); }
  function loadConfig() { return _config ? Object.assign({}, _config) : normalizeConfig(null); }
  function getConfigSource() { return _source; }

  function saveConfig(config) {
    _config = normalizeConfig(config);
    _config.updatedAt = new Date().toISOString();
    _source = 'local';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
    applyTheme(_config.theme);
    
    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      _ready = window.RonaqSupabaseDb.saveConfig(_config, _currentTenantSlug)
        .then(function () {
          _source = 'supabase';
          return _config;
        })
        .catch(function (err) {
          console.error('Failed to save config to Supabase', err);
          return _config;
        });
    } else {
      _ready = Promise.resolve(_config);
    }
    return _config;
  }

  function renewSubscription(tenantSlug, months) {
    var client = window.RonaqSupabaseDb ? window.RonaqSupabaseDb.getClient() : null;
    if (!client) return Promise.reject(new Error('Supabase not configured'));
    
    var slug = tenantSlug || _currentTenantSlug;
    if (!slug) return Promise.reject(new Error('No tenant selected'));
    
    return client
      .from('ronaq_saas_clients')
      .select('*')
      .eq('tenant_slug', slug)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data) throw new Error('Tenant not found');
        
        var currentEnd = new Date(res.data.subscription_end);
        if (isNaN(currentEnd.getTime()) || currentEnd < new Date()) {
          currentEnd = new Date();
        }
        currentEnd.setMonth(currentEnd.getMonth() + (months || 12));
        
        var updateFields = {
          subscription_status: 'active',
          subscription_end: currentEnd.toISOString(),
          updated_at: new Date().toISOString()
        };
        
        if (res.data.saved_config_data) {
          updateFields.config_data = res.data.saved_config_data;
          updateFields.saved_config_data = null;
        }
        
        return client
          .from('ronaq_saas_clients')
          .update(updateFields)
          .eq('tenant_slug', slug)
          .then(function (updateRes) {
            if (updateRes.error) throw updateRes.error;
            return reload();
          });
      });
  }

  function getEnabledActivities() {
    var config = loadConfig();
    return (config.enabledActivities || []).map(function (id) {
      return getResolvedActivity(id, config);
    }).filter(Boolean);
  }

  function getEnabledServices() {
    var config = loadConfig();
    var enabled = config.enabled || [];
    return enabled.map(function (id) {
      return getResolvedService(id, config);
    }).filter(Boolean);
  }

  function getEnabledServicesByActivity(activityId) {
    return getEnabledServices().filter(function (s) { return s.activityId === activityId; });
  }

  function getServiceById(id) {
    return getCatalog().find(function (s) { return s.id === id; });
  }

  function buildActivityFormData(activityId, config) {
    var r = resolver();
    if (!r) return {};
    return r.buildActivityOverrides(activityId, config || loadConfig());
  }

  function buildServiceFormData(serviceId, config) {
    var r = resolver();
    if (!r) return {};
    return r.buildServiceOverrides(serviceId, config || loadConfig());
  }

  function isAdminLoggedIn() { return sessionStorage.getItem(ADMIN_KEY) === '1'; }
  function setAdminLoggedIn(val) {
    if (val) sessionStorage.setItem(ADMIN_KEY, '1');
    else sessionStorage.removeItem(ADMIN_KEY);
  }

  function exportConfig() { return JSON.stringify(loadConfig(), null, 2); }

  function importConfig(json) {
    var parsed = JSON.parse(json);
    if (!Array.isArray(parsed.enabledActivities)) throw new Error('صيغة غير صالحة');
    return saveConfig(parsed);
  }

  function downloadConfigFile() {
    var blob = new Blob([exportConfig()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function applyThemeEarly() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var cfg = JSON.parse(raw);
      if (cfg.theme && VALID_THEMES.indexOf(cfg.theme) !== -1) {
        document.documentElement.setAttribute('data-theme', cfg.theme);
      }
    } catch (e) { /* ignore */ }
  }

  window.RonaqServicesStore = {
    STORAGE_KEY: STORAGE_KEY,
    CONFIG_URL: CONFIG_URL,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    DEFAULT_PHONE: DEFAULT_PHONE,
    VALID_THEMES: VALID_THEMES,
    init: init,
    reload: reload,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    renewSubscription: renewSubscription,
    getCurrentTenantSlug: getCurrentTenantSlug,
    normalizeConfig: normalizeConfig,
    getConfigSource: getConfigSource,
    getActivitiesCatalog: getActivitiesCatalog,
    getActivityById: getActivityById,
    getResolvedActivity: getResolvedActivity,
    getResolvedService: getResolvedService,
    getActivityContent: getActivityContent,
    getEnabledActivities: getEnabledActivities,
    getCatalog: getCatalog,
    getServicesForActivity: getServicesForActivity,
    getEnabledServices: getEnabledServices,
    getEnabledServicesByActivity: getEnabledServicesByActivity,
    getServiceById: getServiceById,
    buildActivityFormData: buildActivityFormData,
    buildServiceFormData: buildServiceFormData,
    isDataUrl: isDataUrl,
    resolveAssetUrl: resolveAssetUrl,
    DEFAULT_BRAND: DEFAULT_BRAND,
    getBrand: getBrand,
    normalizeBrand: normalizeBrand,
    normalizePhone: normalizePhone,
    formatPhoneDisplay: formatPhoneDisplay,
    telLink: telLink,
    waLink: waLink,
    getSocialUrl: getSocialUrl,
    getEnabledSocial: getEnabledSocial,
    normalizeBooking: normalizeBooking,
    getBooking: getBooking,
    getBookingForActivity: getBookingForActivity,
    serviceNeedsAddress: serviceNeedsAddress,
    getBookableActivities: getBookableActivities,
    getOrderableActivities: getOrderableActivities,
    normalizeServiceArea: normalizeServiceArea,
    isAdminLoggedIn: isAdminLoggedIn,
    setAdminLoggedIn: setAdminLoggedIn,
    exportConfig: exportConfig,
    importConfig: importConfig,
    downloadConfigFile: downloadConfigFile,
    applyTheme: applyTheme,
    applyThemeEarly: applyThemeEarly,
    getThemesCatalog: function () { return window.RonaqThemesCatalog || []; },
  };
})();
