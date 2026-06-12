/** تطبيق الثيم من localStorage قبل رسم الصفحة */
(function () {
  var KEY = 'ronaq_platform_config';
  var THEMES = ['terracotta', 'ocean', 'forest', 'midnight', 'desert', 'slate'];
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var cfg = JSON.parse(raw);
    if (cfg.theme && THEMES.indexOf(cfg.theme) !== -1) {
      document.documentElement.setAttribute('data-theme', cfg.theme);
    }
  } catch (e) { /* ignore */ }
})();
