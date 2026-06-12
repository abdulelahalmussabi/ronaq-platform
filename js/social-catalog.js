/**
 * منصات التواصل الاجتماعي — رونق الخيال
 */
(function () {
  'use strict';

  var PLATFORMS = [
    {
      id: 'whatsapp',
      name: 'واتساب',
      icon: '💬',
      placeholder: '9665056138908',
      hint: 'رقم الجوال بصيغة دولية بدون + أو صفر',
      inputMode: 'tel',
    },
    {
      id: 'instagram',
      name: 'إنستغرام',
      icon: '📷',
      placeholder: 'ronaqalkhayal',
      hint: 'اسم المستخدم فقط أو الرابط الكامل',
    },
    {
      id: 'twitter',
      name: 'إكس (تويتر)',
      icon: '𝕏',
      placeholder: 'ronaqalkhayal',
      hint: 'اسم المستخدم فقط أو الرابط الكامل',
    },
    {
      id: 'facebook',
      name: 'فيسبوك',
      icon: '👤',
      placeholder: 'ronaqalkhayal',
      hint: 'اسم الصفحة أو الرابط الكامل',
    },
    {
      id: 'tiktok',
      name: 'تيك توك',
      icon: '🎵',
      placeholder: 'ronaqalkhayal',
      hint: 'اسم المستخدم مع أو بدون @',
    },
    {
      id: 'snapchat',
      name: 'سناب شات',
      icon: '👻',
      placeholder: 'ronaqalkhayal',
      hint: 'اسم المستخدم فقط',
    },
    {
      id: 'telegram',
      name: 'تيليجرام',
      icon: '✈️',
      placeholder: 'ronaqalkhayal',
      hint: 'اسم المستخدم مع أو بدون @',
    },
    {
      id: 'youtube',
      name: 'يوتيوب',
      icon: '▶️',
      placeholder: '@ronaqalkhayal',
      hint: 'اسم القناة أو الرابط الكامل',
    },
    {
      id: 'linkedin',
      name: 'لينكدإن',
      icon: '💼',
      placeholder: 'company/ronaqalkhayal',
      hint: 'in/username أو company/name أو الرابط الكامل',
    },
  ];

  function stripAt(value) {
    return (value || '').trim().replace(/^@+/, '');
  }

  function digitsOnly(value) {
    return (value || '').replace(/\D/g, '');
  }

  function isUrl(value) {
    return /^https?:\/\//i.test((value || '').trim());
  }

  function buildUrl(platformId, rawValue) {
    var value = (rawValue || '').trim();
    if (!value) return '';

    if (isUrl(value)) return value;

    switch (platformId) {
      case 'whatsapp': {
        var digits = digitsOnly(value);
        return digits ? 'https://wa.me/' + digits : '';
      }
      case 'instagram':
        return 'https://instagram.com/' + encodeURIComponent(stripAt(value));
      case 'twitter':
        return 'https://x.com/' + encodeURIComponent(stripAt(value));
      case 'facebook':
        return 'https://facebook.com/' + encodeURIComponent(stripAt(value));
      case 'tiktok':
        return 'https://www.tiktok.com/@' + encodeURIComponent(stripAt(value));
      case 'snapchat':
        return 'https://www.snapchat.com/add/' + encodeURIComponent(stripAt(value));
      case 'telegram':
        return 'https://t.me/' + encodeURIComponent(stripAt(value));
      case 'youtube': {
        var handle = stripAt(value);
        if (/^(channel|c|user)\//i.test(handle)) {
          return 'https://www.youtube.com/' + handle;
        }
        return 'https://www.youtube.com/@' + encodeURIComponent(handle);
      }
      case 'linkedin': {
        if (/^(in|company)\//i.test(value)) {
          return 'https://www.linkedin.com/' + value.replace(/^\/+/, '');
        }
        return 'https://www.linkedin.com/in/' + encodeURIComponent(stripAt(value));
      }
      default:
        return '';
    }
  }

  function getPlatform(id) {
    return PLATFORMS.find(function (p) { return p.id === id; });
  }

  window.RonaqSocialCatalog = {
    PLATFORMS: PLATFORMS,
    getPlatform: getPlatform,
    buildUrl: buildUrl,
    stripAt: stripAt,
    digitsOnly: digitsOnly,
  };
})();
