/**
 * إدارة تقويم المواعيد — منصة رونق (متعددة الأنشطة)
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  var bookingStore = window.RonaqBookingStore;
  if (!store || !bookingStore) return;

  var calYear, calMonth;
  var selectedDay = '';
  var editingId = null;
  var activityFilter = 'all';
  var serviceFilter = 'all';

  var adminCalendar = document.getElementById('adminCalendar');
  var adminCalTitle = document.getElementById('adminCalTitle');
  var adminAppointmentsList = document.getElementById('adminAppointmentsList');
  var adminDayTitle = document.getElementById('adminDayTitle');
  var calendarActivityFilter = document.getElementById('calendarActivityFilter');
  var calendarServiceFilter = document.getElementById('calendarServiceFilter');
  var pendingRequests = document.getElementById('pendingRequests');
  var dueReminders = document.getElementById('dueReminders');
  var appointmentModal = document.getElementById('appointmentModal');
  var appointmentForm = document.getElementById('appointmentForm');
  var remindersEnabled = document.getElementById('remindersEnabled');
  var reminderHoursInput = document.getElementById('reminderHoursInput');
  var reminderWindowInput = document.getElementById('reminderWindowInput');
  var saveReminderSettingsBtn = document.getElementById('saveReminderSettingsBtn');

  var reminderCheckTimer = null;
  var lastNotifiedCount = 0;

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    if (window.RonaqAdminToast) window.RonaqAdminToast(msg, type);
  }

  function getBookableServices() {
    var bookableIds = store.getBookableActivities().map(function (a) { return a.id; });
    return store.getEnabledServices().filter(function (s) {
      return bookableIds.indexOf(s.activityId) !== -1;
    });
  }

  function getServiceTitle(id) {
    var s = store.getServiceById(id);
    return s ? s.title : id;
  }

  function getServiceIcon(id) {
    var s = store.getServiceById(id);
    return s ? s.icon : '📅';
  }

  function getActivityTitle(id) {
    var a = store.getResolvedActivity(id);
    return a ? a.title : (id || '');
  }

  function getDurationForAppointment(apt) {
    var svc = store.getServiceById(apt.serviceId);
    var actId = resolveActivityId(apt);
    var b = store.getBookingForActivity(actId, store.loadConfig());
    if (svc && svc.slotDuration) {
      b = Object.assign({}, b, { slotDuration: svc.slotDuration });
    }
    return b.slotDuration || 30;
  }

  function buildMetaForAppointment(apt) {
    var actId = resolveActivityId(apt);
    return {
      brandName: store.getBrand(store.loadConfig()).name,
      activityTitle: getActivityTitle(actId),
      serviceTitle: getServiceTitle(apt.serviceId),
      durationMinutes: getDurationForAppointment(apt),
    };
  }

  function resolveActivityId(apt) {
    if (apt.activityId) return apt.activityId;
    var s = store.getServiceById(apt.serviceId);
    return s ? s.activityId : '';
  }

  function statusLabel(status) {
    if (status === 'confirmed') return 'مؤكد';
    if (status === 'pending') return 'قيد الانتظار';
    return 'ملغي';
  }

  function statusClass(status) {
    if (status === 'confirmed') return 'admin-apt--confirmed';
    if (status === 'pending') return 'admin-apt--pending';
    return 'admin-apt--cancelled';
  }

  function paymentStatusLabel(status) {
    if (status === 'paid') return 'مدفوع';
    if (status === 'failed') return 'فشل الدفع';
    if (status === 'refunded') return 'مسترجع';
    return 'غير مدفوع';
  }

  function paymentStatusClass(status) {
    if (status === 'paid') return 'admin-payment--paid';
    if (status === 'failed') return 'admin-payment--failed';
    if (status === 'refunded') return 'admin-payment--refunded';
    return 'admin-payment--unpaid';
  }

  function filterAppointments(list) {
    return list.filter(function (a) {
      var actId = resolveActivityId(a);
      if (activityFilter !== 'all' && actId !== activityFilter) return false;
      if (serviceFilter !== 'all' && a.serviceId !== serviceFilter) return false;
      return true;
    });
  }

  function getReminderConfig() {
    return bookingStore.getReminderSettings(store.getBooking(store.loadConfig()));
  }

  function loadReminderSettings() {
    var settings = getReminderConfig();
    if (remindersEnabled) remindersEnabled.checked = settings.enabled;
    if (reminderHoursInput) reminderHoursInput.value = settings.hoursBefore.join(', ');
    if (reminderWindowInput) reminderWindowInput.value = settings.windowMinutes;
  }

  function saveReminderSettings() {
    var hoursRaw = reminderHoursInput ? reminderHoursInput.value : '';
    var hours = hoursRaw.split(/[,،\s]+/).map(function (v) {
      return parseInt(v.trim(), 10);
    }).filter(function (h) { return h > 0 && h <= 168; });
    if (!hours.length) hours = [24, 2];

    var cfg = store.loadConfig();
    cfg.booking = Object.assign({}, cfg.booking || {}, {
      reminders: {
        enabled: remindersEnabled ? remindersEnabled.checked : true,
        hoursBefore: hours,
        windowMinutes: reminderWindowInput ? parseInt(reminderWindowInput.value, 10) || 60 : 60,
      },
    });
    store.saveConfig(cfg);
    renderDueReminders();
    toast('تم حفظ إعدادات التذكير');
  }

  function buildReminderUrl(apt, hoursBefore) {
    var actId = resolveActivityId(apt);
    var brandName = store.getBrand(store.loadConfig()).name;
    var message = bookingStore.buildReminderMessage(
      brandName,
      apt,
      getServiceTitle(apt.serviceId),
      getActivityTitle(actId),
      hoursBefore
    );
    return bookingStore.customerWhatsAppUrl(apt.phone, message);
  }

  function sendReminder(aptId, hoursBefore, silent, markSent) {
    var apt = bookingStore.getAppointments().find(function (a) { return a.id === aptId; });
    if (!apt) return false;
    var url = buildReminderUrl(apt, hoursBefore);
    if (!url) {
      if (!silent) toast('رقم جوال العميل غير صالح', 'error');
      return false;
    }
    window.open(url, '_blank', 'noopener');
    if (markSent !== false) {
      bookingStore.markReminderSent(aptId, hoursBefore);
      renderDueReminders();
    }
    if (!silent) toast('تم فتح واتساب — أرسل الرسالة للعميل');
    return true;
  }

  function notifyDueReminders(count) {
    if (!count || count === lastNotifiedCount) return;
    lastNotifiedCount = count;
    toast(count + ' تذكير واتساب مستحق — راجع القائمة أعلاه');
    var title = 'تذكير واتساب — مكِّن';
    var body = count + ' موعد يحتاج تذكيراً عبر واتساب';
    if (window.RonaqPwa && window.RonaqPwa.showLocalNotification(title, body, 'ronaq-reminders')) {
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body: body, tag: 'ronaq-reminders' });
    } catch (e) { /* ignore */ }
  }

  function requestNotificationPermission() {
    if (window.RonaqPwa && window.RonaqPwa.requestNotificationPermission) {
      return window.RonaqPwa.requestNotificationPermission();
    }
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
  }

  function renderDueReminders() {
    if (!dueReminders) return;
    var settings = getReminderConfig();
    if (!settings.enabled) {
      dueReminders.hidden = true;
      dueReminders.innerHTML = '';
      return;
    }

    var due = bookingStore.getDueReminders(settings, filterAppointments(bookingStore.getActiveAppointments()));
    if (!due.length) {
      dueReminders.hidden = true;
      dueReminders.innerHTML = '';
      lastNotifiedCount = 0;
      return;
    }

    dueReminders.hidden = false;
    dueReminders.innerHTML =
      '<div class="admin-reminders__header">' +
      '<h4>💬 تذكيرات واتساب مستحقة (' + due.length + ')</h4>' +
      '<button type="button" class="btn btn--primary btn--sm" id="sendNextReminderBtn">إرسال التالي</button>' +
      '</div>' +
      '<p class="admin-hint">يُفحص تلقائياً كل دقيقة — اضغط «إرسال» لفتح واتساب برسالة جاهزة للعميل.</p>' +
      due.map(function (item) {
        var apt = item.appointment;
        var actId = resolveActivityId(apt);
        var overdueTag = item.overdue ? ' <span class="admin-reminders__overdue">متأخر</span>' : '';
        return (
          '<div class="admin-reminders__item">' +
          '<div>' +
          '<strong>' + escHtml(apt.customerName) + '</strong>' + overdueTag +
          '<br><small>' + getServiceIcon(apt.serviceId) + ' ' + escHtml(getServiceTitle(apt.serviceId)) +
          (getActivityTitle(actId) ? ' · ' + escHtml(getActivityTitle(actId)) : '') +
          '<br>' + bookingStore.formatDateArabic(apt.date) + ' · ' + bookingStore.formatTimeArabic(apt.time) +
          ' · تذكير ' + bookingStore.reminderLeadText(item.hoursBefore) +
          '</small></div>' +
          '<button type="button" class="btn btn--primary btn--sm" data-send-reminder="' + apt.id + '" data-reminder-hours="' + item.hoursBefore + '">إرسال واتساب</button>' +
          '</div>'
        );
      }).join('');

    notifyDueReminders(due.length);

    var sendNextBtn = document.getElementById('sendNextReminderBtn');
    if (sendNextBtn) {
      sendNextBtn.addEventListener('click', function () {
        var first = due[0];
        if (first) sendReminder(first.appointment.id, first.hoursBefore);
      });
    }

    dueReminders.querySelectorAll('[data-send-reminder]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendReminder(
          btn.getAttribute('data-send-reminder'),
          parseInt(btn.getAttribute('data-reminder-hours'), 10)
        );
      });
    });
  }

  function startReminderPolling() {
    if (reminderCheckTimer) clearInterval(reminderCheckTimer);
    reminderCheckTimer = setInterval(function () {
      if (document.hidden) return;
      renderDueReminders();
    }, 60000);
  }

  function renderPending() {
    if (!pendingRequests) return;
    var list = bookingStore.getPendingRequests();
    if (!list.length) {
      pendingRequests.hidden = true;
      pendingRequests.innerHTML = '';
      return;
    }

    pendingRequests.hidden = false;
    pendingRequests.innerHTML =
      '<h4>طلبات حجز محلية (' + list.length + ')</h4>' +
      '<p class="admin-hint">طلبات أُرسلت من هذا المتصفح عبر واتساب — أكّدها لإضافتها للتقويم.</p>' +
      list.map(function (r) {
        var actLabel = r.activityTitle || getActivityTitle(r.activityId);
        return (
          '<div class="admin-pending__item">' +
          '<div><strong>' + escHtml(r.customerName) + '</strong>' +
          (actLabel ? ' · ' + escHtml(actLabel) : '') +
          '<br>' + getServiceIcon(r.serviceId) + ' ' + escHtml(r.serviceTitle || getServiceTitle(r.serviceId)) +
          '<br><small>' + bookingStore.formatDateArabic(r.date) + ' · ' +
          bookingStore.formatTimeArabic(r.time) + ' · ' + escHtml(r.phone) +
          (r.partySize ? ' · ' + r.partySize + ' ضيوف' : '') +
          (r.nights ? ' · ' + r.nights + ' ليلة' : '') +
          (r.locationAddress ? ' · ' + escHtml(r.locationAddress) : '') +
          '</small></div>' +
          '<div class="admin-pending__actions">' +
          '<button type="button" class="btn btn--primary btn--sm" data-confirm-pending="' + r.id + '">تأكيد</button>' +
          '<button type="button" class="btn btn--outline btn--sm" data-dismiss-pending="' + r.id + '">تجاهل</button>' +
          '</div></div>'
        );
      }).join('');

    pendingRequests.querySelectorAll('[data-confirm-pending]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-confirm-pending');
        var req = bookingStore.getPendingRequests().find(function (r) { return r.id === id; });
        if (!req) return;
        
        var apt = {
          id: req.id || bookingStore.generateId(),
          activityId: req.activityId || resolveActivityId(req),
          serviceId: req.serviceId,
          date: req.date,
          time: req.time,
          customerName: req.customerName,
          phone: req.phone,
          district: req.district,
          locationAddress: req.locationAddress,
          partySize: req.partySize,
          nights: req.nights,
          notes: req.notes,
          status: 'confirmed',
          createdAt: req.createdAt || new Date().toISOString()
        };
        
        bookingStore.addAppointment(apt);
        bookingStore.clearPendingRequest(id);
        
        var config = store.loadConfig();
        if (config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
          if (window.RonaqWhatsappAutomation) {
            window.RonaqWhatsappAutomation.sendConfirmation(apt, config)
              .catch(function (err) {
                console.error('Failed to send auto-confirmation:', err);
              });
          }
        }
        
        renderAll();
        toast('تم تأكيد الموعد ومزامنته سحابياً');
      });
    });

    pendingRequests.querySelectorAll('[data-dismiss-pending]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        bookingStore.clearPendingRequest(btn.getAttribute('data-dismiss-pending'));
        renderPending();
      });
    });
  }

  function renderCalendar() {
    if (!adminCalendar) return;

    adminCalTitle.textContent = bookingStore.AR_MONTHS[calMonth] + ' ' + calYear;

    var firstDay = new Date(calYear, calMonth, 1);
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var startOffset = firstDay.getDay();
    var todayStr = bookingStore.formatDateISO(new Date());
    var allApts = filterAppointments(bookingStore.getActiveAppointments());

    var html = bookingStore.AR_DAYS.map(function (d) {
      return '<div class="admin-calendar__head">' + d + '</div>';
    }).join('');

    var i;
    for (i = 0; i < startOffset; i++) {
      html += '<span class="admin-calendar__day admin-calendar__day--empty"></span>';
    }

    for (i = 1; i <= daysInMonth; i++) {
      var dateStr = bookingStore.formatDateISO(new Date(calYear, calMonth, i));
      var dayApts = allApts.filter(function (a) { return a.date === dateStr; });
      var cls = 'admin-calendar__day';
      if (dateStr === todayStr) cls += ' admin-calendar__day--today';
      if (dateStr === selectedDay) cls += ' admin-calendar__day--selected';
      if (dayApts.length) cls += ' admin-calendar__day--has';

      var dots = dayApts.slice(0, 3).map(function () {
        return '<span class="admin-calendar__dot"></span>';
      }).join('');
      var more = dayApts.length > 3 ? '<span class="admin-calendar__more">+' + (dayApts.length - 3) + '</span>' : '';

      html +=
        '<button type="button" class="' + cls + '" data-date="' + dateStr + '">' +
        '<span class="admin-calendar__num">' + i + '</span>' +
        (dayApts.length ? '<span class="admin-calendar__dots">' + dots + more + '</span>' : '') +
        '</button>';
    }

    adminCalendar.innerHTML = html;

    adminCalendar.querySelectorAll('[data-date]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedDay = btn.getAttribute('data-date');
        renderCalendar();
        renderDayList();
      });
    });
  }

  function renderDayList() {
    if (!adminAppointmentsList) return;

    if (!selectedDay) {
      selectedDay = bookingStore.formatDateISO(new Date());
    }

    adminDayTitle.textContent = 'مواعيد ' + bookingStore.formatDateArabic(selectedDay);
    var list = filterAppointments(bookingStore.getAppointmentsByDate(selectedDay));

    if (!list.length) {
      adminAppointmentsList.innerHTML = '<p class="admin-hint">لا توجد مواعيد في هذا اليوم.</p>';
      return;
    }

    list.sort(function (a, b) {
      return a.time.localeCompare(b.time);
    });

    adminAppointmentsList.innerHTML = list.map(function (a) {
      var actId = resolveActivityId(a);
      var actTitle = getActivityTitle(actId);
      var payBadge = '';
      var svc = store.getServiceById(a.serviceId);
      if (svc && svc.price) {
        var pStatus = a.paymentStatus || 'unpaid';
        var pMethod = a.paymentMethod ? ' (' + a.paymentMethod + ')' : '';
        payBadge = '<span class="admin-apt__payment ' + paymentStatusClass(pStatus) + '">' +
                   paymentStatusLabel(pStatus) + ': ' + (a.paymentAmount || svc.price) + ' ر.س' + pMethod + '</span>';
      }
      var staffBadge = '';
      if (a.staffId && window.RonaqAdminStaff && window.RonaqAdminStaff.getStaffName) {
        var staffName = window.RonaqAdminStaff.getStaffName(a.staffId);
        if (staffName) {
          staffBadge = ' <span class="badge" style="background:#e8f5e9; color:#2e7d32; font-weight:bold; font-size:0.75rem;">👤 الفني: ' + escHtml(staffName) + '</span>';
        }
      }
      return (
        '<div class="admin-apt ' + statusClass(a.status) + '">' +
        '<div class="admin-apt__main">' +
        '<span class="admin-apt__time">' + bookingStore.formatTimeArabic(a.time) + '</span>' +
        '<div>' +
        (actTitle ? '<small class="admin-apt__activity">' + escHtml(actTitle) + '</small><br>' : '') +
        '<strong>' + getServiceIcon(a.serviceId) + ' ' + escHtml(getServiceTitle(a.serviceId)) + '</strong>' +
        (payBadge ? ' ' + payBadge : '') + staffBadge + '<br>' +
        '<small>' + escHtml(a.customerName) + ' · ' + escHtml(a.phone) +
        (a.district ? ' · ' + escHtml(a.district) : '') +
        (a.partySize ? ' · ' + a.partySize + ' ضيوف/أشخاص' : '') +
        (a.nights ? ' · ' + a.nights + ' ليلة' : '') + '</small>' +
        (a.locationAddress ? '<p class="admin-apt__notes">📍 ' + escHtml(a.locationAddress) + '</p>' : '') +
        (a.notes ? '<p class="admin-apt__notes">' + escHtml(a.notes) + '</p>' : '') +
        '</div>' +
        '<span class="admin-apt__status">' + statusLabel(a.status) + '</span>' +
        '</div>' +
        '<div class="admin-apt__actions">' +
        (a.status !== 'confirmed'
          ? '<button type="button" class="btn btn--outline btn--sm" data-apt-confirm="' + a.id + '">تأكيد</button>'
          : '') +
        (a.status !== 'cancelled'
          ? '<button type="button" class="btn btn--outline btn--sm" data-apt-cancel="' + a.id + '">إلغاء</button>'
          : '') +
        '<button type="button" class="btn btn--outline btn--sm" data-apt-edit="' + a.id + '">تعديل</button>' +
        (a.status === 'confirmed'
          ? '<button type="button" class="btn btn--outline btn--sm" data-apt-remind="' + a.id + '">💬 تذكير</button>'
          : '') +
        (a.status !== 'cancelled'
          ? '<a href="#" class="btn btn--outline btn--sm" data-apt-gcal="' + a.id + '" target="_blank" rel="noopener">📅 Google</a>' +
            '<button type="button" class="btn btn--outline btn--sm" data-apt-ics="' + a.id + '">ICS</button>'
          : '') +
        '<button type="button" class="btn btn--outline btn--sm" data-apt-delete="' + a.id + '">حذف</button>' +
        '</div></div>'
      );
    }).join('');

    adminAppointmentsList.querySelectorAll('[data-apt-confirm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-apt-confirm');
        var apt = bookingStore.getAppointments().find(function (a) { return a.id === id; });
        if (!apt) return;

        bookingStore.updateAppointment(id, { status: 'confirmed' });
        
        var config = store.loadConfig();
        if (config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
          if (window.RonaqWhatsappAutomation) {
            window.RonaqWhatsappAutomation.sendConfirmation(Object.assign({}, apt, { status: 'confirmed' }), config)
              .catch(function (err) {
                console.error('Failed to send auto-confirmation:', err);
              });
          }
        }
        
        renderAll();
      });
    });

    adminAppointmentsList.querySelectorAll('[data-apt-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        bookingStore.updateAppointment(btn.getAttribute('data-apt-cancel'), { status: 'cancelled' });
        renderAll();
      });
    });

    adminAppointmentsList.querySelectorAll('[data-apt-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(btn.getAttribute('data-apt-edit'));
      });
    });

    adminAppointmentsList.querySelectorAll('[data-apt-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('حذف هذا الموعد؟')) {
          bookingStore.removeAppointment(btn.getAttribute('data-apt-delete'));
          renderAll();
        }
      });
    });

    adminAppointmentsList.querySelectorAll('[data-apt-remind]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-apt-remind');
        var apt = bookingStore.getAppointments().find(function (a) { return a.id === id; });
        if (!apt) return;
        var settings = getReminderConfig();
        var hours = settings.hoursBefore[0] || 24;
        var aptTime = bookingStore.appointmentToDateTime(apt);
        var now = new Date();
        var diffHours = Math.max(1, Math.round((aptTime - now) / (60 * 60 * 1000)));
        if (diffHours < hours) hours = diffHours;
        sendReminder(id, hours, false, false);
      });
    });

    var calExport = window.RonaqCalendarExport;
    if (calExport) {
      adminAppointmentsList.querySelectorAll('[data-apt-gcal]').forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var id = link.getAttribute('data-apt-gcal');
          var apt = bookingStore.getAppointments().find(function (a) { return a.id === id; });
          if (!apt) return;
          window.open(calExport.buildGoogleCalendarUrl(apt, buildMetaForAppointment(apt)), '_blank', 'noopener');
        });
      });

      adminAppointmentsList.querySelectorAll('[data-apt-ics]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-apt-ics');
          var apt = bookingStore.getAppointments().find(function (a) { return a.id === id; });
          if (!apt) return;
          calExport.downloadIcs(apt, buildMetaForAppointment(apt), 'ronaq-' + apt.date + '.ics');
        });
      });
    }
  }

  function servicesForFilter() {
    var services = getBookableServices();
    if (activityFilter === 'all') return services;
    return services.filter(function (s) { return s.activityId === activityFilter; });
  }

  function fillFilterSelects() {
    var bookable = store.getBookableActivities();

    if (calendarActivityFilter) {
      calendarActivityFilter.innerHTML =
        '<option value="all">كل الأنشطة</option>' +
        bookable.map(function (a) {
          return '<option value="' + a.id + '">' + a.icon + ' ' + escHtml(a.title) + '</option>';
        }).join('');
      calendarActivityFilter.value = activityFilter;
    }

    var aptActivity = document.getElementById('aptActivity');
    if (aptActivity) {
      aptActivity.innerHTML =
        '<option value="all">— كل الأنشطة —</option>' +
        bookable.map(function (a) {
          return '<option value="' + a.id + '">' + a.icon + ' ' + escHtml(a.title) + '</option>';
        }).join('');
    }

    var services = servicesForFilter();
    var svcOpts = services.map(function (s) {
      return '<option value="' + s.id + '">' + s.icon + ' ' + escHtml(s.title) + '</option>';
    }).join('');

    if (calendarServiceFilter) {
      calendarServiceFilter.innerHTML = '<option value="all">كل الخدمات</option>' + svcOpts;
      if (serviceFilter !== 'all' && !services.some(function (s) { return s.id === serviceFilter; })) {
        serviceFilter = 'all';
      }
      calendarServiceFilter.value = serviceFilter;
    }
  }

  function fillModalServiceSelect(activityId) {
    var aptService = document.getElementById('aptService');
    if (!aptService) return;
    var services = getBookableServices();
    if (activityId && activityId !== 'all') {
      services = services.filter(function (s) { return s.activityId === activityId; });
    }
    aptService.innerHTML = services.map(function (s) {
      return '<option value="' + s.id + '">' + s.icon + ' ' + escHtml(s.title) + '</option>';
    }).join('');
  }

  function openModal(id) {
    editingId = id || null;
    var title = document.getElementById('appointmentModalTitle');
    title.textContent = editingId ? 'تعديل موعد' : 'إضافة موعد';

    // Populate staff dropdown
    var aptStaff = document.getElementById('aptStaff');
    if (aptStaff) {
      aptStaff.innerHTML = '<option value="">— غير مسند —</option>';
      if (window.RonaqAdminStaff && window.RonaqAdminStaff.getStaffList) {
        window.RonaqAdminStaff.getStaffList().forEach(function (member) {
          if (member.status === 'active') {
            var opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = member.name + ' (' + (member.role === 'technician' ? 'فني' : 'مشرف') + ')';
            aptStaff.appendChild(opt);
          }
        });
      }
    }

    var aptActivity = document.getElementById('aptActivity');

    if (editingId) {
      var apt = bookingStore.getAppointments().find(function (a) { return a.id === editingId; });
      if (apt) {
        var actId = resolveActivityId(apt);
        if (aptActivity) aptActivity.value = actId || 'all';
        fillModalServiceSelect(actId);
        document.getElementById('aptService').value = apt.serviceId;
        document.getElementById('aptDate').value = apt.date;
        document.getElementById('aptTime').value = apt.time;
        document.getElementById('aptName').value = apt.customerName;
        document.getElementById('aptPhone').value = apt.phone;
        document.getElementById('aptDistrict').value = apt.district || '';
        document.getElementById('aptAddress').value = apt.locationAddress || '';
        document.getElementById('aptPartySize').value = apt.partySize != null ? apt.partySize : '';
        document.getElementById('aptNights').value = apt.nights != null ? apt.nights : '';
        document.getElementById('aptNotes').value = apt.notes || '';
        if (aptStaff) aptStaff.value = apt.staffId || '';
        document.getElementById('aptStatus').value = apt.status;
        document.getElementById('aptPaymentStatus').value = apt.paymentStatus || 'unpaid';
        document.getElementById('aptPaymentAmount').value = apt.paymentAmount != null ? apt.paymentAmount : '';
        document.getElementById('aptPaymentMethod').value = apt.paymentMethod || '';
        document.getElementById('aptPaymentId').value = apt.paymentId || '';
      }
    } else {
      appointmentForm.reset();
      document.getElementById('aptDate').value = selectedDay || bookingStore.formatDateISO(new Date());
      document.getElementById('aptStatus').value = 'confirmed';
      document.getElementById('aptPaymentStatus').value = 'unpaid';
      document.getElementById('aptPaymentAmount').value = '';
      document.getElementById('aptPaymentMethod').value = '';
      document.getElementById('aptPaymentId').value = '';
      if (aptStaff) aptStaff.value = '';
      if (aptActivity) {
        aptActivity.value = activityFilter !== 'all' ? activityFilter : 'all';
      }
      fillModalServiceSelect(activityFilter !== 'all' ? activityFilter : 'all');
      if (serviceFilter !== 'all') {
        document.getElementById('aptService').value = serviceFilter;
      }
    }

    appointmentModal.hidden = false;
  }

  function closeModal() {
    appointmentModal.hidden = true;
    editingId = null;
  }

  function renderAll() {
    fillFilterSelects();
    renderCalendar();
    renderDayList();
    renderPending();
    renderDueReminders();
  }

  function bindEvents() {
    var calPrev = document.getElementById('adminCalPrev');
    var calNext = document.getElementById('adminCalNext');
    if (calPrev) {
      calPrev.addEventListener('click', function () {
        calMonth -= 1;
        if (calMonth < 0) { calMonth = 11; calYear -= 1; }
        renderCalendar();
      });
    }
    if (calNext) {
      calNext.addEventListener('click', function () {
        calMonth += 1;
        if (calMonth > 11) { calMonth = 0; calYear += 1; }
        renderCalendar();
      });
    }

    if (calendarActivityFilter) {
      calendarActivityFilter.addEventListener('change', function () {
        activityFilter = calendarActivityFilter.value;
        serviceFilter = 'all';
        renderAll();
      });
    }

    if (calendarServiceFilter) {
      calendarServiceFilter.addEventListener('change', function () {
        serviceFilter = calendarServiceFilter.value;
        renderAll();
      });
    }

    var aptActivity = document.getElementById('aptActivity');
    if (aptActivity) {
      aptActivity.addEventListener('change', function () {
        fillModalServiceSelect(aptActivity.value);
      });
    }

    var addBtn = document.getElementById('addAppointmentBtn');
    if (addBtn) addBtn.addEventListener('click', function () { openModal(null); });

    var cancelBtn = document.getElementById('aptModalCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (appointmentModal) {
      appointmentModal.addEventListener('click', function (e) {
        if (e.target === appointmentModal) closeModal();
      });
    }

    if (appointmentForm) {
      appointmentForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var svcId = document.getElementById('aptService').value;
        var svc = store.getServiceById(svcId);
        var partyRaw = document.getElementById('aptPartySize').value.trim();
        var nightsRaw = document.getElementById('aptNights').value.trim();
        var payAmtRaw = document.getElementById('aptPaymentAmount').value.trim();
        var data = {
          activityId: svc ? svc.activityId : '',
          serviceId: svcId,
          date: document.getElementById('aptDate').value,
          time: document.getElementById('aptTime').value,
          customerName: document.getElementById('aptName').value.trim(),
          phone: document.getElementById('aptPhone').value.trim(),
          district: document.getElementById('aptDistrict').value.trim(),
          locationAddress: document.getElementById('aptAddress').value.trim(),
          partySize: partyRaw ? parseInt(partyRaw, 10) : null,
          nights: nightsRaw ? parseInt(nightsRaw, 10) : null,
          notes: document.getElementById('aptNotes').value.trim(),
          staffId: document.getElementById('aptStaff') ? document.getElementById('aptStaff').value : null,
          status: document.getElementById('aptStatus').value,
          paymentStatus: document.getElementById('aptPaymentStatus').value,
          paymentAmount: payAmtRaw ? parseFloat(payAmtRaw) : null,
          paymentMethod: document.getElementById('aptPaymentMethod').value.trim() || null,
          paymentId: document.getElementById('aptPaymentId').value.trim() || null,
        };

        if (!data.serviceId || !data.date || !data.time || !data.customerName || !data.phone) return;

        if (editingId) {
          bookingStore.updateAppointment(editingId, data);
        } else {
          bookingStore.addAppointment(data);
        }

        selectedDay = data.date;
        closeModal();
        renderAll();
        toast('تم حفظ الموعد محلياً — اضغط «حفظ المواعيد» للنشر');
      });
    }

    var saveAptBtn = document.getElementById('saveAppointmentsBtn');
    if (saveAptBtn) {
      saveAptBtn.addEventListener('click', function () {
        if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
          toast('تم حفظ ومزامنة المواعيد مع السحابة بنجاح');
        } else {
          bookingStore.downloadFile();
          toast('تم تنزيل appointments.json — ارفعه إلى data/');
        }
      });
    }

    var exportAptBtn = document.getElementById('exportAptBtn');
    if (exportAptBtn) {
      exportAptBtn.addEventListener('click', function () {
        bookingStore.downloadFile();
        toast('تم تنزيل appointments.json');
      });
    }

    var importAptBtn = document.getElementById('importAptBtn');
    var importAptFile = document.getElementById('importAptFile');
    if (importAptBtn && importAptFile) {
      importAptBtn.addEventListener('click', function () { importAptFile.click(); });
      importAptFile.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            bookingStore.importData(reader.result);
            renderAll();
            toast('تم استيراد المواعيد');
          } catch (err) {
            toast('ملف غير صالح', 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    var exportIcsBtn = document.getElementById('exportIcsBtn');
    if (exportIcsBtn) {
      exportIcsBtn.addEventListener('click', function () {
        var calExport = window.RonaqCalendarExport;
        if (!calExport) return;
        var list = filterAppointments(bookingStore.getActiveAppointments());
        if (!list.length) {
          toast('لا توجد مواعيد للتصدير', 'error');
          return;
        }
        calExport.downloadIcsBatch(list, buildMetaForAppointment);
        toast('تم تنزيل ملف التقويم (.ics)');
      });
    }

    if (saveReminderSettingsBtn) {
      saveReminderSettingsBtn.addEventListener('click', saveReminderSettings);
    }
    var enableNotifBtn = document.getElementById('enableNotificationsBtn');
    if (enableNotifBtn) {
      enableNotifBtn.addEventListener('click', function () {
        requestNotificationPermission().then(function (perm) {
          if (perm === 'granted') toast('تم تفعيل الإشعارات');
          else if (perm === 'denied') toast('تم رفض الإشعارات — فعّلها من إعدادات المتصفح', 'error');
          else toast('لم يتم تفعيل الإشعارات');
        });
      });
    }
  }

  function initBookingAdmin() {
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedDay = bookingStore.formatDateISO(now);
    bindEvents();
    loadReminderSettings();
    renderAll();
    startReminderPolling();
    requestNotificationPermission();
  }

  window.RonaqAdminBooking = {
    refresh: renderAll,
    init: initBookingAdmin,
  };

  store.init().then(function () {
    return bookingStore.init();
  }).then(initBookingAdmin);
})();
