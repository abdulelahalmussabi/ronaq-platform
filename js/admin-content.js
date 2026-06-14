/**
 * محرر محتوى الواجهة — نشاط + خدمات
 */
(function () {
  'use strict';

  var store;
  var currentActivityId = '';
  var pendingHeroImage = null;
  var pendingHeroTouched = false;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function linesToArray(text) {
    return (text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function arrayToLines(arr) {
    return (arr || []).join('\n');
  }

  function renderStatsRows(stats) {
    return (stats || []).map(function (s, i) {
      return (
        '<div class="admin-row-pair" data-stat-row="' + i + '">' +
        '<input type="text" class="admin-input admin-input--sm" data-stat-num placeholder="الرقم" value="' + esc(s.num) + '">' +
        '<input type="text" class="admin-input admin-input--sm" data-stat-label placeholder="الوصف" value="' + esc(s.label) + '">' +
        '<button type="button" class="admin-row-remove" data-remove-stat aria-label="حذف">×</button></div>'
      );
    }).join('');
  }

  function renderFeatureRows(features) {
    return (features || []).map(function (f, i) {
      return (
        '<div class="admin-row-pair" data-feature-row="' + i + '">' +
        '<input type="text" class="admin-input admin-input--icon" data-feature-icon placeholder="🔧" value="' + esc(f.icon) + '">' +
        '<input type="text" class="admin-input admin-input--sm" data-feature-text placeholder="النص" value="' + esc(f.text) + '">' +
        '<button type="button" class="admin-row-remove" data-remove-feature aria-label="حذف">×</button></div>'
      );
    }).join('');
  }

  function renderFaqRows(faq) {
    return (faq || []).map(function (f, i) {
      return (
        '<div class="admin-faq-row" data-faq-row="' + i + '">' +
        '<input type="text" class="admin-input" data-faq-q placeholder="السؤال" value="' + esc(f.q) + '">' +
        '<textarea class="admin-input admin-textarea" data-faq-a rows="2" placeholder="الجواب">' + esc(f.a) + '</textarea>' +
        '<button type="button" class="admin-row-remove" data-remove-faq aria-label="حذف">×</button></div>'
      );
    }).join('');
  }

  function renderStepRows(steps) {
    return (steps || []).map(function (s, i) {
      return (
        '<div class="admin-step-row" data-step-row="' + i + '">' +
        '<input type="text" class="admin-input admin-input--xs" data-step-num placeholder="١" value="' + esc(s.num) + '">' +
        '<input type="text" class="admin-input" data-step-title placeholder="العنوان" value="' + esc(s.title) + '">' +
        '<textarea class="admin-input admin-textarea" data-step-desc rows="2" placeholder="الوصف">' + esc(s.desc) + '</textarea>' +
        '<button type="button" class="admin-row-remove" data-remove-step aria-label="حذف">×</button></div>'
      );
    }).join('');
  }

  function renderEditor(activityId) {
    var mount = document.getElementById('contentEditor');
    if (!mount) return;
    currentActivityId = activityId;
    var data = store.buildActivityFormData(activityId);
    var c = data.content || {};
    var hero = c.hero || {};
    var about = c.about || {};
    var proc = c.process || {};
    var contact = c.contact || {};
    var seo = c.seo || {};

    pendingHeroImage = data.heroImage || '';
    pendingHeroTouched = false;

    mount.innerHTML =
      '<div class="admin-content-form">' +
      '<div class="admin-field"><label>اختر النشاط</label>' +
      '<select id="contentActivitySelect" class="admin-input"></select></div>' +

      '<details open class="admin-details"><summary>هوية النشاط</summary>' +
      '<div class="admin-field"><label>أيقونة (emoji)</label><input id="act_icon" class="admin-input" value="' + esc(data.icon) + '"></div>' +
      '<div class="admin-field"><label>اسم النشاط</label><input id="act_title" class="admin-input" value="' + esc(data.title) + '"></div>' +
      '<div class="admin-field"><label>اسم مختصر (للتبويب)</label><input id="act_shortTitle" class="admin-input" value="' + esc(data.shortTitle) + '"></div>' +
      '<div class="admin-field"><label>الشعار الفرعي للنشاط</label><input id="act_tagline" class="admin-input" value="' + esc(data.tagline) + '"></div>' +
      '<div class="admin-field"><label>وصف النشاط</label><textarea id="act_description" class="admin-input admin-textarea" rows="3">' + esc(data.description) + '</textarea></div>' +
      '<div class="admin-field"><label>زر الحجز / CTA</label><input id="act_cta" class="admin-input" value="' + esc((data.booking && data.booking.ctaLabel) || '') + '"></div>' +
      '</details>' +

      '<details open class="admin-details"><summary>الواجهة الرئيسية (Hero)</summary>' +
      '<div class="admin-field"><label>العنوان البارز</label><input id="hero_titleAccent" class="admin-input" value="' + esc(hero.titleAccent) + '"></div>' +
      '<div class="admin-field"><label>الوصف {brand} = اسم المنشأة</label><textarea id="hero_desc" class="admin-input admin-textarea" rows="3">' + esc(hero.desc) + '</textarea></div>' +
      '<div class="admin-field"><label>شارة — خدمة واحدة</label><input id="hero_badgeSingle" class="admin-input" value="' + esc(hero.badgeSingle) + '"></div>' +
      '<div class="admin-field"><label>شارة — عدة خدمات</label><input id="hero_badgeMulti" class="admin-input" value="' + esc(hero.badgeMulti) + '"></div>' +
      '<div class="admin-field"><label>صورة تعريفية للنشاط</label>' +
      '<div class="admin-logo-preview admin-hero-preview" id="heroImagePreview">' +
      '<span id="heroPreviewEmpty"' + (pendingHeroImage ? ' hidden' : '') + '>لا توجد صورة</span>' +
      '<img id="heroPreviewImg" alt=""' + (pendingHeroImage ? ' src="' + esc(pendingHeroImage) + '"' : ' hidden') + '></div>' +
      '<div class="admin-logo-actions">' +
      '<button type="button" id="heroImageBtn" class="btn btn--outline">رفع صورة</button>' +
      '<button type="button" id="heroImageResetBtn" class="btn btn--outline">إزالة</button>' +
      '<input type="file" id="heroImageFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div>' +
      '<small class="admin-field__hint">صورة مربعة تظهر في دائرة Hero — لكل نشاط صورة مستقلة</small></div>' +
      '</details>' +

      '<details class="admin-details"><summary>الإحصائيات</summary>' +
      '<div id="statsRows" class="admin-rows">' + renderStatsRows(c.stats) + '</div>' +
      '<button type="button" class="btn btn--outline btn--sm" id="addStatBtn">+ إضافة</button></details>' +

      '<details class="admin-details"><summary>شريط المميزات</summary>' +
      '<div id="featureRows" class="admin-rows">' + renderFeatureRows(c.features) + '</div>' +
      '<button type="button" class="btn btn--outline btn--sm" id="addFeatureBtn">+ إضافة</button></details>' +

      '<details class="admin-details"><summary>من نحن</summary>' +
      '<div class="admin-field"><label>عنوان القسم</label><input id="about_title" class="admin-input" value="' + esc(about.title) + '"></div>' +
      '<div class="admin-field"><label>فقرات (سطر لكل فقرة، {brand} مسموح)</label><textarea id="about_paragraphs" class="admin-input admin-textarea" rows="4">' + esc(arrayToLines(about.paragraphs)) + '</textarea></div>' +
      '<div class="admin-field"><label>نقاط القوة (سطر لكل نقطة)</label><textarea id="about_checks" class="admin-input admin-textarea" rows="5">' + esc(arrayToLines(about.checks)) + '</textarea></div>' +
      '</details>' +

      '<details class="admin-details"><summary>كيف نعمل</summary>' +
      '<div class="admin-field"><label>عنوان</label><input id="proc_title" class="admin-input" value="' + esc(proc.title) + '"></div>' +
      '<div class="admin-field"><label>وصف</label><input id="proc_subtitle" class="admin-input" value="' + esc(proc.subtitle) + '"></div>' +
      '<div id="stepRows" class="admin-rows">' + renderStepRows(proc.steps) + '</div>' +
      '<button type="button" class="btn btn--outline btn--sm" id="addStepBtn">+ خطوة</button></details>' +

      '<details class="admin-details"><summary>الأسئلة الشائعة</summary>' +
      '<div id="faqRows" class="admin-rows">' + renderFaqRows(c.faq) + '</div>' +
      '<button type="button" class="btn btn--outline btn--sm" id="addFaqBtn">+ سؤال</button></details>' +

      '<details class="admin-details"><summary>التواصل و SEO</summary>' +
      '<div class="admin-field"><label>عنوان التواصل</label><input id="contact_title" class="admin-input" value="' + esc(contact.title) + '"></div>' +
      '<div class="admin-field"><label>وصف التواصل</label><textarea id="contact_desc" class="admin-input admin-textarea" rows="2">' + esc(contact.desc) + '</textarea></div>' +
      '<div class="admin-field"><label>SEO — لاحقة العنوان</label><input id="seo_titleSuffix" class="admin-input" value="' + esc(seo.titleSuffix) + '"></div>' +
      '<div class="admin-field"><label>SEO — كلمات مفتاحية</label><input id="seo_keywords" class="admin-input" value="' + esc((seo.defaultKeywords || []).join('، ')) + '"></div>' +
      '</details>' +

      '</div>';

    var select = document.getElementById('contentActivitySelect');
    var enabled = store.loadConfig().enabledActivities || [];
    var catalog = store.getActivitiesCatalog();
    select.innerHTML = catalog.map(function (act) {
      var a = store.getResolvedActivity(act.id);
      var isEnabled = enabled.indexOf(act.id) !== -1;
      var suffix = isEnabled ? '' : ' (غير مفعّل)';
      return '<option value="' + act.id + '"' + (act.id === activityId ? ' selected' : '') + '>' + esc(a.title) + suffix + '</option>';
    }).join('');

    select.addEventListener('change', function () {
      renderEditor(select.value);
    });

    bindRowButtons();
    bindHeroImage();
  }

  function bindRowButtons() {
    var statsEl = document.getElementById('statsRows');
    var featEl = document.getElementById('featureRows');
    var faqEl = document.getElementById('faqRows');
    var stepEl = document.getElementById('stepRows');

    document.getElementById('addStatBtn').addEventListener('click', function () {
      statsEl.insertAdjacentHTML('beforeend',
        '<div class="admin-row-pair"><input type="text" class="admin-input admin-input--sm" data-stat-num placeholder="الرقم">' +
        '<input type="text" class="admin-input admin-input--sm" data-stat-label placeholder="الوصف">' +
        '<button type="button" class="admin-row-remove" data-remove-stat>×</button></div>');
      bindRemove(statsEl, '[data-remove-stat]');
    });

    document.getElementById('addFeatureBtn').addEventListener('click', function () {
      featEl.insertAdjacentHTML('beforeend',
        '<div class="admin-row-pair"><input type="text" class="admin-input admin-input--icon" data-feature-icon placeholder="🔧">' +
        '<input type="text" class="admin-input admin-input--sm" data-feature-text placeholder="النص">' +
        '<button type="button" class="admin-row-remove" data-remove-feature>×</button></div>');
      bindRemove(featEl, '[data-remove-feature]');
    });

    document.getElementById('addFaqBtn').addEventListener('click', function () {
      faqEl.insertAdjacentHTML('beforeend',
        '<div class="admin-faq-row"><input type="text" class="admin-input" data-faq-q placeholder="السؤال">' +
        '<textarea class="admin-input admin-textarea" data-faq-a rows="2" placeholder="الجواب"></textarea>' +
        '<button type="button" class="admin-row-remove" data-remove-faq>×</button></div>');
      bindRemove(faqEl, '[data-remove-faq]');
    });

    document.getElementById('addStepBtn').addEventListener('click', function () {
      stepEl.insertAdjacentHTML('beforeend',
        '<div class="admin-step-row"><input type="text" class="admin-input admin-input--xs" data-step-num placeholder="١">' +
        '<input type="text" class="admin-input" data-step-title placeholder="العنوان">' +
        '<textarea class="admin-input admin-textarea" data-step-desc rows="2" placeholder="الوصف"></textarea>' +
        '<button type="button" class="admin-row-remove" data-remove-step>×</button></div>');
      bindRemove(stepEl, '[data-remove-step]');
    });

    bindRemove(statsEl, '[data-remove-stat]');
    bindRemove(featEl, '[data-remove-feature]');
    bindRemove(faqEl, '[data-remove-faq]');
    bindRemove(stepEl, '[data-remove-step]');
  }

  function bindRemove(container, sel) {
    if (!container) return;
    container.querySelectorAll(sel).forEach(function (btn) {
      btn.onclick = function () {
        var row = btn.closest('.admin-row-pair, .admin-faq-row, .admin-step-row');
        if (row) row.remove();
      };
    });
  }

  function bindHeroImage() {
    var fileInput = document.getElementById('heroImageFile');
    var btn = document.getElementById('heroImageBtn');
    var reset = document.getElementById('heroImageResetBtn');
    var img = document.getElementById('heroPreviewImg');
    var empty = document.getElementById('heroPreviewEmpty');

    if (btn) btn.onclick = function () { fileInput.click(); };
    if (reset) reset.onclick = function () {
      pendingHeroImage = '';
      pendingHeroTouched = true;
      if (img) { img.hidden = true; img.src = ''; }
      if (empty) empty.hidden = false;
    };
    if (fileInput) fileInput.onchange = function () {
      var file = fileInput.files[0];
      if (!file || file.size > 800000) return;
      var reader = new FileReader();
      reader.onload = function () {
        pendingHeroImage = reader.result;
        pendingHeroTouched = true;
        if (img) { img.src = pendingHeroImage; img.hidden = false; }
        if (empty) empty.hidden = true;
      };
      reader.readAsDataURL(file);
    };
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function collectStats() {
    var rows = document.querySelectorAll('#statsRows .admin-row-pair');
    var out = [];
    rows.forEach(function (row) {
      var num = row.querySelector('[data-stat-num]');
      var label = row.querySelector('[data-stat-label]');
      if (num && label && (num.value || label.value)) {
        out.push({ num: num.value.trim(), label: label.value.trim() });
      }
    });
    return out;
  }

  function collectFeatures() {
    var rows = document.querySelectorAll('#featureRows .admin-row-pair');
    var out = [];
    rows.forEach(function (row) {
      var icon = row.querySelector('[data-feature-icon]');
      var text = row.querySelector('[data-feature-text]');
      if (text && text.value.trim()) {
        out.push({ icon: icon ? icon.value.trim() : '✓', text: text.value.trim() });
      }
    });
    return out;
  }

  function collectFaq() {
    var rows = document.querySelectorAll('#faqRows .admin-faq-row');
    var out = [];
    rows.forEach(function (row) {
      var q = row.querySelector('[data-faq-q]');
      var a = row.querySelector('[data-faq-a]');
      if (q && q.value.trim()) out.push({ q: q.value.trim(), a: a ? a.value.trim() : '' });
    });
    return out;
  }

  function collectSteps() {
    var rows = document.querySelectorAll('#stepRows .admin-step-row');
    var out = [];
    rows.forEach(function (row) {
      var num = row.querySelector('[data-step-num]');
      var title = row.querySelector('[data-step-title]');
      var desc = row.querySelector('[data-step-desc]');
      if (title && title.value.trim()) {
        out.push({ num: num ? num.value.trim() : '', title: title.value.trim(), desc: desc ? desc.value.trim() : '' });
      }
    });
    return out;
  }

  function collectActivityOverride() {
    if (!currentActivityId) return null;
    var ov = {
      icon: val('act_icon'),
      title: val('act_title'),
      shortTitle: val('act_shortTitle'),
      tagline: val('act_tagline'),
      description: val('act_description'),
      booking: { ctaLabel: val('act_cta') },
      content: {
        hero: {
          titleAccent: val('hero_titleAccent'),
          desc: val('hero_desc'),
          badgeSingle: val('hero_badgeSingle'),
          badgeMulti: val('hero_badgeMulti'),
        },
        stats: collectStats(),
        features: collectFeatures(),
        about: {
          title: val('about_title'),
          paragraphs: linesToArray(val('about_paragraphs')),
          checks: linesToArray(val('about_checks')),
        },
        process: {
          title: val('proc_title'),
          subtitle: val('proc_subtitle'),
          steps: collectSteps(),
        },
        faq: collectFaq(),
        contact: { title: val('contact_title'), desc: val('contact_desc') },
        seo: {
          titleSuffix: val('seo_titleSuffix'),
          defaultKeywords: val('seo_keywords').split(/[،,]/).map(function (k) { return k.trim(); }).filter(Boolean),
        },
      },
    };
    ov.heroImage = pendingHeroImage || '';
    return { id: currentActivityId, data: ov };
  }

  function collectServiceOverride(serviceId) {
    var prefix = 'svc_' + serviceId + '_';
    var titleEl = document.getElementById(prefix + 'title');
    if (!titleEl) return null;
    var priceEl = document.getElementById(prefix + 'price');
    return {
      id: serviceId,
      data: {
        icon: document.getElementById(prefix + 'icon').value.trim(),
        title: titleEl.value.trim(),
        shortTitle: document.getElementById(prefix + 'shortTitle').value.trim(),
        description: document.getElementById(prefix + 'desc').value.trim(),
        category: document.getElementById(prefix + 'category').value.trim(),
        features: linesToArray(document.getElementById(prefix + 'features').value),
        price: priceEl ? priceEl.value.trim() : '',
        roomCount: (function () {
          var el = document.getElementById(prefix + 'roomCount');
          return el ? el.value.trim() : '';
        })(),
      },
    };
  }

  function collectAllServiceOverrides() {
    var map = {};
    document.querySelectorAll('[data-service-edit]').forEach(function (block) {
      var id = block.getAttribute('data-service-edit');
      var item = collectServiceOverride(id);
      if (item) map[item.id] = item.data;
    });
    return map;
  }

  function renderServiceEditor(serviceId) {
    var data = store.buildServiceFormData(serviceId);
    var p = 'svc_' + serviceId + '_';
    return (
      '<div class="admin-service-edit" data-service-edit="' + serviceId + '">' +
      '<div class="admin-field"><label>أيقونة</label><input id="' + p + 'icon" class="admin-input admin-input--icon" value="' + esc(data.icon) + '"></div>' +
      '<div class="admin-field"><label>اسم الخدمة</label><input id="' + p + 'title" class="admin-input" value="' + esc(data.title) + '"></div>' +
      '<div class="admin-field"><label>اسم مختصر</label><input id="' + p + 'shortTitle" class="admin-input" value="' + esc(data.shortTitle) + '"></div>' +
      '<div class="admin-field"><label>السعر (ر.س — اتركه فارغاً للدفع عند الحضور أو مجاني)</label><input type="number" min="0" step="any" id="' + p + 'price" class="admin-input" placeholder="مثال: 150" value="' + esc(data.price || '') + '"></div>' +
      '<div class="admin-field"><label>عدد الغرف المتاحة (للفنادق)</label><input type="number" min="1" max="200" id="' + p + 'roomCount" class="admin-input" placeholder="مثال: 5" value="' + esc(data.roomCount || '') + '"><small class="admin-hint">كل غرفة محجوزة تُخصم من العدد — التاريخ يبقى متاحاً حتى نفاد الغرف</small></div>' +
      '<div class="admin-field"><label>التصنيف</label><input id="' + p + 'category" class="admin-input" value="' + esc(data.category) + '"></div>' +
      '<div class="admin-field"><label>الوصف</label><textarea id="' + p + 'desc" class="admin-input admin-textarea" rows="2">' + esc(data.description) + '</textarea></div>' +
      '<div class="admin-field"><label>المميزات (سطر لكل ميزة)</label><textarea id="' + p + 'features" class="admin-input admin-textarea" rows="4">' + esc(arrayToLines(data.features)) + '</textarea></div>' +
      '</div>'
    );
  }

  window.MkenAdminContent = {
    init: function (storeRef) { store = storeRef; },
    renderEditor: renderEditor,
    renderServiceEditor: renderServiceEditor,
    collectActivityOverride: collectActivityOverride,
    collectAllServiceOverrides: collectAllServiceOverrides,
    getCurrentActivityId: function () { return currentActivityId; },
  };
})();
