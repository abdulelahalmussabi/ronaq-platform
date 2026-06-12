/**
 * عرض المنصة متعددة الأنشطة
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  if (!store) return;

  var config, activities, activeActivityId, content, profile;

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function brandName() {
    return store.getBrand(config).name;
  }

  function fillBrand(text) {
    return (text || '').replace(/\{brand\}/g, brandName());
  }

  function renderServiceIcon(svgPath) {
    return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="22" fill="currentColor" opacity=".12"/>' +
      svgPath + '</svg>';
  }

  function renderServiceCard(service, featuredId) {
    var isFeatured = service.id === featuredId;
    var featuresHtml = (service.features || []).map(function (f) {
      return '<li>' + esc(f) + '</li>';
    }).join('');
    return (
      '<article class="service-card' + (isFeatured ? ' service-card--featured' : '') + '">' +
      (isFeatured ? '<div class="service-card__badge">الأكثر طلباً</div>' : '') +
      '<div class="service-card__icon">' + renderServiceIcon(service.svg) + '</div>' +
      '<h3>' + esc(service.title) + '</h3>' +
      '<p>' + esc(service.description) + '</p>' +
      '<ul class="service-card__list">' + featuresHtml + '</ul>' +
      '</article>'
    );
  }

  /* ─── Activity Tabs ─── */
  function renderActivityTabs() {
    var nav = document.getElementById('activityNav');
    if (!nav) return;

    if (activities.length <= 1) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    nav.innerHTML = activities.map(function (act) {
      var active = act.id === activeActivityId ? ' activity-tab--active' : '';
      var count = store.getEnabledServicesByActivity(act.id).length;
      return (
        '<button type="button" class="activity-tab' + active + '" data-activity="' + act.id + '">' +
        '<span class="activity-tab__icon">' + act.icon + '</span>' +
        '<span class="activity-tab__label">' + esc(act.shortTitle) + '</span>' +
        '<span class="activity-tab__count">' + count + '</span>' +
        '</button>'
      );
    }).join('');

    nav.querySelectorAll('.activity-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeActivityId = btn.getAttribute('data-activity');
        switchActivity(activeActivityId);
      });
    });
  }

  function switchActivity(activityId) {
    activeActivityId = activityId;
    var act = store.getResolvedActivity(activityId);
    if (!act) return;

    content = store.getActivityContent(activityId);
    profile = window.RonaqUiProfile.get(act.uiProfile);

    if (config.theme) store.applyTheme(config.theme);
    else if (act.defaultTheme) store.applyTheme(act.defaultTheme);

    renderActivityTabs();
    renderHero();
    renderStats();
    renderFeatures();
    renderServices();
    renderBrands();
    renderPortfolio();
    renderAbout();
    renderProcess();
    renderFaq();
    renderContact();
    renderSocial();
    renderServiceArea();
    toggleSections();
    updateMeta();
  }

  function renderServiceArea() {
    var block = document.getElementById('serviceAreaBlock');
    if (!block) return;
    
    var area = store.normalizeServiceArea(config.serviceArea);
    var profileShow = profile && profile.showServiceArea;
    if (!profileShow || !area.enabled || !area.displayOnHomepage) {
      block.hidden = true;
      return;
    }
    block.hidden = false;

    // Calculate circular scale for styling circle overlay based on radius Km
    var circleSize = Math.round(60 + ((area.radiusKm - 5) / 75) * 160);

    var mapHtml = '';
    if (area.center && area.center.lat && area.center.lng) {
      var mapUrl = 'https://maps.google.com/maps?q=' + area.center.lat + ',' + area.center.lng + '&z=11&output=embed';
      mapHtml = 
        '<div class="service-area-map" style="margin-top: 15px;">' +
        '  <div class="service-area-map__frame">' +
        '    <iframe src="' + esc(mapUrl) + '" allowfullscreen="" loading="lazy" title="خريطة التغطية"></iframe>' +
        '  </div>' +
        '  <div class="service-area-map__overlay">' +
        '    <div class="service-area-map__circle" style="width: ' + circleSize + 'px; height: ' + circleSize + 'px;"></div>' +
        '  </div>' +
        '</div>';
    }

    block.innerHTML = 
      '<div class="service-area-block__inner">' +
      '  <h3 class="service-area-block__title">📍 نطاق التغطية والخدمة</h3>' +
      '  <p class="service-area-block__coverage">المدينة المخدمة: <strong>' + esc(area.city) + '</strong> (نطاق الخدمة: ' + area.radiusKm + ' كم)</p>' +
      '  <p class="service-area-block__note">' + esc(area.coverageNote) + '</p>' +
      mapHtml +
      '  <a href="https://maps.google.com/?q=' + area.center.lat + ',' + area.center.lng + '" target="_blank" rel="noopener" class="service-area-block__link">عرض على خرائط Google ↗</a>' +
      '</div>';
  }

  function toggleSections() {
    var brands = document.getElementById('brandsSection');
    var portfolio = document.getElementById('portfolioSection');

    if (brands) brands.hidden = !(content.brands && content.brands.show);
    if (portfolio) portfolio.hidden = !(content.portfolio && content.portfolio.show);
  }

  /* ─── Hero ─── */
  function renderHero() {
    var act = store.getResolvedActivity(activeActivityId);
    var services = store.getEnabledServicesByActivity(activeActivityId);
    var featuredId = config.featured;
    var hero = content.hero;

    var titleAccent = document.getElementById('heroTitleAccent');
    var desc = document.getElementById('heroDesc');
    var badge = document.getElementById('heroBadge');
    var badgeServices = document.getElementById('heroBadgeServices');
    var strip = document.getElementById('availableServicesStrip');
    var cards = document.getElementById('heroCards');
    var ctaBooking = document.getElementById('heroBookingCta');

    if (titleAccent) titleAccent.textContent = hero.titleAccent;
    if (desc) desc.textContent = fillBrand(hero.desc);

    if (badge) {
      badge.textContent = services.length === 1 ? hero.badgeSingle : hero.badgeMulti;
    }
    if (badgeServices) {
      badgeServices.textContent = services.map(function (s) { return s.shortTitle; }).join('، ');
      badgeServices.hidden = !services.length;
    }
    if (strip) {
      strip.innerHTML = services.map(function (s) {
        return '<span class="available-tag">' + s.icon + ' ' + esc(s.shortTitle) + '</span>';
      }).join('');
    }

    if (ctaBooking && act) {
      var orderCfg = act.order || {};
      var bookCfg = act.booking || {};
      ctaBooking.textContent = orderCfg.ctaLabel || bookCfg.ctaLabel || 'احجز الآن';
      var globalBooking = config.booking && config.booking.enabled !== false;
      if (profile.showOrder) {
        ctaBooking.href = 'order.html?activity=' + encodeURIComponent(activeActivityId);
      } else if (profile.showBooking && globalBooking) {
        ctaBooking.href = 'book.html?activity=' + encodeURIComponent(activeActivityId);
      } else {
        ctaBooking.href = '#contact';
      }
    }

    if (cards) {
      var display = services.slice(0, 4);
      if (!display.length && act) {
        cards.innerHTML = '<div class="hero__card hero__card--single hero__card--accent">' +
          '<div class="hero__icon">' + act.icon + '</div><span>' + esc(act.title) + '</span></div>';
      } else {
        cards.innerHTML = display.map(function (s, i) {
          var accent = s.id === featuredId ? ' hero__card--accent' : '';
          return '<div class="hero__card hero__card--' + (i + 1) + accent + '">' +
            '<div class="hero__icon">' + s.icon + '</div><span>' + esc(s.shortTitle) + '</span></div>';
        }).join('');
      }
    }

    var circle = document.getElementById('heroCircle');
    var image = ((act && act.heroImage) || config.heroImage || '').trim();
    if (circle) {
      if (image) {
        var src = store.resolveAssetUrl ? store.resolveAssetUrl(image, config.updatedAt) : image;
        circle.innerHTML = '<img src="' + esc(src) + '" alt="" loading="lazy">';
        circle.classList.add('hero__circle--image');
      } else {
        circle.innerHTML = '';
        circle.classList.remove('hero__circle--image');
      }
    }
  }

  function renderStats() {
    var grid = document.getElementById('statsGrid');
    if (!grid || !content.stats) return;
    grid.innerHTML = content.stats.map(function (s) {
      return '<div class="stat"><span class="stat__num">' + esc(s.num) + '</span>' +
        '<span class="stat__label">' + esc(s.label) + '</span></div>';
    }).join('');
  }

  function renderFeatures() {
    var grid = document.getElementById('featuresGrid');
    if (!grid || !content.features) return;
    grid.innerHTML = content.features.map(function (f) {
      return '<div class="feature-pill"><span class="feature-pill__icon">' + f.icon +
        '</span><span>' + esc(f.text) + '</span></div>';
    }).join('');
  }

  function renderServices() {
    var grid = document.getElementById('servicesGrid');
    var empty = document.getElementById('servicesEmpty');
    var title = document.getElementById('servicesTitle');
    var desc = document.getElementById('servicesDesc');
    var act = store.getResolvedActivity(activeActivityId);
    var services = store.getEnabledServicesByActivity(activeActivityId);
    var featuredId = config.featured;

    if (title && act) title.textContent = 'خدمات ' + act.title;
    if (desc && act) desc.textContent = act.description;

    if (!grid) return;
    if (!services.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var sorted = services.slice().sort(function (a, b) {
      if (a.id === featuredId) return -1;
      if (b.id === featuredId) return 1;
      return 0;
    });
    grid.innerHTML = sorted.map(function (s) {
      return renderServiceCard(s, featuredId);
    }).join('');
  }

  function renderBrands() {
    var section = document.getElementById('brandsSection');
    if (!section || !content.brands || !content.brands.show) return;
    var b = content.brands;
    section.querySelector('.brands__title').textContent = b.title;
    section.querySelector('.brands__subtitle').textContent = b.subtitle;
    section.querySelector('.brands__grid').innerHTML = b.items.map(function (item) {
      return '<div class="brand-item"><span>' + esc(item.name) + '</span><small>' + esc(item.label) + '</small></div>';
    }).join('');
  }

  function renderPortfolio() {
    var section = document.getElementById('portfolioSection');
    if (!section || !content.portfolio || !content.portfolio.show) return;
    var p = content.portfolio;
    section.querySelector('.portfolio__title').textContent = p.title;
    section.querySelector('.portfolio__subtitle').textContent = p.subtitle;
    section.querySelector('.portfolio__grid').innerHTML = p.items.map(function (item) {
      return '<div class="portfolio-item">' +
        '<span class="portfolio-item__icon">' + item.icon + '</span>' +
        '<strong>' + esc(item.title) + '</strong>' +
        '<small>' + esc(item.tag) + '</small></div>';
    }).join('');
  }

  function renderAbout() {
    var about = content.about;
    if (!about) return;
    var title = document.getElementById('aboutTitle');
    var paras = document.getElementById('aboutParagraphs');
    var checks = document.getElementById('aboutChecks');
    var cards = document.getElementById('aboutCards');

    if (title) title.textContent = fillBrand(about.title);
    if (paras) {
      paras.innerHTML = about.paragraphs.map(function (p) {
        return '<p>' + fillBrand(p) + '</p>';
      }).join('');
    }
    if (checks) {
      checks.innerHTML = about.checks.map(function (c) {
        return '<li>' + esc(c) + '</li>';
      }).join('');
    }
    if (cards && about.cards) {
      cards.innerHTML = about.cards.map(function (c, i) {
        var accent = i === 1 ? ' about__card--accent' : '';
        return '<div class="about__card' + accent + '">' +
          '<div class="about__card-icon">' + c.icon + '</div>' +
          '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p></div>';
      }).join('');
    }
  }

  function renderProcess() {
    var proc = content.process;
    if (!proc) return;
    var title = document.getElementById('processTitle');
    var subtitle = document.getElementById('processSubtitle');
    var steps = document.getElementById('processSteps');

    if (title) title.textContent = proc.title;
    if (subtitle) subtitle.textContent = proc.subtitle;
    if (steps) {
      var html = '';
      proc.steps.forEach(function (step, i) {
        if (i > 0) html += '<div class="step__connector" aria-hidden="true"></div>';
        html += '<div class="step"><div class="step__num">' + step.num + '</div>' +
          '<h3>' + esc(step.title) + '</h3><p>' + esc(step.desc) + '</p></div>';
      });
      steps.innerHTML = html;
    }
  }

  function renderFaq() {
    var list = document.getElementById('faqList');
    var servicesBlock = document.getElementById('faqServices');
    if (!list) return;

    var faqHtml = (content.faq || []).map(function (item) {
      return '<details class="faq__item"><summary>' + esc(item.q) + '</summary><p>' + esc(item.a) + '</p></details>';
    }).join('');

    if (servicesBlock) {
      var svcs = store.getEnabledServicesByActivity(activeActivityId);
      var svcList = svcs.map(function (s) {
        return '<li><span aria-hidden="true">' + s.icon + '</span> ' + esc(s.title) + '</li>';
      }).join('');
      faqHtml += '<details class="faq__item" open><summary>ما الخدمات المتوفرة؟</summary>' +
        '<ul class="faq-services__list">' + svcList + '</ul></details>';
    }
    list.innerHTML = faqHtml;
  }

  function renderSocial() {
    var contactSocial = document.getElementById('contactSocial');
    if (!contactSocial) return;
    var items = store.getEnabledSocial(config.social).filter(function (i) { return i.id !== 'whatsapp'; });
    contactSocial.innerHTML = items.map(function (item) {
      return '<a href="' + esc(item.url) + '" class="social-link" target="_blank" rel="noopener">' +
        '<span class="social-link__icon">' + item.icon + '</span>' +
        '<span class="social-link__name">' + esc(item.name) + '</span></a>';
    }).join('');
    contactSocial.hidden = !items.length;
  }

  function renderContact() {
    var c = content.contact;
    if (!c) return;
    var title = document.getElementById('contactTitle');
    var desc = document.getElementById('contactDesc');
    if (title) title.textContent = c.title;
    if (desc) desc.textContent = fillBrand(c.desc);

    var phone = config.phone || store.DEFAULT_PHONE;
    var display = store.formatPhoneDisplay(phone);
    var tel = store.telLink(phone);
    var wa = store.getSocialUrl('whatsapp', config.social) || store.waLink(phone);

    document.querySelectorAll('[data-contact="phone"]').forEach(function (el) {
      el.textContent = display;
    });
    document.querySelectorAll('[data-contact="tel"]').forEach(function (el) {
      el.href = tel;
    });
    document.querySelectorAll('[data-contact="whatsapp"]').forEach(function (el) {
      el.href = wa;
    });
  }

  function applyBrand() {
    var brand = store.getBrand(config);
    document.querySelectorAll('[data-brand="name"]').forEach(function (el) {
      el.textContent = brand.name;
    });
    document.querySelectorAll('[data-brand="tagline"]').forEach(function (el) {
      el.textContent = brand.tagline;
    });
    if (window.RonaqBrandLogo) window.RonaqBrandLogo.apply(brand);
  }

  function updateMeta() {
    var brand = store.getBrand(config);
    var seo = content.seo || {};
    document.title = brand.name + ' | ' + (seo.titleSuffix || '');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.content = brand.name + ' — ' + fillBrand(content.hero.desc).slice(0, 150);
    }
  }

  function renderAll() {
    config = store.loadConfig();
    activities = store.getEnabledActivities();
    activeActivityId = config.featuredActivity || (activities[0] && activities[0].id);
    if (activities.length && activities.every(function (a) { return a.id !== activeActivityId; })) {
      activeActivityId = activities[0].id;
    }
    applyBrand();
    if (activities.length) switchActivity(activeActivityId);
    else {
      var empty = document.getElementById('servicesEmpty');
      if (empty) { empty.hidden = false; empty.textContent = 'لا توجد أنشطة مفعّلة.'; }
    }
  }

  store.init().then(renderAll);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') store.reload().then(renderAll);
  });
})();
