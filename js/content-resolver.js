/**
 * دمج القيم الافتراضية (كتالوج + قوالب) مع overrides من config.json
 */
(function () {
  'use strict';

  function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    if (!base || typeof base !== 'object') base = {};
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(override).forEach(function (key) {
      var val = override[key];
      if (val === undefined || val === null) return;
      if (Array.isArray(val)) {
        out[key] = val.slice();
      } else if (typeof val === 'object') {
        out[key] = deepMerge(base[key], val);
      } else if (val !== '') {
        out[key] = val;
      }
    });
    return out;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  window.RonaqContentResolver = {
    deepMerge: deepMerge,
    clone: clone,

    resolveActivity: function (activityId, config, catalogFn) {
      var getActivity = catalogFn || function (id) {
        return (window.RonaqActivitiesCatalog || []).find(function (a) { return a.id === id; });
      };
      var base = getActivity(activityId);
      if (!base) return null;
      var ov = (config.activities && config.activities[activityId]) || {};
      return {
        id: activityId,
        icon: ov.icon || base.icon,
        title: ov.title || base.title,
        shortTitle: ov.shortTitle || base.shortTitle,
        tagline: ov.tagline || base.tagline,
        description: ov.description || base.description,
        heroImage: ov.heroImage || config.heroImage || '',
        uiProfile: base.uiProfile,
        defaultTheme: ov.theme || base.defaultTheme,
        booking: deepMerge(base.booking, ov.booking || {}),
        order: deepMerge(base.order, ov.order || {}),
      };
    },

    resolveService: function (serviceId, config, catalogFn) {
      var getService = catalogFn || function (id) {
        return (window.RonaqServicesCatalog || []).find(function (s) { return s.id === id; });
      };
      var base = getService(serviceId);
      if (!base) return null;
      var ov = (config.services && config.services[serviceId]) || {};
      return Object.assign({}, base, {
        title: ov.title || base.title,
        shortTitle: ov.shortTitle || base.shortTitle,
        description: ov.description || base.description,
        icon: ov.icon || base.icon,
        category: ov.category || base.category,
        priceLabel: ov.priceLabel || base.priceLabel || '',
        price: ov.price || base.price || '',
        features: ov.features && ov.features.length ? ov.features.slice() : (base.features || []).slice(),
      });
    },

    resolveContent: function (activityId, config) {
      var templateFn = window.RonaqContentRegistry && window.RonaqContentRegistry[activityId];
      var template = templateFn ? clone(templateFn()) : {};
      var ov = (config.activities && config.activities[activityId] && config.activities[activityId].content) || {};
      return deepMerge(template, ov);
    },

    /** بناء overrides كاملة للإدارة (قيم فعلية للعرض في النماذج) */
    buildActivityOverrides: function (activityId, config) {
      var resolved = this.resolveActivity(activityId, config);
      var content = this.resolveContent(activityId, config);
      return {
        icon: resolved.icon,
        title: resolved.title,
        shortTitle: resolved.shortTitle,
        tagline: resolved.tagline,
        description: resolved.description,
        heroImage: resolved.heroImage,
        theme: resolved.defaultTheme,
        booking: resolved.booking,
        content: content,
      };
    },

    buildServiceOverrides: function (serviceId, config) {
      var s = this.resolveService(serviceId, config);
      return {
        title: s.title,
        shortTitle: s.shortTitle,
        description: s.description,
        icon: s.icon,
        category: s.category,
        features: (s.features || []).slice(),
        price: s.price || '',
      };
    },
  };
})();
