/**
 * صفحة حجز المواعيد — متعددة الأنشطة (واتساب + appointments)
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  var bookingStore = window.RonaqBookingStore;
  if (!store || !bookingStore) return;

  var config, booking, enabled, appointments, activeActivity, activeActivityId;
  var selectedService = null;
  var selectedDate = '';
  var selectedTime = '';
  var lastSubmittedAppointment = null;
  var calYear, calMonth;

  var bookingApp = document.getElementById('bookingApp');
  var bookingDisabled = document.getElementById('bookingDisabled');
  var bookingSteps = document.getElementById('bookingSteps');
  var bookingServices = document.getElementById('bookingServices');
  var bookingCalendar = document.getElementById('bookingCalendar');
  var bookingSlots = document.getElementById('bookingSlots');
  var bookingSummary = document.getElementById('bookingSummary');
  var bookingForm = document.getElementById('bookingForm');
  var activityNav = document.getElementById('bookingActivityNav');

  var STEP_LABELS = ['الخدمة', 'التاريخ', 'الوقت', 'البيانات'];

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function parseActivityParam() {
    return new URLSearchParams(window.location.search).get('activity') || '';
  }

  function getEffectiveBooking() {
    var b = store.getBookingForActivity(activeActivityId, config);
    if (selectedService && selectedService.slotDuration) {
      b = Object.assign({}, b, { slotDuration: selectedService.slotDuration });
    }
    return b;
  }

  function needsAddress() {
    return store.serviceNeedsAddress(selectedService, activeActivityId, config);
  }

  function showPanel(id) {
    document.querySelectorAll('.booking-panel').forEach(function (p) {
      p.hidden = p.id !== id;
    });
  }

  function setStep(step) {
    bookingSteps.innerHTML = STEP_LABELS.map(function (label, i) {
      var cls = 'booking-step-indicator';
      if (i + 1 === step) cls += ' booking-step-indicator--active';
      else if (i + 1 < step) cls += ' booking-step-indicator--done';
      return (
        '<div class="' + cls + '">' +
        '<span class="booking-step-indicator__num">' + (i + 1) + '</span>' +
        '<span>' + label + '</span></div>'
      );
    }).join('');
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
    document.title = 'حجز موعد | ' + brand.name;
  }

  function applyContact() {
    var phone = config.phone || store.DEFAULT_PHONE;
    var wa = store.getSocialUrl('whatsapp', config.social) || store.waLink(phone);
    document.querySelectorAll('[data-contact="whatsapp"]').forEach(function (el) {
      el.href = wa;
    });
  }

  function updateHero() {
    var h1 = document.getElementById('bookingHeroTitle');
    var p = document.getElementById('bookingHeroDesc');
    if (!activeActivity) return;
    if (h1) h1.textContent = activeActivity.booking && activeActivity.booking.ctaLabel
      ? activeActivity.booking.ctaLabel.replace(/^احجز\s*/i, 'احجز ')
      : 'احجز — ' + activeActivity.title;
    if (p) {
      p.textContent = activeActivity.description;
    }
    var note = document.getElementById('bookingHealthcareNote');
    if (note) note.hidden = activeActivityId !== 'healthcare';
  }

  function renderActivityNav() {
    if (!activityNav) return;
    var acts = store.getBookableActivities();
    if (acts.length <= 1) {
      activityNav.hidden = true;
      return;
    }
    activityNav.hidden = false;
    activityNav.innerHTML = acts.map(function (act) {
      var active = act.id === activeActivityId ? ' activity-tab--active' : '';
      return (
        '<a href="book.html?activity=' + encodeURIComponent(act.id) + '" class="activity-tab' + active + '">' +
        '<span class="activity-tab__icon">' + act.icon + '</span>' +
        '<span class="activity-tab__label">' + esc(act.shortTitle) + '</span></a>'
      );
    }).join('');
  }

  function switchActivity(activityId) {
    activeActivityId = activityId;
    activeActivity = store.getResolvedActivity(activityId, config);
    enabled = store.getEnabledServicesByActivity(activityId);
    booking = getEffectiveBooking();
    selectedService = null;
    selectedDate = '';
    selectedTime = '';
    updateHero();
    renderActivityNav();
    renderServices();
    showPanel('panelService');
    setStep(1);
    document.getElementById('btnToDate').disabled = true;
  }

  function renderServices() {
    if (!bookingServices) return;
    if (!enabled.length) {
      bookingServices.innerHTML = '<p class="booking-empty">لا توجد خدمات مفعّلة لهذا النشاط.</p>';
      return;
    }
    bookingServices.innerHTML = enabled.map(function (s) {
      var sel = selectedService && selectedService.id === s.id ? ' booking-service--selected' : '';
      var dur = s.slotDuration ? '<small>' + s.slotDuration + ' د</small>' : '';
      return (
        '<button type="button" class="booking-service' + sel + '" data-id="' + s.id + '">' +
        '<span class="booking-service__icon">' + s.icon + '</span>' +
        '<span>' + esc(s.shortTitle) + '</span>' + dur +
        '</button>'
      );
    }).join('');

    bookingServices.querySelectorAll('.booking-service').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        selectedService = enabled.find(function (s) { return s.id === id; }) || null;
        selectedDate = '';
        selectedTime = '';
        booking = getEffectiveBooking();
        renderServices();
        document.getElementById('btnToDate').disabled = !selectedService;
      });
    });
  }

  function renderCalendar() {
    var title = document.getElementById('calTitle');
    title.textContent = bookingStore.AR_MONTHS[calMonth] + ' ' + calYear;

    var firstDay = new Date(calYear, calMonth, 1);
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var startOffset = firstDay.getDay();
    var todayStr = bookingStore.formatDateISO(new Date());
    var b = getEffectiveBooking();
    var available = selectedService
      ? bookingStore.getAvailableDates(selectedService.id, b, appointments)
      : [];

    var html = bookingStore.AR_DAYS.map(function (d) {
      return '<div class="booking-calendar__head">' + d + '</div>';
    }).join('');

    var i;
    for (i = 0; i < startOffset; i++) {
      html += '<span class="booking-calendar__day booking-calendar__day--empty"></span>';
    }

    for (i = 1; i <= daysInMonth; i++) {
      var dateStr = bookingStore.formatDateISO(new Date(calYear, calMonth, i));
      var isAvail = available.indexOf(dateStr) !== -1;
      var cls = 'booking-calendar__day';
      if (isAvail) cls += ' booking-calendar__day--available';
      if (dateStr === todayStr) cls += ' booking-calendar__day--today';
      if (dateStr === selectedDate) cls += ' booking-calendar__day--selected';

      if (isAvail) {
        html += '<button type="button" class="' + cls + '" data-date="' + dateStr + '">' + i + '</button>';
      } else {
        html += '<span class="' + cls + '">' + i + '</span>';
      }
    }

    bookingCalendar.innerHTML = html;

    bookingCalendar.querySelectorAll('[data-date]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedDate = btn.getAttribute('data-date');
        selectedTime = '';
        renderCalendar();
        document.getElementById('btnToTime').disabled = false;
      });
    });
  }

  function renderSlots() {
    var label = document.getElementById('selectedDateLabel');
    var noSlots = document.getElementById('noSlotsMsg');
    label.textContent = 'التاريخ: ' + bookingStore.formatDateArabic(selectedDate);

    var slots = bookingStore.getSlotsForDate(
      selectedService.id,
      selectedDate,
      getEffectiveBooking(),
      appointments
    );

    if (!slots.length) {
      bookingSlots.innerHTML = '';
      noSlots.hidden = false;
      document.getElementById('btnToForm').disabled = true;
      return;
    }

    noSlots.hidden = true;
    bookingSlots.innerHTML = slots.map(function (slot) {
      var sel = slot === selectedTime ? ' booking-slot--selected' : '';
      return '<button type="button" class="booking-slot' + sel + '" data-time="' + slot + '">' +
        bookingStore.formatTimeArabic(slot) + '</button>';
    }).join('');

    bookingSlots.querySelectorAll('.booking-slot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedTime = btn.getAttribute('data-time');
        renderSlots();
        document.getElementById('btnToForm').disabled = false;
      });
    });
  }

  function renderSummary() {
    var html =
      '<dl>' +
      (activeActivity ? '<dt>النشاط</dt><dd>' + activeActivity.icon + ' ' + esc(activeActivity.title) + '</dd>' : '') +
      '<dt>الخدمة</dt><dd>' + selectedService.icon + ' ' + esc(selectedService.title) + '</dd>' +
      '<dt>' + (needsNights() ? 'تاريخ الوصول' : 'التاريخ') + '</dt><dd>' + bookingStore.formatDateArabic(selectedDate) + '</dd>' +
      '<dt>الوقت</dt><dd>' + bookingStore.formatTimeArabic(selectedTime) + '</dd>';
    html += '</dl>';
    bookingSummary.innerHTML = html;
  }

  function needsPartySize() {
    return !!(activeActivity && activeActivity.booking && activeActivity.booking.collectPartySize);
  }

  function needsNights() {
    return !!(activeActivity && activeActivity.booking && activeActivity.booking.collectNights);
  }

  function getPartySizeLabel() {
    var b = activeActivity && activeActivity.booking;
    return (b && b.partySizeLabel) || 'عدد الأشخاص';
  }

  function toggleFormFields() {
    var addrBlock = document.getElementById('bookingAddressBlock');
    var partyBlock = document.getElementById('bookingPartyBlock');
    var nightsBlock = document.getElementById('bookingNightsBlock');
    var partyLabel = document.getElementById('partySizeLabel');
    var districtField = document.getElementById('customerDistrict');
    var districtLabel = document.querySelector('label[for="customerDistrict"]');
    var need = needsAddress();
    var party = needsPartySize();
    var nights = needsNights();

    if (addrBlock) addrBlock.hidden = !need;
    if (partyBlock) partyBlock.hidden = !party;
    if (nightsBlock) nightsBlock.hidden = !nights;
    if (partyLabel) partyLabel.textContent = getPartySizeLabel() + (party ? ' *' : '');
    if (districtField) {
      districtField.required = need;
      if (!need && !party) districtField.value = '';
    }
    if (districtLabel) {
      districtLabel.textContent = need ? 'الحي / المنطقة *' : 'الحي (اختياري)';
    }
  }

  function getWhatsAppUrl(message) {
    var phone = config.phone || store.DEFAULT_PHONE;
    var wa = store.getSocialUrl('whatsapp', config.social) || store.waLink(phone);
    var sep = wa.indexOf('?') !== -1 ? '&' : '?';
    return wa + sep + 'text=' + encodeURIComponent(message);
  }

  function getCalendarMeta(appointment) {
    var svc = appointment.serviceId ? store.getServiceById(appointment.serviceId) : selectedService;
    var actId = appointment.activityId || activeActivityId;
    var b = store.getBookingForActivity(actId, config);
    if (svc && svc.slotDuration) {
      b = Object.assign({}, b, { slotDuration: svc.slotDuration });
    }
    return {
      brandName: store.getBrand(config).name,
      activityTitle: activeActivity ? activeActivity.title : '',
      serviceTitle: svc ? svc.title : '',
      durationMinutes: b.slotDuration,
    };
  }

  function renderSuccessCalendarLinks() {
    var container = document.getElementById('bookingCalendarLinks');
    var cal = window.RonaqCalendarExport;
    if (!container || !cal || !lastSubmittedAppointment) {
      if (container) container.innerHTML = '';
      return;
    }

    var meta = getCalendarMeta(lastSubmittedAppointment);
    var gcalUrl = cal.buildGoogleCalendarUrl(lastSubmittedAppointment, meta);

    container.innerHTML =
      '<p class="booking-success__calendar-hint">أضف الموعد لتقويمك كتذكير:</p>' +
      '<div class="booking-success__calendar-actions">' +
      '<a href="' + esc(gcalUrl) + '" class="btn btn--outline" target="_blank" rel="noopener">📅 Google Calendar</a>' +
      '<button type="button" class="btn btn--outline" id="btnDownloadIcs">تنزيل .ics</button>' +
      '</div>';

    var icsBtn = document.getElementById('btnDownloadIcs');
    if (icsBtn) {
      icsBtn.addEventListener('click', function () {
        cal.downloadIcs(
          lastSubmittedAppointment,
          meta,
          'ronaq-' + lastSubmittedAppointment.date + '.ics'
        );
      });
    }
  }

  function handlePaymentSuccess(aptId, paymentDetails) {
    var pId = paymentDetails.id;
    var pMethod = paymentDetails.source ? paymentDetails.source.type : 'online';
    if (paymentDetails.source && paymentDetails.source.company) {
      pMethod = paymentDetails.source.company; // e.g. mada, visa
    }
    var pAmount = paymentDetails.amount ? (paymentDetails.amount / 100) : 0;

    var pendingList = bookingStore.getPendingRequests();
    var req = pendingList.find(function (r) { return r.id === aptId; }) || lastSubmittedAppointment;

    var updatedApt = {
      id: aptId,
      activityId: req ? req.activityId : activeActivityId,
      serviceId: req ? req.serviceId : (selectedService ? selectedService.id : ''),
      date: req ? req.date : selectedDate,
      time: req ? req.time : selectedTime,
      customerName: req ? req.customerName : '',
      phone: req ? req.phone : '',
      district: req ? req.district : '',
      locationAddress: req ? req.locationAddress : '',
      partySize: req ? req.partySize : null,
      nights: req ? req.nights : null,
      notes: req ? req.notes : '',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentId: pId,
      paymentMethod: pMethod,
      paymentAmount: pAmount,
      createdAt: req ? req.createdAt : new Date().toISOString()
    };

    bookingStore.addAppointment(updatedApt);
    bookingStore.clearPendingRequest(aptId);

    var brandName = store.getBrand(config).name;
    var svc = store.getServiceById(updatedApt.serviceId);
    var actTitle = req ? (req.activityTitle || '') : '';

    if (config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
      if (window.RonaqWhatsappAutomation) {
        window.RonaqWhatsappAutomation.sendConfirmation(updatedApt, config)
          .catch(function (err) {
            console.error('Failed to send auto-confirmation:', err);
          });
      }
    }

    var clientMsg = 'تم دفع الحجز بنجاح! 🎉\n' +
      'رقم العملية: ' + pId + '\n' +
      bookingStore.buildWhatsAppMessage(brandName, updatedApt, svc ? svc.title : '', actTitle);

    lastSubmittedAppointment = updatedApt;
    renderSuccessCalendarLinks();

    showPanel('panelSuccess');
    setStep(5);

    setTimeout(function () {
      window.open(getWhatsAppUrl(clientMsg), '_blank', 'noopener');
    }, 1500);
  }

  function checkPaymentCallback() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment_callback') === '1') {
      var aptId = params.get('apt_id');
      var status = params.get('status');
      var paymentId = params.get('id');
      var message = params.get('message') || '';

      if (status === 'paid' && aptId && paymentId) {
        var pMethod = 'online';
        var paymentDetails = {
          id: paymentId,
          amount: params.get('amount') ? parseInt(params.get('amount'), 10) : 0,
          source: {
            type: 'card',
            company: params.get('message') && params.get('message').indexOf('Mada') !== -1 ? 'mada' : 'creditcard'
          }
        };

        var pendingList = bookingStore.getPendingRequests();
        var req = pendingList.find(function (r) { return r.id === aptId; });
        if (req) {
          handlePaymentSuccess(aptId, paymentDetails);
        } else {
          showPanel('panelSuccess');
          setStep(5);
        }
      } else if (status === 'failed') {
        alert('فشلت عملية الدفع: ' + (message || 'يرجى التحقق من بيانات البطاقة والمحاولة مرة أخرى.'));
        showPanel('panelForm');
        setStep(4);
      }
    }
  }

  function handleSubmit(e) {
    e.preventDefault();

    var name = document.getElementById('customerName').value.trim();
    var phone = document.getElementById('customerPhone').value.trim();
    var district = (document.getElementById('customerDistrict').value || '').trim();
    var address = (document.getElementById('customerAddress') && document.getElementById('customerAddress').value || '').trim();
    var notes = document.getElementById('customerNotes').value.trim();
    var partySizeEl = document.getElementById('partySize');
    var partySize = partySizeEl ? partySizeEl.value.trim() : '';
    var nightsEl = document.getElementById('stayNights');
    var nights = nightsEl ? nightsEl.value.trim() : '';
    var need = needsAddress();
    var party = needsPartySize();
    var nightsRequired = needsNights();

    if (!name || !phone) return;
    if (need && !district) return;
    if (need && !address) return;
    if (party && !partySize) return;
    if (nightsRequired && !nights) return;

    var appointment = {
      activityId: activeActivityId,
      serviceId: selectedService.id,
      date: selectedDate,
      time: selectedTime,
      customerName: name,
      phone: phone,
      district: district,
      locationAddress: address,
      partySize: partySize,
      nights: nights,
      notes: notes,
      status: 'pending',
    };

    var brandName = store.getBrand(config).name;
    var activityTitle = activeActivity ? activeActivity.title : '';

    var payConfig = config.payment || {};
    var priceVal = parseFloat(selectedService.price);
    if (payConfig.enabled && !isNaN(priceVal) && priceVal > 0 && window.Moyasar) {
      var aptId = bookingStore.generateId();
      var pendingApt = {
        id: aptId,
        activityId: activeActivityId,
        serviceId: selectedService.id,
        date: selectedDate,
        time: selectedTime,
        customerName: name,
        phone: phone,
        district: district,
        locationAddress: address,
        partySize: partySize,
        nights: nights,
        notes: notes,
        status: payConfig.requirePayment ? 'pending' : 'confirmed',
        paymentStatus: 'unpaid',
        paymentAmount: priceVal,
        createdAt: new Date().toISOString(),
      };

      bookingStore.addPendingRequest(pendingApt);
      lastSubmittedAppointment = pendingApt;

      showPanel('panelPayment');
      setStep(4);

      var amountLabel = document.getElementById('paymentAmountLabel');
      if (amountLabel) {
        amountLabel.textContent = 'إجمالي المبلغ المستحق للدفع: ' + priceVal + ' ' + (payConfig.currency || 'SAR');
      }

      var callbackUrl = window.location.origin + window.location.pathname + 
                        '?payment_callback=1&apt_id=' + encodeURIComponent(aptId);

      var formContainer = document.querySelector('.mysr-form');
      if (formContainer) formContainer.innerHTML = '';

      var tenantSlug = store.getCurrentTenantSlug() || 'default';
      window.Moyasar.init({
        element: '.mysr-form',
        amount: Math.round(priceVal * 100),
        currency: payConfig.currency || 'SAR',
        description: 'حجز خدمة: ' + selectedService.title + ' - ' + name,
        publishable_api_key: payConfig.publishableKey || '',
        callback_url: callbackUrl,
        methods: ['creditcard', 'mada', 'applepay'],
        metadata: {
          appointment_id: aptId,
          tenant_slug: tenantSlug,
          type: 'booking'
        },
        on_completed: function (payment) {
          handlePaymentSuccess(aptId, payment);
        }
      });
      return;
    }

    var message = bookingStore.buildWhatsAppMessage(
      brandName, appointment, selectedService.title, activityTitle
    );

    bookingStore.addPendingRequest({
      activityId: activeActivityId,
      activityTitle: activityTitle,
      serviceId: selectedService.id,
      serviceTitle: selectedService.title,
      date: selectedDate,
      time: selectedTime,
      customerName: name,
      phone: phone,
      district: district,
      locationAddress: address,
      partySize: partySize,
      nights: nights,
      notes: notes,
    });

    lastSubmittedAppointment = appointment;
    renderSuccessCalendarLinks();

    window.open(getWhatsAppUrl(message), '_blank', 'noopener');
    showPanel('panelSuccess');
    setStep(5);
  }

  function resetBooking() {
    selectedService = null;
    selectedDate = '';
    selectedTime = '';
    lastSubmittedAppointment = null;
    if (bookingForm) bookingForm.reset();
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    renderServices();
    showPanel('panelService');
    setStep(1);
    document.getElementById('btnToDate').disabled = true;
  }

  function bindEvents() {
    document.getElementById('btnToDate').addEventListener('click', function () {
      showPanel('panelDate');
      setStep(2);
      renderCalendar();
    });

    document.getElementById('btnBackService').addEventListener('click', function () {
      showPanel('panelService');
      setStep(1);
    });

    document.getElementById('btnToTime').addEventListener('click', function () {
      showPanel('panelTime');
      setStep(3);
      renderSlots();
    });

    document.getElementById('btnBackDate').addEventListener('click', function () {
      showPanel('panelDate');
      setStep(2);
    });

    document.getElementById('btnToForm').addEventListener('click', function () {
      renderSummary();
      toggleFormFields();
      showPanel('panelForm');
      setStep(4);
    });

    document.getElementById('btnBackTime').addEventListener('click', function () {
      showPanel('panelTime');
      setStep(3);
    });

    document.getElementById('calPrev').addEventListener('click', function () {
      calMonth -= 1;
      if (calMonth < 0) { calMonth = 11; calYear -= 1; }
      renderCalendar();
    });

    document.getElementById('calNext').addEventListener('click', function () {
      calMonth += 1;
      if (calMonth > 11) { calMonth = 0; calYear += 1; }
      renderCalendar();
    });

    bookingForm.addEventListener('submit', handleSubmit);
    document.getElementById('btnNewBooking').addEventListener('click', resetBooking);

    var backFormBtn = document.getElementById('btnBackForm');
    if (backFormBtn) {
      backFormBtn.addEventListener('click', function () {
        showPanel('panelForm');
        setStep(4);
      });
    }
  }

  function boot() {
    config = store.loadConfig();
    booking = store.getBooking(config);
    appointments = bookingStore.getActiveAppointments();

    var param = parseActivityParam();
    var bookable = store.getBookableActivities();
    activeActivityId = param || config.featuredActivity || (bookable[0] && bookable[0].id);

    if (bookable.length && bookable.every(function (a) { return a.id !== activeActivityId; })) {
      activeActivityId = bookable[0].id;
    }

    activeActivity = store.getResolvedActivity(activeActivityId, config);
    enabled = store.getEnabledServicesByActivity(activeActivityId);

    applyBrand();
    applyContact();
    updateHero();
    renderActivityNav();

    if (!booking.enabled || !enabled.length) {
      bookingDisabled.hidden = false;
      bookingApp.hidden = true;
      return;
    }

    bookingDisabled.hidden = true;
    bookingApp.hidden = false;

    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    renderServices();
    setStep(1);
    bindEvents();
  }

  Promise.all([store.init(), bookingStore.init()]).then(function () {
    boot();
    checkPaymentCallback();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      bookingStore.reload().then(function () {
        appointments = bookingStore.getActiveAppointments();
        if (selectedService && selectedDate) renderCalendar();
        if (selectedService && selectedDate && selectedTime) renderSlots();
      });
    }
  });
})();
