/**
 * سجل رسائل الواتساب والتحكم بها — لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.MkenServicesStore;
  if (!store) return;

  var tableBody = document.getElementById('whatsappLogsTableBody');
  var refreshBtn = document.getElementById('refreshWhatsappLogsBtn');
  var clearBtn = document.getElementById('clearWhatsappLogsBtn');
  var searchPhone = document.getElementById('waLogsSearchPhone');
  var filterStatus = document.getElementById('waLogsFilterStatus');

  var statTotal = document.getElementById('waStatTotal');
  var statSuccess = document.getElementById('waStatSuccess');
  var statFailed = document.getElementById('waStatFailed');

  var _logs = [];

  function toast(msg, type) {
    if (window.MkenAdminToast) window.MkenAdminToast(msg, type);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('ar-SA') + ' ' + d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  }

  function loadLogs() {
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center; color:var(--color-text-muted);">جاري تحميل السجلات...</td></tr>';

    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      window.MkenSupabaseDb.fetchWhatsappLogs(tenantSlug)
        .then(function (logs) {
          _logs = logs;
          renderLogs();
        })
        .catch(function (err) {
          console.warn('Failed to load whatsapp logs from Supabase', err);
          loadLocalLogs();
        });
    } else {
      loadLocalLogs();
    }
  }

  function loadLocalLogs() {
    try {
      var raw = localStorage.getItem('mken_whatsapp_logs');
      _logs = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _logs = [];
    }
    renderLogs();
  }

  function saveLocalLogs() {
    try {
      localStorage.setItem('mken_whatsapp_logs', JSON.stringify(_logs));
    } catch (e) {
      console.error('Failed to save logs to localStorage', e);
    }
  }

  function cleanPhone(phone) {
    var digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.indexOf('966') === 0) return digits;
    if (digits.indexOf('0') === 0) return '966' + digits.slice(1);
    if (digits.length === 9) return '966' + digits;
    return digits;
  }

  function renderLogs() {
    if (!tableBody) return;

    var filtered = _logs.filter(function (log) {
      // 1. Filter by Status
      var statusVal = filterStatus ? filterStatus.value : 'all';
      if (statusVal !== 'all' && log.status !== statusVal) return false;

      // 2. Filter by Phone Search
      var searchVal = searchPhone ? searchPhone.value.trim() : '';
      if (searchVal && log.phone.indexOf(searchVal) === -1) return false;

      return true;
    });

    // Update stats counters
    var inboundLogs = _logs.filter(function (l) { return l.eventType === 'inbound' || l.status === 'received'; });
    var outboundLogs = _logs.filter(function (l) { return l.eventType !== 'inbound' && l.status !== 'received'; });
    
    var successCount = outboundLogs.filter(function (l) { return l.status === 'success'; }).length;
    var failedCount = outboundLogs.filter(function (l) { return l.status === 'failed'; }).length;
    
    if (statTotal) statTotal.textContent = outboundLogs.length;
    if (statSuccess) statSuccess.textContent = successCount;
    if (statFailed) statFailed.textContent = failedCount;
    
    var statReceived = document.getElementById('waStatReceived');
    if (statReceived) statReceived.textContent = inboundLogs.length;

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center; color:var(--color-text-muted);">لا توجد سجلات مطابقة للبحث.</td></tr>';
      return;
    }

    var html = filtered.map(function (log) {
      var isReceived = log.eventType === 'inbound' || log.status === 'received';
      var statusBadge = '';
      if (isReceived) {
        statusBadge = '<span style="background:#e3f2fd; color:#0d47a1; padding:3px 8px; border-radius:50px; font-size:0.75rem; font-weight:600;">واردة</span>';
      } else {
        statusBadge = log.status === 'success'
          ? '<span style="background:#e8f5e9; color:#2e7d32; padding:3px 8px; border-radius:50px; font-size:0.75rem; font-weight:600;">ناجح</span>'
          : '<span style="background:#fce4ec; color:#c62828; padding:3px 8px; border-radius:50px; font-size:0.75rem; font-weight:600; cursor:help;" title="' + esc(log.errorMessage) + '">فشل ⚠️</span>';
      }

      var truncatedBody = log.body.length > 50 ? log.body.slice(0, 50) + '...' : log.body;

      var actionsHtml = '';
      if (log.status === 'failed' && !isReceived) {
        actionsHtml += '<button type="button" class="btn btn--primary btn--sm" data-retry-log-id="' + log.id + '" style="padding:3px 8px; font-size:0.75rem; margin-inline-end:5px;">🔄 إعادة إرسال</button>';
      }
      actionsHtml += '<button type="button" class="btn btn--outline btn--sm" data-delete-log-id="' + log.id + '" style="color:#c0392b; border-color:#c0392b15; padding:3px 8px; font-size:0.75rem;">🗑️ حذف</button>';

      var eventAr = {
        'confirmation': 'تأكيد الحجز',
        'reminder': 'تذكير موعد',
        'cancellation': 'إلغاء الحجز',
        'reschedule': 'تعديل موعد',
        'subscription_reminder': 'تذكير اشتراك',
        'subscription_expired': 'انتهاء اشتراك',
        'test': 'رسالة تجريبية',
        'inbound': 'رسالة واردة',
        'chatbot_reply': 'رد آلي للبوت',
        'crm_reply': 'رد مباشر (CRM)',
        'marketing_campaign': 'حملة تسويقية'
      }[log.eventType] || log.eventType || 'أخرى';

      var providerAr = {
        'ultramsg': 'UltraMsg',
        'twilio': 'Twilio',
        'custom': 'Custom Webhook',
        'whatsapp_business': 'WhatsApp Business'
      }[log.provider] || log.provider || 'بوابة مخصصة';

      return (
        '<tr style="border-bottom:1px solid var(--color-border);">' +
        '  <td style="padding:10px; font-size:0.8rem;">' + formatDate(log.createdAt) + '</td>' +
        '  <td style="padding:10px; font-family:monospace;">' + esc(log.phone) + '</td>' +
        '  <td style="padding:10px; font-size:0.8rem; font-weight:600;">' + esc(eventAr) + '</td>' +
        '  <td style="padding:10px; font-size:0.8rem;">' + esc(providerAr) + '</td>' +
        '  <td style="padding:10px; font-size:0.8rem; max-width:200px;" title="' + esc(log.body) + '">' + esc(truncatedBody) + '</td>' +
        '  <td style="padding:10px;">' + statusBadge + '</td>' +
        '  <td style="padding:10px; text-align:center; font-family:monospace;">' + log.retryCount + '</td>' +
        '  <td style="padding:10px;">' + actionsHtml + '</td>' +
        '</tr>'
      );
    }).join('');

    tableBody.innerHTML = html;

    // Attach listeners
    tableBody.querySelectorAll('[data-retry-log-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var logId = btn.getAttribute('data-retry-log-id');
        retryLog(logId);
      });
    });

    tableBody.querySelectorAll('[data-delete-log-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var logId = btn.getAttribute('data-delete-log-id');
        if (confirm('هل أنت متأكد من حذف هذا السجل؟')) {
          deleteLog(logId);
        }
      });
    });
  }

  function retryLog(id) {
    var log = _logs.find(function (l) { return l.id === id; });
    if (!log) return;

    toast('جاري محاولة إعادة الإرسال...');

    var config = store.loadConfig();
    if (window.MkenWhatsappAutomation && window.MkenWhatsappAutomation.sendMessage) {
      window.MkenWhatsappAutomation.sendMessage(log.phone, log.body, log.eventType, null, config)
        .then(function () {
          toast('تم إعادة إرسال الرسالة بنجاح!');
          
          if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
            var tenantSlug = store.getCurrentTenantSlug();
            window.MkenSupabaseDb.logWhatsappMessage({
              id: log.id,
              phone: log.phone,
              body: log.body,
              provider: log.provider,
              status: 'success',
              errorMessage: null,
              eventType: log.eventType,
              appointmentId: log.appointmentId,
              retryCount: log.retryCount + 1,
              createdAt: log.createdAt
            }, tenantSlug).then(loadLogs);
          } else {
            log.status = 'success';
            log.errorMessage = null;
            log.retryCount += 1;
            saveLocalLogs();
            renderLogs();
          }
        })
        .catch(function (err) {
          toast('فشلت محاولة إعادة الإرسال: ' + err.message, 'error');
          
          if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
            var tenantSlug = store.getCurrentTenantSlug();
            window.MkenSupabaseDb.logWhatsappMessage({
              id: log.id,
              phone: log.phone,
              body: log.body,
              provider: log.provider,
              status: 'failed',
              errorMessage: err.message || String(err),
              eventType: log.eventType,
              appointmentId: log.appointmentId,
              retryCount: log.retryCount + 1,
              createdAt: log.createdAt
            }, tenantSlug).then(loadLogs);
          } else {
            log.retryCount += 1;
            log.errorMessage = err.message || String(err);
            saveLocalLogs();
            renderLogs();
          }
        });
    }
  }

  function deleteLog(id) {
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      window.MkenSupabaseDb.deleteWhatsappLog(id)
        .then(function () {
          toast('تم حذف السجل من السحابة');
          loadLogs();
        })
        .catch(function (err) {
          toast('فشل حذف السجل: ' + err.message, 'error');
        });
    } else {
      _logs = _logs.filter(function (l) { return l.id !== id; });
      saveLocalLogs();
      renderLogs();
      toast('تم حذف السجل محلياً');
    }
  }

  function clearAllLogs() {
    if (!confirm('هل تريد مسح جميع سجلات الإرسال بشكل نهائي؟')) return;

    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      toast('يرجى حذف السجلات فردياً في السحابة لحماية البيانات.', 'warning');
    } else {
      _logs = [];
      saveLocalLogs();
      renderLogs();
      toast('تم تنظيف السجل المحلي بالكامل');
    }
  }

  // --- CRM Chats Portal Logic ---
  var activeChatPhone = null;
  var waCrmContactsList = document.getElementById('waCrmContactsList');
  var waCrmSearchPhoneInput = document.getElementById('waCrmSearchPhoneInput');
  var waCrmChatMessages = document.getElementById('waCrmChatMessages');
  var waCrmChatHeader = document.getElementById('waCrmChatHeader');
  var waCrmChatInputContainer = document.getElementById('waCrmChatInputContainer');
  var waCrmReplyMessage = document.getElementById('waCrmReplyMessage');
  var waCrmSendReplyBtn = document.getElementById('waCrmSendReplyBtn');

  function getCrmContacts() {
    var groups = {};
    _logs.forEach(function (log) {
      var phone = log.phone;
      if (!groups[phone]) {
        groups[phone] = {
          phone: phone,
          lastMsg: log.body || '',
          lastTime: log.createdAt || '',
          messages: []
        };
      }
      groups[phone].messages.push(log);
    });

    var list = [];
    for (var key in groups) {
      if (groups.hasOwnProperty(key)) {
        groups[key].messages.sort(function (a, b) {
          return new Date(a.createdAt) - new Date(b.createdAt);
        });

        var msgs = groups[key].messages;
        if (msgs.length > 0) {
          groups[key].lastMsg = msgs[msgs.length - 1].body;
          groups[key].lastTime = msgs[msgs.length - 1].createdAt;
        }

        list.push(groups[key]);
      }
    }

    list.sort(function (a, b) {
      return new Date(b.lastTime) - new Date(a.lastTime);
    });

    return list;
  }

  function loadCrmChats() {
    renderCrmSidebar();
    renderCrmActiveChat();
  }

  function renderCrmSidebar() {
    if (!waCrmContactsList) return;

    var contacts = getCrmContacts();
    var query = waCrmSearchPhoneInput ? waCrmSearchPhoneInput.value.trim() : '';
    if (query) {
      contacts = contacts.filter(function (c) {
        return c.phone.indexOf(query) !== -1;
      });
    }

    if (contacts.length === 0) {
      waCrmContactsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">لا توجد محادثات مطابقة للبحث</div>';
      return;
    }

    var html = contacts.map(function (c) {
      var isActive = c.phone === activeChatPhone;
      var bg = isActive ? '#f0f4f8' : '#ffffff';
      var border = isActive ? '3px solid var(--color-primary)' : '3px solid transparent';
      var formattedTime = '';
      if (c.lastTime) {
        var d = new Date(c.lastTime);
        formattedTime = d.toLocaleDateString('ar-SA') + ' ' + d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      }

      var lastMsgTrunc = c.lastMsg.length > 30 ? c.lastMsg.slice(0, 30) + '...' : c.lastMsg;

      return (
        '<div class="crm-contact-item" data-phone="' + c.phone + '" style="padding:12px; border-bottom:1px solid #f0f0f0; border-inline-start:' + border + '; background:' + bg + '; cursor:pointer; transition:background 0.2s;">' +
        '  <div style="display:flex; justify-content:space-between; margin-bottom:5px;">' +
        '    <span style="font-weight:bold; font-size:0.9rem; font-family:monospace; color:var(--color-text);">' + esc(c.phone) + '</span>' +
        '    <span style="font-size:0.75rem; color:var(--color-text-muted);">' + esc(formattedTime) + '</span>' +
        '  </div>' +
        '  <div style="font-size:0.8rem; color:var(--color-text-muted); text-align:right; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">' + esc(lastMsgTrunc) + '</div>' +
        '</div>'
      );
    }).join('');

    waCrmContactsList.innerHTML = html;

    waCrmContactsList.querySelectorAll('.crm-contact-item').forEach(function (item) {
      item.addEventListener('click', function () {
        activeChatPhone = item.getAttribute('data-phone');
        renderCrmSidebar();
        renderCrmActiveChat();
      });
    });
  }

  function renderCrmActiveChat() {
    if (!waCrmChatMessages) return;

    if (!activeChatPhone) {
      if (waCrmChatHeader) waCrmChatHeader.textContent = 'اختر عميلاً من القائمة لبدء استعراض المحادثة والرد';
      waCrmChatMessages.innerHTML = '<div style="margin: auto; color: var(--color-text-muted); text-align: center; font-size: 0.9rem;">💬 استعرض رسائل العملاء الواردة وأرسل ردوداً مباشرة.</div>';
      if (waCrmChatInputContainer) waCrmChatInputContainer.hidden = true;
      return;
    }

    if (waCrmChatHeader) waCrmChatHeader.innerHTML = '💬 المحادثة مع العميل: <span style="font-family:monospace;">' + esc(activeChatPhone) + '</span>';
    if (waCrmChatInputContainer) waCrmChatInputContainer.hidden = false;

    var contacts = getCrmContacts();
    var activeContact = contacts.find(function (c) {
      return c.phone === activeChatPhone;
    });

    if (!activeContact || activeContact.messages.length === 0) {
      waCrmChatMessages.innerHTML = '<div style="margin: auto; color: var(--color-text-muted); text-align: center; font-size: 0.9rem;">لا توجد رسائل مسجلة مع هذا الرقم.</div>';
      return;
    }

    var html = activeContact.messages.map(function (msg) {
      var isInbound = msg.eventType === 'inbound' || msg.status === 'received';
      var align = isInbound ? 'flex-start' : 'flex-end';
      var bg = isInbound ? '#e3f2fd' : '#e8f5e9';
      var border = isInbound ? '1px solid #bbdefb' : '1px solid #c8e6c9';
      var color = '#333333';

      var eventLabel = '';
      if (msg.eventType && msg.eventType !== 'inbound' && msg.eventType !== 'chatbot_reply') {
        var eventAr = {
          'confirmation': 'تأكيد الحجز',
          'reminder': 'تذكير موعد',
          'cancellation': 'إلغاء الحجز',
          'reschedule': 'تعديل موعد',
          'subscription_reminder': 'تذكير اشتراك',
          'subscription_expired': 'انتهاء اشتراك',
          'test': 'رسالة تجريبية',
          'crm_reply': 'رد مباشر (CRM)',
          'marketing_campaign': 'حملة تسويقية'
        }[msg.eventType] || msg.eventType;
        eventLabel = '<div style="font-size:0.7rem; color:var(--color-primary); font-weight:600; margin-bottom:4px;">📌 ' + esc(eventAr) + '</div>';
      } else if (msg.eventType === 'chatbot_reply') {
        eventLabel = '<div style="font-size:0.7rem; color:#2e7d32; font-weight:600; margin-bottom:4px;">🤖 رد آلي للبوت</div>';
      }

      var formattedTime = '';
      if (msg.createdAt) {
        var d = new Date(msg.createdAt);
        formattedTime = d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
      }

      var statusIcon = '';
      if (!isInbound) {
        statusIcon = msg.status === 'success' ? ' ✔️' : ' ❌';
      }

      return (
        '<div style="align-self:' + align + '; max-width:75%; padding:10px 14px; border-radius:12px; background:' + bg + '; border:' + border + '; color:' + color + '; box-shadow:0 1px 2px rgba(0,0,0,0.05);">' +
        '  ' + eventLabel +
        '  <div style="font-size:0.85rem; line-height:1.4; white-space:pre-wrap;">' + esc(msg.body) + '</div>' +
        '  <div style="font-size:0.7rem; color:var(--color-text-muted); text-align:left; margin-top:5px; margin-bottom:-2px;">' + esc(formattedTime) + esc(statusIcon) + '</div>' +
        '</div>'
      );
    }).join('');

    waCrmChatMessages.innerHTML = html;
    waCrmChatMessages.scrollTop = waCrmChatMessages.scrollHeight;
  }

  function sendCrmReply() {
    if (!activeChatPhone) {
      toast('الرجاء اختيار عميل أولاً', 'error');
      return;
    }

    var replyText = waCrmReplyMessage ? waCrmReplyMessage.value.trim() : '';
    if (!replyText) {
      toast('الرجاء كتابة نص الرد', 'warning');
      return;
    }

    if (waCrmSendReplyBtn) waCrmSendReplyBtn.disabled = true;
    toast('جاري إرسال الرد...');

    var config = store.loadConfig();
    if (window.MkenWhatsappAutomation && window.MkenWhatsappAutomation.sendMessage) {
      window.MkenWhatsappAutomation.sendMessage(activeChatPhone, replyText, 'crm_reply', null, config)
        .then(function () {
          toast('تم إرسال الرد وحفظه بنجاح!');
          if (waCrmReplyMessage) waCrmReplyMessage.value = '';
          loadLogs();
        })
        .catch(function (err) {
          toast('فشل إرسال الرد: ' + err.message, 'error');
        })
        .finally(function () {
          if (waCrmSendReplyBtn) waCrmSendReplyBtn.disabled = false;
        });
    } else {
      toast('بوابة الواتساب غير محملة', 'error');
      if (waCrmSendReplyBtn) waCrmSendReplyBtn.disabled = false;
    }
  }

  // --- Marketing Campaigns Bulk Logic ---
  var waCampTarget = document.getElementById('waCampTarget');
  var waCampMessage = document.getElementById('waCampMessage');
  var waCampLaunchBtn = document.getElementById('waCampLaunchBtn');
  var waCampProgressBlock = document.getElementById('waCampProgressBlock');
  var waCampStatusLabel = document.getElementById('waCampStatusLabel');
  var waCampProgressText = document.getElementById('waCampProgressText');
  var waCampProgressBar = document.getElementById('waCampProgressBar');
  var isCampaignRunning = false;

  function getCampaignTargets(targetCategory) {
    var tenantSlug = store.getCurrentTenantSlug();
    var promises = [];

    if (targetCategory === 'booking' || targetCategory === 'all') {
      if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
        promises.push(window.MkenSupabaseDb.fetchAppointments(tenantSlug).catch(function () { return []; }));
      } else {
        promises.push(Promise.resolve([]));
      }
    } else {
      promises.push(Promise.resolve([]));
    }

    if (targetCategory === 'order' || targetCategory === 'all') {
      if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
        promises.push(window.MkenSupabaseDb.fetchOrders(tenantSlug).catch(function () { return []; }));
      } else {
        promises.push(Promise.resolve([]));
      }
    } else {
      promises.push(Promise.resolve([]));
    }

    return Promise.all(promises).then(function (results) {
      var appointments = results[0] || [];
      var orders = results[1] || [];
      var targetsMap = {};

      appointments.forEach(function (apt) {
        var phone = cleanPhone(apt.phone);
        if (phone) {
          targetsMap[phone] = apt.customerName || apt.customer_name || 'عميل';
        }
      });

      orders.forEach(function (ord) {
        var phone = cleanPhone(ord.phone);
        if (phone) {
          targetsMap[phone] = ord.customerName || ord.customer_name || 'عميل';
        }
      });

      var list = [];
      for (var p in targetsMap) {
        if (targetsMap.hasOwnProperty(p)) {
          list.push({ phone: p, customerName: targetsMap[p] });
        }
      }
      return list;
    });
  }

  function launchMarketingCampaign() {
    if (isCampaignRunning) {
      toast('هناك حملة تسويقية قيد الإرسال حالياً', 'warning');
      return;
    }

    var msgTemplate = waCampMessage ? waCampMessage.value.trim() : '';
    if (!msgTemplate) {
      toast('الرجاء إدخال نص الرسالة الجماعية', 'warning');
      return;
    }

    var category = waCampTarget ? waCampTarget.value : 'all';

    if (!confirm('هل أنت متأكد من رغبتك في إطلاق هذه الحملة التسويقية؟ قد يتم إرسال رسائل جماعية للعديد من العملاء.')) {
      return;
    }

    isCampaignRunning = true;
    if (waCampLaunchBtn) {
      waCampLaunchBtn.disabled = true;
      waCampLaunchBtn.textContent = '⏳ جاري الإرسال...';
    }

    if (waCampProgressBlock) waCampProgressBlock.hidden = false;
    updateCampaignProgress(0, 0, 'جاري تحصيل بيانات العملاء المستهدفين...');

    getCampaignTargets(category)
      .then(function (targets) {
        if (targets.length === 0) {
          toast('لا يوجد عملاء مستهدفين مسجلين في هذه الفئة', 'warning');
          resetCampaignState();
          return;
        }

        toast('تم العثور على ' + targets.length + ' عميل مستهدف. بدء الإرسال المتتابع...');
        sendCampaignSequentially(targets, msgTemplate, 0);
      })
      .catch(function (err) {
        toast('فشل تحصيل بيانات العملاء: ' + err.message, 'error');
        resetCampaignState();
      });
  }

  function resetCampaignState() {
    isCampaignRunning = false;
    if (waCampLaunchBtn) {
      waCampLaunchBtn.disabled = false;
      waCampLaunchBtn.textContent = '🚀 إطلاق الحملة الآن';
    }
  }

  function updateCampaignProgress(current, total, label) {
    if (waCampStatusLabel) waCampStatusLabel.textContent = label;
    if (waCampProgressText) waCampProgressText.textContent = current + ' / ' + total;
    if (waCampProgressBar) {
      var pct = total > 0 ? Math.round((current / total) * 100) : 0;
      waCampProgressBar.style.width = pct + '%';
    }
  }

  function sendCampaignSequentially(targets, msgTemplate, index) {
    if (index >= targets.length) {
      toast('🎉 تم إرسال الحملة التسويقية بالكامل بنجاح!');
      updateCampaignProgress(targets.length, targets.length, 'تم إنهاء الإرسال بنجاح!');
      setTimeout(function () {
        if (waCampProgressBlock) waCampProgressBlock.hidden = true;
        resetCampaignState();
        loadLogs();
      }, 3000);
      return;
    }

    var client = targets[index];
    var config = store.loadConfig();
    var brandName = (config.brand && config.brand.name) || 'مكِّن';

    var customizedMsg = msgTemplate
      .replace(/{customerName}/g, client.customerName)
      .replace(/{brandName}/g, brandName);

    updateCampaignProgress(index, targets.length, 'جاري إرسال الرسالة إلى: ' + client.phone);

    if (window.MkenWhatsappAutomation && window.MkenWhatsappAutomation.sendMessage) {
      window.MkenWhatsappAutomation.sendMessage(client.phone, customizedMsg, 'marketing_campaign', null, config)
        .then(function () {
          sendNextCampaign(targets, msgTemplate, index + 1);
        })
        .catch(function (err) {
          console.warn('Failed to send marketing message to:', client.phone, err);
          sendNextCampaign(targets, msgTemplate, index + 1);
        });
    } else {
      toast('فشل الإرسال: بوابة الواتساب غير متصلة', 'error');
      resetCampaignState();
    }
  }

  function sendNextCampaign(targets, msgTemplate, nextIndex) {
    setTimeout(function () {
      sendCampaignSequentially(targets, msgTemplate, nextIndex);
    }, 1500);
  }

  // --- Sub-tab Navigation binding ---
  var subTabs = document.querySelectorAll('.wa-sub-tab');
  var subPanels = document.querySelectorAll('.wa-sub-panel');
  subTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-sub-tab');
      
      subTabs.forEach(function (t) {
        t.className = 'btn btn--sm wa-sub-tab ' + (t.getAttribute('data-sub-tab') === target ? 'btn--primary' : 'btn--outline');
      });

      var targetId = '';
      if (target === 'logs-reports') targetId = 'waSubPanelLogsReports';
      else if (target === 'crm-chats') targetId = 'waSubPanelCrmChats';
      else if (target === 'marketing') targetId = 'waSubPanelMarketing';
      
      subPanels.forEach(function (panel) {
        panel.hidden = panel.id !== targetId;
      });

      if (target === 'crm-chats') {
        loadCrmChats();
      } else if (target === 'logs-reports') {
        loadLogs();
      }
    });
  });

  // Event Listeners
  if (refreshBtn) refreshBtn.addEventListener('click', function () {
    loadLogs();
    if (activeChatPhone) {
      loadCrmChats();
    }
  });
  if (clearBtn) clearBtn.addEventListener('click', clearAllLogs);
  if (searchPhone) searchPhone.addEventListener('input', renderLogs);
  if (filterStatus) filterStatus.addEventListener('change', renderLogs);

  if (waCrmSearchPhoneInput) waCrmSearchPhoneInput.addEventListener('input', renderCrmSidebar);
  if (waCrmSendReplyBtn) waCrmSendReplyBtn.addEventListener('click', sendCrmReply);
  if (waCrmReplyMessage) {
    waCrmReplyMessage.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        sendCrmReply();
      }
    });
  }

  if (waCampLaunchBtn) waCampLaunchBtn.addEventListener('click', launchMarketingCampaign);

  // Export module
  window.MkenAdminWhatsappLogs = {
    refresh: loadLogs,
    loadCrmChats: loadCrmChats,
    sendCrmReply: sendCrmReply,
    launchMarketingCampaign: launchMarketingCampaign
  };
})();

