/**
 * أتمتة رسائل الواتساب والتذكيرات — منصة رونق
 */
(function () {
  'use strict';

  function cleanPhone(phone) {
    var store = window.RonaqServicesStore;
    var digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (store && store.normalizePhone) {
      digits = store.normalizePhone(phone);
    }
    return digits;
  }

  function getWhatsAppConfig(config) {
    var store = window.RonaqServicesStore;
    var cfg = config || (store && store.loadConfig()) || {};
    return cfg.whatsappApi || { enabled: false, provider: 'none' };
  }

  function sendWhatsAppMessage(to, body, eventType, appointment, config) {
    var waConfig = getWhatsAppConfig(config);
    if (!waConfig.enabled || waConfig.provider === 'none') {
      return Promise.reject(new Error('WhatsApp API disabled or not configured'));
    }

    var phone = cleanPhone(to);
    if (!phone) {
      return Promise.reject(new Error('Invalid phone number'));
    }

    switch (waConfig.provider) {
      case 'ultramsg':
        return sendUltramsg(phone, body, waConfig.instanceId, waConfig.token);
      case 'twilio':
        return sendTwilio(phone, body, waConfig.accountSid, waConfig.token, waConfig.fromNumber);
      case 'custom':
        return sendCustom(phone, body, waConfig.url, waConfig.token, eventType, appointment);
      default:
        return Promise.reject(new Error('Unknown WhatsApp provider: ' + waConfig.provider));
    }
  }

  function sendUltramsg(phone, body, instanceId, token) {
    if (!instanceId || !token) {
      return Promise.reject(new Error('Missing Ultramsg instanceId or token'));
    }
    var url = 'https://api.ultramsg.com/' + instanceId + '/messages/chat';
    var params = new URLSearchParams();
    params.append('token', token);
    params.append('to', phone);
    params.append('body', body);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).then(function (res) {
      if (!res.ok) throw new Error('Ultramsg API error: HTTP Status ' + res.status);
      return res.json();
    });
  }

  function sendTwilio(phone, body, accountSid, token, fromNumber) {
    if (!accountSid || !token || !fromNumber) {
      return Promise.reject(new Error('Missing Twilio credentials'));
    }
    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json';
    var formattedTo = '+' + phone;
    var params = new URLSearchParams();
    params.append('Body', body);
    params.append('From', 'whatsapp:' + fromNumber.replace(/^\+?/, '+'));
    params.append('To', 'whatsapp:' + formattedTo);

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

  function sendCustom(phone, body, webhookUrl, token, eventType, appointment) {
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

    return fetch(webhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('Custom webhook error: HTTP Status ' + res.status);
      return res.text();
    });
  }

  function sendConfirmationMessage(appointment, config) {
    var store = window.RonaqServicesStore;
    var bookingStore = window.RonaqBookingStore;
    if (!store || !bookingStore) return Promise.reject(new Error('Stores not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var message = bookingStore.buildWhatsAppMessage(
      brandName,
      appointment,
      serviceTitle,
      activityTitle
    );

    // Replace first header line with confirmation header
    message = message.replace('طلب حجز موعد', 'تم تأكيد موعدك بنجاح');
    message = message.replace('يُرجى تأكيد الموعد', 'نتطلع لخدمتك!');

    return sendWhatsAppMessage(appointment.phone, message, 'confirmation', appointment, config);
  }

  function sendReminderMessage(appointment, hoursBefore, config) {
    var store = window.RonaqServicesStore;
    var bookingStore = window.RonaqBookingStore;
    if (!store || !bookingStore) return Promise.reject(new Error('Stores not loaded'));

    var brandName = store.getBrand(config).name;
    var service = store.getServiceById(appointment.serviceId);
    var serviceTitle = service ? service.title : appointment.serviceId;
    var act = store.getResolvedActivity(appointment.activityId, config);
    var activityTitle = act ? act.title : '';

    var message = bookingStore.buildReminderMessage(
      brandName,
      appointment,
      serviceTitle,
      activityTitle,
      hoursBefore
    );

    return sendWhatsAppMessage(appointment.phone, message, 'reminder', appointment, config);
  }

  function processAutomatedReminders(config) {
    var store = window.RonaqServicesStore;
    var bookingStore = window.RonaqBookingStore;
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

  window.RonaqWhatsappAutomation = {
    sendConfirmation: sendConfirmationMessage,
    sendReminder: sendReminderMessage,
    processQueue: processAutomatedReminders,
    sendMessage: sendWhatsAppMessage,
  };
})();
