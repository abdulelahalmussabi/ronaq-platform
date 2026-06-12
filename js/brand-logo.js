/**
 * شعار العلامة التجارية — يتبع ثيم الموقع أو صورة مخصصة من الإعدادات
 */
(function () {
  'use strict';

  var DEFAULT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" aria-hidden="true">' +
    '<path class="logo-roof" d="M60 24 L90 48 L30 48 Z" fill="currentColor" opacity="0.9"/>' +
    '<path class="logo-body" d="M38 48 H82 V86 H38 Z" fill="currentColor" opacity="0.15"/>' +
    '<path class="logo-body" d="M38 48 H82 V86 H38 Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<rect class="logo-door" x="52" y="64" width="16" height="22" rx="1.5" fill="currentColor" opacity="0.5"/>' +
    '<rect class="logo-window" x="42" y="54" width="11" height="11" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.2"/>' +
    '<rect class="logo-window" x="67" y="54" width="11" height="11" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.2"/>' +
    '<g class="logo-wrench" transform="translate(72,18) rotate(35)" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 10c0-4 3-7 7-7 2 0 3.5.8 4.5 2l5 5-4 4-5-5c-.8-.8-2-1.2-3.2-1.2-2.5 0-4.3 2-4.3 4.5s1.8 4.5 4.3 4.5c1.2 0 2.4-.4 3.2-1.2l5 5-4 4-5-5c-1-1-2.5-2-4.5-2-4 0-7-3-7-7z"/>' +
    '<circle cx="22" cy="22" r="5"/>' +
    '</g>' +
    '<path class="logo-speed" d="M16 58 H30 M12 66 H28 M14 74 H26" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>' +
    '</svg>';

  function getDefaultBrand() {
    var store = window.RonaqServicesStore;
    return store && store.DEFAULT_BRAND
      ? store.DEFAULT_BRAND
      : { name: 'شركة مكِّن', tagline: 'صيانة منزلية متنقلة', logo: '' };
  }

  function mountLogo(el, brand) {
    var size = el.getAttribute('data-size') || '48';
    var label = el.getAttribute('data-label') || (brand && brand.name ? 'شعار ' + brand.name : '');
    var variant = el.getAttribute('data-variant') || '';

    el.classList.add('brand-logo');
    if (variant) el.classList.add('brand-logo--' + variant);
    el.style.width = size + 'px';
    el.style.height = size + 'px';

    if (label) {
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', label);
    } else {
      el.setAttribute('aria-hidden', 'true');
    }

    if (brand && brand.logo) {
      el.innerHTML = '';
      var img = document.createElement('img');
      var store = window.RonaqServicesStore;
      img.src = store && store.resolveAssetUrl
        ? store.resolveAssetUrl(brand.logo, store.loadConfig().updatedAt)
        : brand.logo;
      img.alt = label;
      img.loading = 'lazy';
      el.appendChild(img);
      el.classList.add('brand-logo--custom');
      return;
    }

    el.classList.remove('brand-logo--custom');
    el.innerHTML = DEFAULT_SVG;
  }

  function applyFavicon(brand) {
    var logo = brand && brand.logo ? brand.logo : '';
    var store = window.RonaqServicesStore;
    var href = logo || 'assets/logo.svg';
    if (store && store.resolveAssetUrl && logo && logo.indexOf('data:') !== 0) {
      href = store.resolveAssetUrl(logo, store.loadConfig().updatedAt);
    }
    var link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    var type = 'image/svg+xml';
    if (href.indexOf('data:') === 0) {
      var match = href.match(/^data:([^;]+)/);
      if (match) type = match[1];
    } else {
      var ext = href.split('.').pop().split('?')[0].toLowerCase();
      if (ext === 'png') type = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg';
      else if (ext === 'webp') type = 'image/webp';
    }

    link.type = type;
    link.href = href;
  }

  function apply(brand) {
    var resolved = brand || getDefaultBrand();
    document.querySelectorAll('[data-brand-logo]').forEach(function (el) {
      mountLogo(el, resolved);
    });
    applyFavicon(resolved);
  }

  window.RonaqBrandLogo = {
    apply: apply,
    applyFavicon: applyFavicon,
    mountLogo: mountLogo,
    DEFAULT_SVG: DEFAULT_SVG,
  };

  apply();
})();
