/**
 * إدارة المواعيد — منصة رونق (data/appointments.json + localStorage)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'mken_platform_appointments';
  var PENDING_KEY = 'mken_platform_pending';
  var APPOINTMENTS_URL = 'data/appointments.json';

  var _data = null;
  var _source = 'default';
  var _ready = null;

  var AR_MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  var AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatDateISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseDateISO(str) {
    return new Date(str + 'T12:00:00');
  }

  function timeToMinutes(t) {
    var parts = (t || '').split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  }

  function minutesToTime(m) {
    var h = Math.floor(m / 60);
    var min = m % 60;
    return pad(h) + ':' + pad(min);
  }

  function generateId() {
    return 'apt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function normalizeAppointment(raw) {
    if (!raw) return null;
    return {
      id: raw.id || generateId(),
      activityId: (raw.activityId || '').trim(),
      serviceId: raw.serviceId || '',
      date: raw.date || '',
      time: raw.time || '',
      customerName: (raw.customerName || '').trim(),
      phone: (raw.phone || '').trim(),
      district: (raw.district || '').trim(),
      locationAddress: (raw.locationAddress || '').trim(),
      notes: (raw.notes || '').trim(),
      partySize: raw.partySize != null && raw.partySize !== '' ? Number(raw.partySize) : null,
      nights: raw.nights != null && raw.nights !== '' ? Number(raw.nights) : null,
      stayUnit: raw.stayUnit || '',
      stayBooking: raw.stayBooking === true,
      status: raw.status === 'cancelled' ? 'cancelled' : (raw.status === 'pending' ? 'pending' : 'confirmed'),
      remindersSent: Array.isArray(raw.remindersSent)
        ? raw.remindersSent.filter(function (h) { return typeof h === 'number' && h > 0; })
        : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      paymentStatus: raw.paymentStatus || 'unpaid',
      paymentId: raw.paymentId || null,
      paymentMethod: raw.paymentMethod || null,
      paymentAmount: raw.paymentAmount != null && raw.paymentAmount !== '' ? Number(raw.paymentAmount) : null,
    };
  }

  function normalizeData(raw) {
    var list = Array.isArray(raw && raw.appointments) ? raw.appointments : [];
    return {
      appointments: list.map(normalizeAppointment).filter(Boolean),
      updatedAt: (raw && raw.updatedAt) || null,
    };
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return null;
  }

  function fetchServerData() {
    return fetch(APPOINTMENTS_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(normalizeData);
  }

  function pickData(serverData, localData) {
    if (serverData && localData) {
      var serverTime = serverData.updatedAt ? Date.parse(serverData.updatedAt) : 0;
      var localTime = localData.updatedAt ? Date.parse(localData.updatedAt) : 0;
      if (localTime > serverTime) {
        _source = 'local';
        return localData;
      }
      _source = 'server';
      return serverData;
    }
    if (localData) {
      _source = 'local';
      return localData;
    }
    if (serverData) {
      _source = 'server';
      return serverData;
    }
    _source = 'default';
    return normalizeData(null);
  }

  function init() {
    if (_ready) return _ready;
    var localData = loadFromStorage();

    _ready = fetchServerData()
      .then(function (serverData) { return pickData(serverData, localData); })
      .catch(function () {
        if (localData) {
          _source = 'local';
          return localData;
        }
        _source = 'default';
        return normalizeData(null);
      })
      .then(function (data) {
        if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
          var tenantSlug = window.MkenServicesStore ? window.MkenServicesStore.getCurrentTenantSlug() : null;
          return window.MkenSupabaseDb.fetchAppointments(tenantSlug)
            .then(function (dbApts) {
              _source = 'supabase';
              return {
                appointments: dbApts.map(normalizeAppointment).filter(Boolean),
                updatedAt: new Date().toISOString(),
              };
            })
            .catch(function (err) {
              console.warn('Failed to fetch appointments from Supabase, using local/server data', err);
              return data;
            });
        }
        return data;
      })
      .then(function (data) {
        _data = data;
        return data;
      });

    return _ready;
  }

  function reload() {
    _ready = null;
    _data = null;
    return init();
  }

  function loadData() {
    return _data ? {
      appointments: _data.appointments.slice(),
      updatedAt: _data.updatedAt,
    } : normalizeData(null);
  }

  function saveData(data) {
    _data = normalizeData(data);
    _data.updatedAt = new Date().toISOString();
    _source = 'local';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = window.MkenServicesStore ? window.MkenServicesStore.getCurrentTenantSlug() : null;
      _ready = window.MkenSupabaseDb.saveAppointmentsBulk(_data.appointments, tenantSlug)
        .then(function () {
          _source = 'supabase';
          return _data;
        })
        .catch(function (err) {
          console.error('Failed to sync bulk appointments to Supabase', err);
          return _data;
        });
    } else {
      _ready = Promise.resolve(_data);
    }
    return _data;
  }

  function getAppointments() {
    return loadData().appointments;
  }

  function getActiveAppointments() {
    return getAppointments().filter(function (a) {
      return a.status === 'confirmed' || a.status === 'pending';
    });
  }

  function getAppointmentsByService(serviceId) {
    return getActiveAppointments().filter(function (a) {
      return a.serviceId === serviceId;
    });
  }

  function getAppointmentsByDate(dateStr) {
    return getActiveAppointments().filter(function (a) {
      return a.date === dateStr;
    });
  }

  function addAppointment(appointment) {
    var data = loadData();
    var apt = normalizeAppointment(appointment);
    data.appointments.push(apt);
    return saveData(data);
  }

  function updateAppointment(id, patch) {
    var data = loadData();
    var found = false;
    data.appointments = data.appointments.map(function (a) {
      if (a.id !== id) return a;
      found = true;
      return normalizeAppointment(Object.assign({}, a, patch, { id: a.id }));
    });
    if (!found) return null;
    return saveData(data);
  }

  function removeAppointment(id) {
    var data = loadData();
    data.appointments = data.appointments.filter(function (a) {
      return a.id !== id;
    });
    
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      window.MkenSupabaseDb.deleteAppointment(id).catch(function (err) {
        console.error('Failed to delete appointment from Supabase', err);
      });
    }
    
    return saveData(data);
  }

  function getPendingRequests() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function clearPendingRequest(id) {
    var list = getPendingRequests().filter(function (r) {
      return r.id !== id;
    });
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    return list;
  }

  function exportData() {
    return JSON.stringify(loadData(), null, 2);
  }

  function importData(json) {
    var parsed = JSON.parse(json);
    if (!Array.isArray(parsed.appointments)) throw new Error('صيغة غير صالحة');
    return saveData(parsed);
  }

  function downloadFile() {
    var blob = new Blob([exportData()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'appointments.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function isWorkingDay(dateStr, booking) {
    var day = parseDateISO(dateStr).getDay();
    return booking.workingDays.indexOf(day) !== -1;
  }

  function getDateRange(booking) {
    var days = booking.advanceDays || 14;
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var end = new Date(start);
    end.setDate(end.getDate() + days);
    return { start: start, end: end };
  }

  function isDateBookable(dateStr, booking) {
    var range = getDateRange(booking);
    var date = parseDateISO(dateStr);
    if (date < range.start || date > range.end) return false;
    return isWorkingDay(dateStr, booking);
  }

  function isStayBooking(booking) {
    return !!(booking && (booking.type === 'stay' || booking.skipTimeSelection));
  }

  function getRoomCapacity(service, booking) {
    var rooms = service && parseInt(service.roomCount, 10);
    if (rooms >= 1) return rooms;
    return Math.max(1, parseInt(booking && booking.maxPerSlot, 10) || 1);
  }

  function getStayDurationDays(amount, stayUnit) {
    var n = Math.max(1, parseInt(amount, 10) || 1);
    return stayUnit === 'month' ? n * 30 : n;
  }

  function bookingOccupiesDate(apt, dateStr) {
    if (!apt || !apt.date) return false;
    var start = parseDateISO(apt.date);
    var days = getStayDurationDays(apt.nights, apt.stayUnit);
    var end = new Date(start);
    end.setDate(end.getDate() + days);
    var day = parseDateISO(dateStr);
    return day >= start && day < end;
  }

  function countBookingsOnDate(serviceId, dateStr, appointments) {
    return (appointments || getActiveAppointments()).filter(function (a) {
      return a.serviceId === serviceId && a.status === 'confirmed' && bookingOccupiesDate(a, dateStr);
    }).length;
  }

  function isStayRangeAvailable(serviceId, checkIn, duration, service, booking, appointments) {
    var capacity = getRoomCapacity(service, booking);
    var days = getStayDurationDays(duration, service && service.stayUnit);
    var i;
    for (i = 0; i < days; i++) {
      var day = new Date(parseDateISO(checkIn));
      day.setDate(day.getDate() + i);
      if (countBookingsOnDate(serviceId, formatDateISO(day), appointments) >= capacity) {
        return false;
      }
    }
    return true;
  }

  function getSlotsForDate(serviceId, dateStr, booking, appointments, service) {
    if (!isDateBookable(dateStr, booking)) return [];

    if (isStayBooking(booking)) {
      var checkIn = booking.checkInTime || '15:00';
      return isStayRangeAvailable(serviceId, dateStr, 1, service, booking, appointments) ? [checkIn] : [];
    }

    var startMin = timeToMinutes(booking.workingHours.start);
    var endMin = timeToMinutes(booking.workingHours.end);
    var duration = booking.slotDuration || 30;
    var slots = [];
    var t;

    for (t = startMin; t + duration <= endMin; t += duration) {
      slots.push(minutesToTime(t));
    }

    var todayStr = formatDateISO(new Date());
    if (dateStr === todayStr) {
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      slots = slots.filter(function (s) {
        return timeToMinutes(s) > nowMin;
      });
    }

    var capacity = getRoomCapacity(service, booking);
    var booked = (appointments || getActiveAppointments()).filter(function (a) {
      return a.date === dateStr && a.serviceId === serviceId && a.status === 'confirmed';
    });

    return slots.filter(function (slot) {
      var count = booked.filter(function (a) { return a.time === slot; }).length;
      return count < capacity;
    });
  }

  function getAvailableDates(serviceId, booking, appointments, service) {
    var range = getDateRange(booking);
    var dates = [];
    var cursor = new Date(range.start);

    while (cursor <= range.end) {
      var dateStr = formatDateISO(cursor);
      if (getSlotsForDate(serviceId, dateStr, booking, appointments, service).length) {
        dates.push(dateStr);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  function addPendingRequest(request) {
    var apt = {
      id: request.id || generateId(),
      createdAt: request.createdAt || new Date().toISOString(),
      activityId: request.activityId || '',
      serviceId: request.serviceId || '',
      date: request.date || '',
      time: request.time || '',
      customerName: request.customerName || '',
      phone: request.phone || '',
      district: request.district || '',
      locationAddress: request.locationAddress || '',
      partySize: request.partySize != null && request.partySize !== '' ? Number(request.partySize) : null,
      nights: request.nights != null && request.nights !== '' ? Number(request.nights) : null,
      stayUnit: request.stayUnit || '',
      stayBooking: request.stayBooking === true,
      notes: request.notes || '',
      status: request.status || 'pending',
      remindersSent: [],
      paymentStatus: request.paymentStatus || 'unpaid',
      paymentId: request.paymentId || null,
      paymentMethod: request.paymentMethod || null,
      paymentAmount: request.paymentAmount != null && request.paymentAmount !== '' ? Number(request.paymentAmount) : null,
    };

    try {
      var list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
      list.push(Object.assign({}, apt, {
        activityTitle: request.activityTitle || '',
        serviceTitle: request.serviceTitle || '',
      }));
      localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save pending request to localStorage', e);
    }

    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = window.MkenServicesStore ? window.MkenServicesStore.getCurrentTenantSlug() : null;
      window.MkenSupabaseDb.saveAppointment(apt, tenantSlug).catch(function (err) {
        console.error('Failed to save pending request to Supabase', err);
      });
    }

    return 1;
  }

  function formatDateArabic(dateStr) {
    var d = parseDateISO(dateStr);
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatTimeArabic(time) {
    var parts = time.split(':');
    var h = parseInt(parts[0], 10);
    var suffix = h < 12 ? 'صباحاً' : 'مساءً';
    var display = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return display + ':' + parts[1] + ' ' + suffix;
  }

  var DEFAULT_REMINDERS = {
    enabled: true,
    hoursBefore: [24, 2],
    windowMinutes: 60,
  };

  function getReminderSettings(booking) {
    var incoming = (booking && booking.reminders) || {};
    var hours = Array.isArray(incoming.hoursBefore) ? incoming.hoursBefore.slice() : DEFAULT_REMINDERS.hoursBefore.slice();
    hours = hours
      .map(function (h) { return parseInt(h, 10); })
      .filter(function (h) { return h > 0 && h <= 168; })
      .sort(function (a, b) { return b - a; });
    if (!hours.length) hours = DEFAULT_REMINDERS.hoursBefore.slice();
    return {
      enabled: incoming.enabled !== false,
      hoursBefore: hours,
      windowMinutes: Math.min(240, Math.max(15, parseInt(incoming.windowMinutes, 10) || DEFAULT_REMINDERS.windowMinutes)),
    };
  }

  function appointmentToDateTime(apt) {
    return new Date((apt.date || '') + 'T' + (apt.time || '00:00') + ':00');
  }

  function isReminderDue(apt, hoursBefore, settings, now) {
    if (!apt || apt.status !== 'confirmed') return false;
    now = now || new Date();
    var aptTime = appointmentToDateTime(apt);
    if (aptTime <= now) return false;
    if ((apt.remindersSent || []).indexOf(hoursBefore) !== -1) return false;

    var remindAt = new Date(aptTime.getTime() - hoursBefore * 60 * 60 * 1000);
    var windowEnd = new Date(remindAt.getTime() + settings.windowMinutes * 60 * 1000);
    return now >= remindAt && now < aptTime;
  }

  function getDueReminders(settings, appointments) {
    if (!settings || !settings.enabled) return [];
    var now = new Date();
    var results = [];
    var seen = {};

    (appointments || getActiveAppointments()).forEach(function (apt) {
      settings.hoursBefore.forEach(function (hours) {
        if (!isReminderDue(apt, hours, settings, now)) return;
        var key = apt.id + ':' + hours;
        if (seen[key]) return;
        seen[key] = true;
        var aptTime = appointmentToDateTime(apt);
        var remindAt = new Date(aptTime.getTime() - hours * 60 * 60 * 1000);
        var windowEnd = new Date(remindAt.getTime() + settings.windowMinutes * 60 * 1000);
        results.push({
          appointment: apt,
          hoursBefore: hours,
          overdue: now > windowEnd,
        });
      });
    });

    results.sort(function (a, b) {
      var ta = appointmentToDateTime(a.appointment).getTime();
      var tb = appointmentToDateTime(b.appointment).getTime();
      if (ta !== tb) return ta - tb;
      return b.hoursBefore - a.hoursBefore;
    });

    return results;
  }

  function markReminderSent(id, hoursBefore) {
    var apt = getAppointments().find(function (a) { return a.id === id; });
    if (!apt) return null;
    var sent = (apt.remindersSent || []).slice();
    if (sent.indexOf(hoursBefore) === -1) sent.push(hoursBefore);
    return updateAppointment(id, { remindersSent: sent });
  }

  function reminderLeadText(hoursBefore) {
    if (hoursBefore >= 24 && hoursBefore % 24 === 0) {
      var days = hoursBefore / 24;
      return days === 1 ? 'غداً' : 'خلال ' + days + ' أيام';
    }
    if (hoursBefore === 1) return 'خلال ساعة';
    return 'خلال ' + hoursBefore + ' ساعات';
  }

  function buildReminderMessage(brandName, appointment, serviceTitle, activityTitle, hoursBefore) {
    var lines = [
      'تذكير بموعدك — ' + brandName,
      '━━━━━━━━━━━━━━',
      'مرحباً ' + appointment.customerName + '،',
      'نذكّرك بموعدك ' + reminderLeadText(hoursBefore) + ':',
    ];
    if (activityTitle) lines.push('النشاط: ' + activityTitle);
    lines.push('الخدمة: ' + serviceTitle);
    lines.push((appointment.stayBooking ? 'تاريخ الوصول: ' : 'التاريخ: ') + formatDateArabic(appointment.date));
    lines.push((appointment.stayBooking ? 'تسجيل الوصول: ' : 'الوقت: ') + formatTimeArabic(appointment.time));
    if (appointment.partySize) lines.push('عدد الضيوف: ' + appointment.partySize);
    if (appointment.nights) {
      lines.push((appointment.stayUnit === 'month' ? 'عدد الأشهر: ' : 'عدد الليالي: ') + appointment.nights);
    }
    if (appointment.locationAddress) lines.push('العنوان: ' + appointment.locationAddress);
    lines.push('━━━━━━━━━━━━━━', 'نتطلع لرؤيتك!', 'للاستفسار رد على هذه الرسالة.');
    return lines.join('\n');
  }

  function customerWhatsAppUrl(phone, message) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
  }

  function buildWhatsAppMessage(brandName, appointment, serviceTitle, activityTitle) {
    var lines = [
      'طلب حجز موعد — ' + brandName,
      '━━━━━━━━━━━━━━',
    ];
    if (activityTitle) lines.push('النشاط: ' + activityTitle);
    lines.push('الخدمة: ' + serviceTitle);
    lines.push((appointment.stayBooking ? 'تاريخ الوصول: ' : 'التاريخ: ') + formatDateArabic(appointment.date));
    lines.push((appointment.stayBooking ? 'تسجيل الوصول: ' : 'الوقت: ') + formatTimeArabic(appointment.time));
    lines.push('الاسم: ' + appointment.customerName);
    lines.push('الجوال: ' + appointment.phone);
    if (appointment.district) lines.push('الحي/المنطقة: ' + appointment.district);
    if (appointment.partySize) lines.push('عدد الأشخاص: ' + appointment.partySize);
    if (appointment.nights) {
      lines.push((appointment.stayUnit === 'month' ? 'عدد الأشهر: ' : 'عدد الليالي: ') + appointment.nights);
    }
    if (appointment.locationAddress) lines.push('العنوان: ' + appointment.locationAddress);
    if (appointment.notes) lines.push('ملاحظات: ' + appointment.notes);
    lines.push('━━━━━━━━━━━━━━', 'يُرجى تأكيد الموعد');
    return lines.join('\n');
  }

  window.MkenBookingStore = {
    STORAGE_KEY: STORAGE_KEY,
    APPOINTMENTS_URL: APPOINTMENTS_URL,
    AR_MONTHS: AR_MONTHS,
    AR_DAYS: AR_DAYS,
    init: init,
    reload: reload,
    loadData: loadData,
    saveData: saveData,
    getAppointments: getAppointments,
    getActiveAppointments: getActiveAppointments,
    getAppointmentsByService: getAppointmentsByService,
    getAppointmentsByDate: getAppointmentsByDate,
    getSlotsForDate: getSlotsForDate,
    getAvailableDates: getAvailableDates,
    isStayBooking: isStayBooking,
    isStayRangeAvailable: isStayRangeAvailable,
    getRoomCapacity: getRoomCapacity,
    addAppointment: addAppointment,
    updateAppointment: updateAppointment,
    removeAppointment: removeAppointment,
    addPendingRequest: addPendingRequest,
    getPendingRequests: getPendingRequests,
    clearPendingRequest: clearPendingRequest,
    exportData: exportData,
    importData: importData,
    downloadFile: downloadFile,
    formatDateISO: formatDateISO,
    formatDateArabic: formatDateArabic,
    formatTimeArabic: formatTimeArabic,
    buildWhatsAppMessage: buildWhatsAppMessage,
    buildReminderMessage: buildReminderMessage,
    customerWhatsAppUrl: customerWhatsAppUrl,
    getReminderSettings: getReminderSettings,
    getDueReminders: getDueReminders,
    markReminderSent: markReminderSent,
    isReminderDue: isReminderDue,
    appointmentToDateTime: appointmentToDateTime,
    reminderLeadText: reminderLeadText,
    DEFAULT_REMINDERS: DEFAULT_REMINDERS,
    generateId: generateId,
    parseDateISO: parseDateISO,
  };
})();
