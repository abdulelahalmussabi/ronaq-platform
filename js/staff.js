/**
 * بوابة الموظفين والفنيين — تسجيل الدخول بالميزات الحيوية والمهام
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  if (!store) return;

  var bookingStore = window.RonaqBookingStore;

  var panelLogin = document.getElementById('panelLogin');
  var panelDashboard = document.getElementById('panelDashboard');
  var loginForm = document.getElementById('loginForm');
  var btnBiometricLogin = document.getElementById('btnBiometricLogin');
  var btnEnrollBiometrics = document.getElementById('btnEnrollBiometrics');
  var btnLogout = document.getElementById('btnLogout');
  var tasksList = document.getElementById('tasksList');

  var currentSession = null;
  var currentTenantSlug = '';

  function toast(msg, type) {
    var toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type === 'error' ? 'toast--error' : (type === 'warning' ? 'toast--warning' : 'toast--success'));
    toastEl.hidden = false;
    setTimeout(function () { toastEl.hidden = true; }, 3000);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  // --- WebAuthn Buffer Helpers ---
  function base64urlToBuffer(base64url) {
    var base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    var pad = base64.length % 4;
    if (pad) {
      if (pad === 2) base64 += '==';
      else if (pad === 3) base64 += '=';
    }
    var binary = window.atob(base64);
    var buffer = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer.buffer;
  }

  function bufferToBase64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    var base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function bufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function parseQueryParam() {
    var params = new URLSearchParams(window.location.search);
    return params.get('tenant') || '';
  }

  // --- Session Management ---
  function saveSession(session) {
    currentSession = session;
    localStorage.setItem('ronaq_mken_staff_session', JSON.stringify(session));
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem('ronaq_mken_staff_session');
      currentSession = raw ? JSON.parse(raw) : null;
    } catch (e) {
      currentSession = null;
    }
    return currentSession;
  }

  function clearSession() {
    currentSession = null;
    localStorage.removeItem('ronaq_mken_staff_session');
  }

  function sha256(message) {
    if (!message) return Promise.resolve('');
    var msgBuffer = new TextEncoder().encode(message);
    return crypto.subtle.digest('SHA-256', msgBuffer).then(function (hashBuffer) {
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(function (b) {
        return ('00' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  // --- Normal Login (Tenant + Phone + PIN) ---
  function handleNormalLogin(e) {
    e.preventDefault();
    var tenant = document.getElementById('loginTenant').value.trim();
    var phone = document.getElementById('loginPhone').value.trim();
    var pin = document.getElementById('loginPin').value.trim();

    if (!tenant || !phone || !pin) return;

    if (!window.RonaqSupabaseDb || !window.RonaqSupabaseDb.isConfigured()) {
      toast('Supabase غير مهيأ محلياً. لا يمكن التحقق من الفنيين.', 'error');
      return;
    }

    var client = window.RonaqSupabaseDb.getClient();
    
    sha256(pin).then(function (hashedPin) {
      return client
        .rpc('verify_staff_pin', {
          p_tenant: tenant,
          p_phone: phone,
          p_pin_hash: hashedPin
        });
    })
    .then(function (res) {
      if (res.error) throw res.error;
      var result = res.data;
      if (!result || !result.success) {
        toast('بيانات الدخول غير صحيحة أو حساب الفني غير نشط.', 'error');
        return;
      }

      var session = {
        id: result.id,
        name: result.name,
        role: result.role,
        phone: result.phone,
        tenantSlug: result.tenantSlug
      };

      saveSession(session);
      toast('تم تسجيل الدخول بنجاح! مالي بالمهام.');
      showDashboard();
    })
    .catch(function (err) {
      toast('حدث خطأ أثناء الاتصال بالخادم: ' + err.message, 'error');
    });
  }

  // --- Biometric/WebAuthn Passkey Registration ---
  function enrollBiometrics() {
    if (!currentSession) return;
    if (!window.publicKeyCredential) {
      toast('الدخول البيومتري غير مدعوم في هذا المتصفح.', 'error');
      return;
    }

    toast('جاري تحضير الجهاز للتوثيق البيومتري...', 'warning');

    fetch('/api/v1/auth/register-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: currentSession.id,
        staffPhone: currentSession.phone
      })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('فشل توليد التحدي من السيرفر');
      return res.json();
    })
    .then(function (options) {
      // Reconstruct WebAuthn options
      var createOptions = {
        publicKey: {
          challenge: base64urlToBuffer(options.challenge),
          rp: {
            name: options.rp.name,
            id: options.rp.id
          },
          user: {
            id: base64urlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256 (P-256) - Most common
            { type: 'public-key', alg: -257 } // RS256 - Fallback
          ],
          timeout: 60000,
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // Touch ID, Face ID, Windows Hello, Android lock
            userVerification: 'required'
          }
        }
      };

      return navigator.credentials.create(createOptions)
        .then(function (credential) {
          // Extract SPKI Public Key DER buffer if supported
          var publicKeyDer = '';
          if (credential.response.getPublicKey) {
            publicKeyDer = bufferToBase64(credential.response.getPublicKey());
          }

          var payload = {
            staffId: currentSession.id,
            deviceName: navigator.userAgent.indexOf('iPhone') !== -1 ? 'iPhone' : (navigator.userAgent.indexOf('Android') !== -1 ? 'Android' : 'PC-Windows'),
            credentialId: bufferToBase64url(credential.rawId),
            publicKeyDer: publicKeyDer,
            challenge: options.challenge,
            expiresAt: options.expiresAt,
            challengeSignature: options.challengeSignature
          };

          return fetch('/api/v1/auth/register-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        });
    })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (err) { throw new Error(err.error || 'فشل توثيق البصمة'); });
      return res.json();
    })
    .then(function (result) {
      // Store registered credential ID locally
      localStorage.setItem('ronaq_mken_staff_biometric_id', '1');
      localStorage.setItem('ronaq_mken_staff_registered_phone', currentSession.phone);
      localStorage.setItem('ronaq_mken_staff_registered_tenant', currentSession.tenantSlug);
      
      toast('تم تفعيل الدخول بالبصمة/الوجه وحفظ الجهاز المعتمد بنجاح! 🚀');
    })
    .catch(function (err) {
      toast('فشل تفعيل البصمة: ' + err.message, 'error');
    });
  }

  // --- Biometric/WebAuthn Login (Assertion) ---
  function loginBiometrically() {
    var phone = localStorage.getItem('ronaq_mken_staff_registered_phone') || '';
    var tenant = localStorage.getItem('ronaq_mken_staff_registered_tenant') || '';

    if (!phone || !tenant) {
      toast('لا توجد بصمات مسجلة على هذا المتصفح سابقاً.', 'error');
      return;
    }

    toast('جاري فحص البصمة والتحقق من جهازك المعتمد...', 'warning');

    fetch('/api/v1/auth/login-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug: tenant, phone: phone })
    })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (err) { throw new Error(err.error || 'فشل التحدي'); });
      return res.json();
    })
    .then(function (options) {
      var getOptions = {
        publicKey: {
          challenge: base64urlToBuffer(options.challenge),
          allowCredentials: options.allowCredentials.map(function (c) {
            return {
              type: 'public-key',
              id: base64urlToBuffer(c.id)
            };
          }),
          timeout: 60000,
          userVerification: 'required'
        }
      };

      return navigator.credentials.get(getOptions)
        .then(function (assertion) {
          var payload = {
            tenantSlug: tenant,
            phone: phone,
            credentialId: bufferToBase64url(assertion.rawId),
            clientDataJSON: bufferToBase64(assertion.response.clientDataJSON),
            authenticatorData: bufferToBase64(assertion.response.authenticatorData),
            signature: bufferToBase64(assertion.response.signature),
            challenge: options.challenge,
            expiresAt: options.expiresAt,
            challengeSignature: options.challengeSignature
          };

          return fetch('/api/v1/auth/login-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        });
    })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (err) { throw new Error(err.error || 'بصمة غير صالحة'); });
      return res.json();
    })
    .then(function (result) {
      saveSession(result.staff);
      toast('تم التحقق البيومتري والدخول بنجاح! 🚀');
      showDashboard();
    })
    .catch(function (err) {
      toast('فشلت عملية التحقق البيومتري: ' + err.message, 'error');
    });
  }

  // --- Task Dashboard logic ---
  function loadTasks() {
    if (!currentSession) return;
    tasksList.innerHTML = '<div class="loading-spinner">جاري تحميل مهامك اليومية...</div>';

    var client = window.RonaqSupabaseDb.getClient();
    client
      .rpc('get_staff_appointments', { p_staff_id: currentSession.id })
      .order('date', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        renderTasks(res.data || []);
      })
      .catch(function (err) {
        tasksList.innerHTML = '<p class="admin-hint" style="text-align:center; padding:20px; color:#c0392b;">فشل تحميل المهام: ' + err.message + '</p>';
      });
  }

  function renderTasks(list) {
    if (!list.length) {
      tasksList.innerHTML = '<p class="admin-hint" style="text-align:center; padding:30px;">لا توجد مهام مسندة إليك حالياً.</p>';
      return;
    }

    // Sort: today tasks first
    var todayStr = new Date().toISOString().split('T')[0];
    list.sort(function (a, b) {
      if (a.date === todayStr && b.date !== todayStr) return -1;
      if (b.date === todayStr && a.date !== todayStr) return 1;
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
    });

    var html = list.map(function (task) {
      var svcTitle = task.service_id;
      if (window.RonaqServicesStore) {
        var svc = window.RonaqServicesStore.getServiceById(task.service_id);
        if (svc) svcTitle = (svc.icon || '🛠️') + ' ' + svc.title;
      }

      var dateText = bookingStore.formatDateArabic(task.date);
      var timeText = bookingStore.formatTimeArabic(task.time);

      var cardClass = 'task-card';
      var statusBadge = '';
      if (task.status === 'completed') {
        cardClass += ' task-card--completed';
        statusBadge = '<span class="task-status-badge status-badge--completed">اكتمل العمل ✓</span>';
      } else if (task.status === 'started') {
        cardClass += ' task-card--started';
        statusBadge = '<span class="task-status-badge status-badge--started">قيد التنفيذ ⚙️</span>';
      } else {
        cardClass += ' task-card--pending';
        statusBadge = '<span class="task-status-badge status-badge--pending">بالانتظار ⏳</span>';
      }

      var phoneStr = task.phone.replace(/\D/g, '');
      var waMsg = `مرحباً ${task.customer_name}، معك الفني المسؤول (${currentSession.name}) من طرف المنشأة. أنا في طريقي إليك لتنفيذ خدمة ${task.service_id}.`;
      var waLink = 'https://wa.me/' + phoneStr + '?text=' + encodeURIComponent(waMsg);

      var googleMapLink = '';
      if (task.location_address) {
        googleMapLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(task.location_address);
      }

      return (
        '<div class="' + cardClass + '" data-task-id="' + task.id + '">' +
        '  <div class="task-header">' +
        '    <h4 class="task-title">' + esc(svcTitle) + '</h4>' +
        '    ' + statusBadge + ' ' +
        '  </div>' +
        '  <div class="task-meta">' +
        '    <strong>👤 العميل:</strong> ' + esc(task.customer_name) + '<br>' +
        '    <strong>📅 الموعد:</strong> ' + dateText + ' (الساعة ' + timeText + ')<br>' +
        '    ' + (task.district ? '<strong>📍 الحي:</strong> ' + esc(task.district) + '<br>' : '') +
        '    ' + (task.location_address ? '<strong>🏠 العنوان:</strong> ' + esc(task.location_address) + '<br>' : '') +
        '    ' + (task.notes ? '<strong>📝 ملاحظات العميل:</strong> ' + esc(task.notes) + '<br>' : '') +
        '  </div>' +
        '  <div class="task-actions">' +
        '    ' + (task.status !== 'completed' && task.status !== 'started'
               ? '<button type="button" class="btn btn--primary" data-action="start">⚙️ بدء العمل</button>'
               : '') +
        '    ' + (task.status === 'started'
               ? '<button type="button" class="btn btn--primary" style="background-color:var(--color-completed);" data-action="complete">✓ إكمال العمل</button>'
               : '') +
        '    <a href="' + waLink + '" class="btn btn--outline" target="_blank" rel="noopener">💬 واتساب</a>' +
        '    ' + (googleMapLink 
               ? '<a href="' + googleMapLink + '" class="btn btn--outline" target="_blank" rel="noopener">🗺️ خريطة الموقع</a>' 
               : '') +
        '  </div>' +
        '</div>'
      );
    }).join('');

    tasksList.innerHTML = html;

    // Bind action buttons
    tasksList.querySelectorAll('.task-card').forEach(function (card) {
      var taskId = card.getAttribute('data-task-id');
      
      var startBtn = card.querySelector('[data-action="start"]');
      if (startBtn) {
        startBtn.addEventListener('click', function () {
          updateTaskStatus(taskId, 'started');
        });
      }

      var completeBtn = card.querySelector('[data-action="complete"]');
      if (completeBtn) {
        completeBtn.addEventListener('click', function () {
          updateTaskStatus(taskId, 'completed');
        });
      }
    });
  }

  function updateTaskStatus(id, newStatus) {
    if (!window.RonaqSupabaseDb || !window.RonaqSupabaseDb.isConfigured()) return;
    toast('جاري تحديث حالة المهمة سحابياً...', 'warning');

    var client = window.RonaqSupabaseDb.getClient();
    client
      .rpc('update_staff_appointment_status', {
        p_appointment_id: id,
        p_staff_id: currentSession.id,
        p_new_status: newStatus
      })
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data || !res.data.success) {
          throw new Error(res.data ? res.data.error : 'فشل تحديث الحالة');
        }
        toast('تم تحديث حالة الموعد بنجاح');
        loadTasks();
      })
      .catch(function (err) {
        toast('فشل التحديث: ' + err.message, 'error');
      });
  }

  // --- Show Views ---
  function showDashboard() {
    panelLogin.hidden = true;
    panelDashboard.hidden = false;

    if (currentSession) {
      document.getElementById('staffGreeting').textContent = 'مرحباً، ' + currentSession.name;
      document.getElementById('staffPhoneDisplay').textContent = '📞 ' + currentSession.phone;
      
      var roleBadge = document.getElementById('staffRoleBadge');
      if (roleBadge) {
        roleBadge.textContent = currentSession.role === 'coordinator' ? 'مشرف / منسق' : 'فني صيانة';
      }
    }

    loadTasks();
  }

  function showLogin() {
    panelLogin.hidden = false;
    panelDashboard.hidden = true;

    // Check if we can show biometric login button
    var hasBiometricId = localStorage.getItem('ronaq_mken_staff_biometric_id');
    var isWebAuthnSupported = !!window.publicKeyCredential;
    if (btnBiometricLogin) {
      btnBiometricLogin.style.display = (hasBiometricId && isWebAuthnSupported) ? 'flex' : 'none';
    }

    var defaultTenant = parseQueryParam() || 'default';
    var tenantInput = document.getElementById('loginTenant');
    if (tenantInput && !tenantInput.value) {
      tenantInput.value = defaultTenant;
    }
  }

  function handleLogout() {
    clearSession();
    showLogin();
  }

  function initPage() {
    // Force PWA config init
    store.init().then(function () {
      var session = loadSession();
      if (session && window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
        showDashboard();
      } else {
        showLogin();
      }
    });

    if (loginForm) loginForm.addEventListener('submit', handleNormalLogin);
    if (btnBiometricLogin) btnBiometricLogin.addEventListener('click', loginBiometrically);
    if (btnEnrollBiometrics) btnEnrollBiometrics.addEventListener('click', enrollBiometrics);
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
  }

  initPage();
})();
