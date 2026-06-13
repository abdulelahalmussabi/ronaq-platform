/**
 * أتمتة رسائل الواتساب والتذكيرات — منصة رونق
 */
(function () {
  'use strict';

  function cleanPhone(phone) {
    var store = window.MkenServicesStore;
    var digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (store && store.normalizePhone) {
      digits = store.normalizePhone(phone);
    }
    return digits;
  }

  function getWhatsAppConfig(config) {
    var store = window.MkenServicesStore;
    var cfg = config || (store && store.loadConfig()) || {};
    return cfg.whatsappApi || { enabled: false, provider: 'none' };
  }

  function reminderLeadText(hoursBefore) {
    if (hoursBefore >= 24 && hoursBefore % 24 === 0) {
      var days = hoursBefore / 24;
      return days === 1 ? 'غداً' : 'خلال ' + days + ' أيام';
    }
    if (hoursBefore === 1) return 'خلال ساعة';
    return 'خلال ' + hoursBefore + ' ساعات';
  }

  function parseTemplate(templateText, data) {
    if (!templateText) return '';
    var text = templateText;
    text = text.replace(/{brandName}/g, data.brandName || '');
    text = text.replace(/{customerName}/g, data.customerName || '');
    text = text.replace(/{phone}/g, data.phone || '');
    text = text.replace(/{serviceTitle}/g, data.serviceTitle || '');
    text = text.replace(/{activityTitle}/g, data.activityTitle || '');
    text = text.replace(/{date}/g, data.date || '');
    text = text.replace(/{time}/g, data.time || '');
    text = text.replace(/{appointmentId}/g, data.appointmentId || '');
    text = text.replace(/{orderId}/g, data.orderId || '');
    text = text.replace(/{orderItems}/g, data.orderItems || '');
    text = text.replace(/{hoursBefore}/g, data.hoursBefore || '');
    text = text.replace(/{reminderLeadText}/g, data.reminderLeadText || '');
    return text;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractTemplateParameters(templateText, bodyText) {
    if (!templateText) return [bodyText];

    var placeholders = [];
    var regex = /\{[a-zA-Z0-9_]+\}/g;
    var match;
    while ((match = regex.exec(templateText)) !== null) {
      placeholders.push(match[0]);
    }

    if (placeholders.length === 0) {
      return [bodyText];
    }

    var temp = templateText;
    placeholders.forEach(function (ph) {
      temp = temp.replace(ph, '__CAP_VAR__');
    });

    var escaped = escapeRegExp(temp);
    var patternStr = '^' + escaped.replace(/__CAP_VAR__/g, '([\\s\\S]*?)') + '$';

    try {
      var pattern = new RegExp(patternStr);
      var bodyMatch = bodyText.match(pattern);
      if (bodyMatch) {
        var params = [];
        for (var i = 1; i < bodyMatch.length; i++) {
          params.push(bodyMatch[i].trim());
        }
        return params;
      }
    } catch (e) {
      console.warn('Failed to parse template regex matcher', e);
    }

    return [bodyText];
  }


  function sendWhatsAppMessage(to, body, eventType, appointment, config, imageUrl) {
    var waConfig = getWhatsAppConfig(config);
    if (!waConfig.enabled || waConfig.provider === 'none') {
      return Promise.reject(new Error('WhatsApp API disabled or not configured'));
    }

    var phone = cleanPhone(to);
    if (!phone) {
      return Promise.reject(new Error('Invalid phone number'));
    }

    var provider = waConfig.provider;
    var promise;
    switch (provider) {
      case 'ultramsg':
        promise = sendUltramsg(phone, body, waConfig.instanceId, waConfig.token, imageUrl);
        break;
      case 'twilio':
        promise = sendTwilio(phone, body, waConfig.accountSid, waConfig.token, waConfig.fromNumber, imageUrl);
        break;
      case 'custom':
        promise = sendCustom(phone, body, waConfig.url, waConfig.token, eventType, appointment, imageUrl);
        break;
      case 'whatsapp_business':
        var rawTemplateText = '';
        if (waConfig.templates) {
          var tKey = eventType;
          if (tKey === 'booking') tKey = 'confirmation';
          if (tKey === 'order') tKey = 'order_confirmation';
          rawTemplateText = waConfig.templates[tKey] || '';
        }
        promise = sendWhatsAppBusiness(
          phone,
          body,
          waConfig.phoneNumberId,
          waConfig.token,
          waConfig.templateName,
          waConfig.languageCode,
          imageUrl,
          waConfig.useMetaTemplateComponents,
          rawTemplateText
        );
        break;
      default:
        promise = Promise.reject(new Error('Unknown WhatsApp provider: ' + waConfig.provider));
    }

    return promise.then(function (result) {
      logWhatsappMessageLocalAndRemote({
        phone: phone,
        body: body,
        provider: provider,
        status: 'success',
        eventType: eventType,
        appointmentId: appointment ? appointment.id : null
      }, config);
      return result;
    }).catch(function (err) {
      logWhatsappMessageLocalAndRemote({
        phone: phone,
        body: body,
        provider: provider,
        status: 'failed',
        errorMessage: err.message || String(err),
        eventType: eventType,
        appointmentId: appointment ? appointment.id : null
      }, config);
      throw err;
    });
  }

  function sendUltramsg(phone, body, instanceId, token, imageUrl) {
    if (!instanceId || !token) {
      return Promise.reject(new Error('Missing Ultramsg instanceId or token'));
    }
    var useImage = !!imageUrl;
    var url = 'https://api.ultramsg.com/' + instanceId + (useImage ? '/messages/image' : '/messages/chat');
    var params = new URLSearchParams();
    params.append('token', token);
    params.append('to', phone);
    if (useImage) {
      params.append('image', imageUrl);
      params.append('caption', body);
    } else {
      params.append('body', body);
    }

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).then(function (res) {
      if (!res.ok) throw new Error('Ultramsg API error: HTTP Status ' + res.status);
      return res.json();
    });
  }

  function sendTwilio(phone, body, accountSid, token, fromNumber, imageUrl) {
    if (!accountSid || !token || !fromNumber) {
      return Promise.reject(new Error('Missing Twilio credentials'));
    }
    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json';
    var formattedTo = '+' + phone;
    var params = new URLSearchParams();
    params.append('Body', body);
    params.append('From', 'whatsapp:' + fromNumber.replace(/^\+?/, '+'));
    params.append('To', 'whatsapp:' + formattedTo);
    if (imageUrl) {
      params.append('MediaUrl', imageUrl);
    }

    var headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(accountSid + ':' + token)
    };

    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: params.toString()
    }).then(function (res) {
      if (!res.ok) throw new Error('Twilio API error: HTTP Status ' + res.status);
      return res.json();
    });
  }

  function sendWhatsAppBusiness(phone, body, phoneNumberId, token, templateName, languageCode, imageUrl, useMetaTemplateComponents, rawTemplateText) {
    if (!phoneNumberId || !token) {
      return Promise.reject(new Error('Missing WhatsApp Business credentials'));
    }
    var targetUrl = 'https://graph.facebook.com/v18.0/' + phoneNumberId + '/messages';
    var headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };

    var payload;
    if (imageUrl) {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "image",
        image: {
          link: imageUrl,
          caption: body
        }
      };
    } else if (templateName) {
      var parameters = [];
      if (useMetaTemplateComponents && rawTemplateText) {
        var paramVals = extractTemplateParameters(rawTemplateText, body);
        parameters = paramVals.map(function (val) {
          return {
            type: "text",
            text: val
          };
        });
      } else {
        parameters = [
          {
            type: "text",
            text: body
          }
        ];
      }

      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: languageCode || "ar"
          },
          components: [
            {
              type: "body",
              parameters: parameters
            }
          ]
        }
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: {
          body: body
        }
      };
    }


    var proxyUrl = '/api/webhook-proxy';
    return fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: targetUrl,
        headers: headers,
        body: payload
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (errData) {
          var errorMsg = (errData && errData.error && errData.error.message) || 'HTTP Status ' + res.status;
          throw new Error('WhatsApp Business API error: ' + errorMsg);
        }).catch(function () {
          throw new Error('WhatsApp Business API error: HTTP Status ' + res.status);
        });
      }
      return res.json();
    });
  }

  function sendCustom(phone, body, webhookUrl, token, eventType, appointment, imageUrl) {
    if (!webhookUrl) {
      return Promise.reject(new Error('Missing custom webhook URL'));
    }
    var headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    var payload = {
      to: phone,
      body: body,
      event: eventType,
      appointment: appointment
    };
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }

    var proxyUrl = '/api/webhook-proxy';
    return fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        headers: headers,
        body: payload
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('Custom Webhook error: HTTP Status ' + res.status);
      return res.text();
    });
  }

  function logWhatsappMessageLocalAndRemote(logObj, config) {
    var db = window.MkenSupabaseDb;
    var store = window.MkenServicesStore;
    var tenantSlug = store ? store.getCurrentTenantSlug() : 'default';

    if (db && db.isConfigured()) {
      db.logWhatsappMessage(logObj, tenantSlug).catch(function (err) {
        console.error('Failed to save log to Supabase:', err);
      });
    } else {
      try {
        var raw = localStorage.getItem('mken_whatsapp_logs');
        var logs = raw ? JSON.parse(raw) : [];
        logObj.id = 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
        logObj.createdAt = new Date().toISOString();
        logObj.retryCount = 0;
        logs.unshift(logObj);
        localStorage.setItem('mken_whatsapp_logs', JSON.stringify(logs.slice(0, 100)));
      } catch (e) {
        console.error('Failed to log message locally:', e);
      }
    }
  }

  function sendConfirmationMessage(appointment, config) {
    var store = window.MkenServicesStore;
    var bookingStore = window.MkenBookingStore;
    if (!store || !bookingStore) return Promise.reject(new Error('Stores not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var waConfig = getWhatsAppConfig(config);
    var customTemplate = waConfig.templates && waConfig.templates.confirmation;

    var message;
    if (customTemplate) {
      message = parseTemplate(customTemplate, {
        brandName: brandName,
        customerName: appointment.customerName,
        phone: appointment.phone,
        serviceTitle: serviceTitle,
        activityTitle: activityTitle,
        date: formatDateArabic(appointment.date),
        time: formatTimeArabic(appointment.time),
        appointmentId: appointment.id
      });
    } else {
      message = bookingStore.buildWhatsAppMessage(
        brandName,
        appointment,
        serviceTitle,
        activityTitle
      );
      message = message.replace('طلب حجز موعد', 'تم تأكيد موعدك بنجاح');
      message = message.replace('يُرجى تأكيد الموعد', 'نتطلع لخدمتك!');
    }

    var imageUrl = null;
    if (waConfig.sendQrCode) {
      imageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent('BOOKING-' + appointment.id);
    }

    return sendWhatsAppMessage(appointment.phone, message, 'confirmation', appointment, config, imageUrl);
  }

  function sendReminderMessage(appointment, hoursBefore, config) {
    var store = window.MkenServicesStore;
    var bookingStore = window.MkenBookingStore;
    if (!store || !bookingStore) return Promise.reject(new Error('Stores not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var waConfig = getWhatsAppConfig(config);
    var customTemplate = waConfig.templates && waConfig.templates.reminder;

    var message;
    if (customTemplate) {
      var leadText = reminderLeadText(hoursBefore);
      message = parseTemplate(customTemplate, {
        brandName: brandName,
        customerName: appointment.customerName,
        phone: appointment.phone,
        serviceTitle: serviceTitle,
        activityTitle: activityTitle,
        date: formatDateArabic(appointment.date),
        time: formatTimeArabic(appointment.time),
        appointmentId: appointment.id,
        hoursBefore: hoursBefore,
        reminderLeadText: leadText
      });
    } else {
      message = bookingStore.buildReminderMessage(
        brandName,
        appointment,
        serviceTitle,
        activityTitle,
        hoursBefore
      );
    }

    return sendWhatsAppMessage(appointment.phone, message, 'reminder', appointment, config);
  }

  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يونيو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  function formatDateArabic(dateStr) {
    try {
      var parts = dateStr.split('-');
      var d = new Date(parts[0], parts[1] - 1, parts[2] || 12);
      return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    } catch (e) {
      return dateStr;
    }
  }

  function formatTimeArabic(time) {
    try {
      var parts = time.split(':');
      var h = parseInt(parts[0], 10);
      var suffix = h < 12 ? 'صباحاً' : 'مساءً';
      var display = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return display + ':' + parts[1] + ' ' + suffix;
    } catch (e) {
      return time;
    }
  }

  function sendCancellationMessage(appointment, config) {
    var store = window.MkenServicesStore;
    if (!store) return Promise.reject(new Error('Store not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var waConfig = getWhatsAppConfig(config);
    var customTemplate = waConfig.templates && waConfig.templates.cancellation;

    var message;
    if (customTemplate) {
      message = parseTemplate(customTemplate, {
        brandName: brandName,
        customerName: appointment.customerName,
        phone: appointment.phone,
        serviceTitle: serviceTitle,
        activityTitle: activityTitle,
        date: formatDateArabic(appointment.date),
        time: formatTimeArabic(appointment.time),
        appointmentId: appointment.id
      });
    } else {
      var lines = [
        'تم إلغاء موعدك — ' + brandName,
        '━━━━━━━━━━━━━━',
        'مرحباً ' + appointment.customerName + '،',
        'نود إفادتك بأنه تم إلغاء موعدك:',
      ];
      if (activityTitle) lines.push('النشاط: ' + activityTitle);
      lines.push(
        'الخدمة: ' + serviceTitle,
        'التاريخ: ' + formatDateArabic(appointment.date),
        'الوقت: ' + formatTimeArabic(appointment.time)
      );
      lines.push('━━━━━━━━━━━━━━', 'نشكرك لتفهمك.');
      message = lines.join('\n');
    }

    return sendWhatsAppMessage(appointment.phone, message, 'cancellation', appointment, config);
  }

  function sendPostponementMessage(appointment, config) {
    var store = window.MkenServicesStore;
    if (!store) return Promise.reject(new Error('Store not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var waConfig = getWhatsAppConfig(config);
    var customTemplate = waConfig.templates && waConfig.templates.reschedule;

    var message;
    if (customTemplate) {
      message = parseTemplate(customTemplate, {
        brandName: brandName,
        customerName: appointment.customerName,
        phone: appointment.phone,
        serviceTitle: serviceTitle,
        activityTitle: activityTitle,
        date: formatDateArabic(appointment.date),
        time: formatTimeArabic(appointment.time),
        appointmentId: appointment.id
      });
    } else {
      var lines = [
        'تعديل موعدك — ' + brandName,
        '━━━━━━━━━━━━━━',
        'مرحباً ' + appointment.customerName + '،',
        'نود إفادتك بأنه تم تعديل موعد حجزك إلى:',
      ];
      if (activityTitle) lines.push('النشاط: ' + activityTitle);
      lines.push(
        'الخدمة: ' + serviceTitle,
        'التاريخ: ' + formatDateArabic(appointment.date),
        'الوقت: ' + formatTimeArabic(appointment.time)
      );
      if (appointment.partySize) lines.push('عدد الأشخاص: ' + appointment.partySize);
      if (appointment.nights) lines.push('عدد الليالي: ' + appointment.nights);
      if (appointment.locationAddress) lines.push('العنوان: ' + appointment.locationAddress);
      lines.push('━━━━━━━━━━━━━━', 'نتطلع لخدمتك!');
      message = lines.join('\n');
    }

    return sendWhatsAppMessage(appointment.phone, message, 'reschedule', appointment, config);
  }

  function sendOrderConfirmationMessage(order, config) {
    var store = window.MkenServicesStore;
    var orderStore = window.MkenOrderStore;
    if (!store || !orderStore) return Promise.reject(new Error('Stores not loaded'));

    var brandName = store.getBrand(config).name;
    var waConfig = getWhatsAppConfig(config);
    if (!waConfig.enabled || waConfig.sendOrderConfirmation === false) {
      return Promise.resolve();
    }

    var serviceTitle = order.serviceTitle || '';
    var activityTitle = order.activityTitle || '';

    var itemsList = Array.isArray(order.items) ? order.items : [];
    if (!itemsList.length && order.items) {
      try {
        itemsList = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      } catch (e) {}
    }

    var orderItemsText = '';
    itemsList.forEach(function (line, i) {
      var row = (i + 1) + '. ' + (line.icon || '🛒') + ' ' + line.serviceTitle + ' × ' + line.quantity;
      if (line.priceLabel) row += ' (' + line.priceLabel + ')';
      orderItemsText += (orderItemsText ? '\n' : '') + row;
    });

    var customTemplate = waConfig.templates && waConfig.templates.order_confirmation;
    var message;
    if (customTemplate) {
      message = parseTemplate(customTemplate, {
        brandName: brandName,
        customerName: order.customerName || order.customer_name,
        phone: order.phone,
        serviceTitle: serviceTitle,
        activityTitle: activityTitle,
        orderId: order.id,
        orderItems: orderItemsText
      });
    } else {
      message = orderStore.buildWhatsAppMessage(
        brandName,
        order,
        serviceTitle,
        activityTitle
      );
      message = message.replace('طلب شراء', 'تم دفع وتأكيد طلب الشراء بنجاح 🎉');
      message = message.replace('يُرجى تأكيد الطلب والسعر النهائي', 'تم سداد الحساب إلكترونياً بنجاح! شكراً لتعاملك معنا! سنقوم بالتوصيل قريباً.');
    }

    var imageUrl = null;
    if (waConfig.sendQrCode) {
      imageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent('ORDER-' + order.id);
    }

    return sendWhatsAppMessage(order.phone, message, 'order_confirmation', null, config, imageUrl);
  }

  function sendOwnerAlertMessage(data, type, config) {
    var store = window.MkenServicesStore;
    if (!store) return Promise.reject(new Error('Store not loaded'));

    var waConfig = getWhatsAppConfig(config);
    if (!waConfig.enabled || !waConfig.sendOwnerAlert) {
      return Promise.resolve();
    }

    var ownerPhone = waConfig.ownerAlertPhone || store.getBrand(config).phone || config.phone;
    ownerPhone = cleanPhone(ownerPhone);
    if (!ownerPhone) {
      return Promise.reject(new Error('Owner phone number not set'));
    }

    var brandName = store.getBrand(config).name;
    var lines = [];
    if (type === 'booking') {
      var sTitle = data.serviceTitle || '';
      if (!sTitle && data.serviceId) {
        var sObj = store.getServiceById(data.serviceId);
        sTitle = sObj ? sObj.title : data.serviceId;
      }
      lines = [
        '🔔 حجز جديد — ' + brandName,
        '━━━━━━━━━━━━━━',
        'تم تسجيل حجز موعد جديد:',
        'العميل: ' + (data.customerName || data.customer_name || ''),
        'الجوال: ' + (data.phone || ''),
        'الخدمة: ' + sTitle,
        'التاريخ: ' + formatDateArabic(data.date),
        'الوقت: ' + formatTimeArabic(data.time)
      ];
    } else {
      lines = [
        '🔔 طلب شراء جديد — ' + brandName,
        '━━━━━━━━━━━━━━',
        'تم تقديم طلب شراء جديد:',
        'العميل: ' + (data.customerName || data.customer_name || ''),
        'الجوال: ' + (data.phone || ''),
        'القيمة: ' + (data.priceLabel || data.paymentAmount || '')
      ];
    }
    lines.push('━━━━━━━━━━━━━━', 'يرجى مراجعة لوحة الإدارة.');
    var message = lines.join('\n');

    return sendWhatsAppMessage(ownerPhone, message, 'owner_alert', null, config);
  }

  function sendTechnicianAssignmentMessage(member, appointment, config) {
    var store = window.MkenServicesStore;
    if (!store) return Promise.reject(new Error('Store not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var phone = cleanPhone(member.phone);
    if (!phone) {
      return Promise.reject(new Error('Invalid staff phone number'));
    }

    var lines = [
      '🛠️ مهمة جديدة مسندة إليك — ' + brandName,
      '━━━━━━━━━━━━━━',
      'أهلاً ' + member.name + '،',
      'تم إسناد مهمة جديدة لك:',
      'العميل: ' + appointment.customerName,
      'الجوال: ' + appointment.phone,
      'الخدمة: ' + serviceTitle,
      'التاريخ: ' + formatDateArabic(appointment.date),
      'الوقت: ' + formatTimeArabic(appointment.time)
    ];
    if (activityTitle) lines.push('النشاط: ' + activityTitle);
    if (appointment.district) lines.push('الحي/المنطقة: ' + appointment.district);
    if (appointment.locationAddress) lines.push('العنوان: ' + appointment.locationAddress);
    if (appointment.notes) lines.push('ملاحظات: ' + appointment.notes);
    lines.push('━━━━━━━━━━━━━━', 'يرجى مراجعة تفاصيل المهمة.');
    var message = lines.join('\n');

    return sendWhatsAppMessage(phone, message, 'staff_assignment', appointment, config);
  }

  function processAutomatedReminders(config) {
    var store = window.MkenServicesStore;
    var bookingStore = window.MkenBookingStore;
    if (!store || !bookingStore) return;

    var waConfig = getWhatsAppConfig(config);
    if (!waConfig.enabled || !waConfig.sendReminder) return;

    var bookingSettings = bookingStore.getReminderSettings(store.getBooking(config));
    if (!bookingSettings.enabled) return;

    var appointments = bookingStore.getActiveAppointments();
    var due = bookingStore.getDueReminders(bookingSettings, appointments);

    due.forEach(function (item) {
      var apt = item.appointment;
      var hours = item.hoursBefore;

      console.log('Sending automated WhatsApp reminder for apt:', apt.id, 'hoursBefore:', hours);

      sendReminderMessage(apt, hours, config)
        .then(function () {
          console.log('Automated reminder sent successfully for:', apt.id);
          bookingStore.markReminderSent(apt.id, hours);
        })
        .catch(function (err) {
          console.error('Failed to send automated reminder for:', apt.id, err);
        });
    });
  }

  window.MkenWhatsappAutomation = {
    sendConfirmation: sendConfirmationMessage,
    sendReminder: sendReminderMessage,
    sendCancellation: sendCancellationMessage,
    sendPostponement: sendPostponementMessage,
    sendOrderConfirmation: sendOrderConfirmationMessage,
    sendOwnerAlert: sendOwnerAlertMessage,
    sendTechnicianAssignment: sendTechnicianAssignmentMessage,
    processQueue: processAutomatedReminders,
    sendMessage: sendWhatsAppMessage,
  };
})();
