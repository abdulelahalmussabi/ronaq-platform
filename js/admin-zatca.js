/**
 * Mken Platform - ZATCA Integration Dashboard Controller
 */
(function () {
  'use strict';

  var store = window.MkenServicesStore;
  if (!store) return;

  var onboardBtn = document.getElementById('startZatcaOnboardingBtn');
  var logsContainer = document.getElementById('zatcaLogs');
  var statusIndicator = document.getElementById('zatcaStatusIndicator');
  var statusText = document.getElementById('zatcaStatusText');
  var statusSub = document.getElementById('zatcaStatusSub');
  var configForm = document.getElementById('zatcaConfigForm');

  var currentTenant = '';

  function toast(msg, type) {
    if (window.MkenAdminToast) window.MkenAdminToast(msg, type);
  }

  // Load and refresh ZATCA tab status
  function refreshZatcaStatus() {
    currentTenant = store.getCurrentTenantSlug() || 'default';
    var isCloud = window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured();

    if (!isCloud) {
      statusIndicator.textContent = '🟡';
      statusText.textContent = 'الربط السحابي غير مفعل';
      statusSub.textContent = 'يتطلب تفعيل ربط Supabase لحفظ مفاتيح التشفير.';
      onboardBtn.disabled = true;
      return;
    }

    onboardBtn.disabled = false;
    
    // Fetch status from API
    var pin = localStorage.getItem('mken_admin_pin') || '';
    
    fetch('/api/v1/zatca?action=status&tenantSlug=' + encodeURIComponent(currentTenant), {
      headers: {
        'x-admin-pin': pin
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch ZATCA status');
        return res.json();
      })
      .then(function (data) {
        if (data.configured) {
          statusIndicator.textContent = data.isSimulated ? '🟢 (تجريبي)' : '🟢';
          statusText.textContent = data.statusText;
          statusSub.textContent = 'الرقم الضريبي: ' + data.vatNumber + ' | تاريخ الربط: ' + new Date(data.onboardingDate).toLocaleDateString('ar-SA');
          
          // Populate fields
          document.getElementById('zatcaVat').value = data.vatNumber || '';
          document.getElementById('zatcaBusinessName').value = data.businessName || '';
          document.getElementById('zatcaEnv').value = data.environment || 'sandbox';
        } else {
          statusIndicator.textContent = '🔴';
          statusText.textContent = 'غير متصل بالهيئة';
          statusSub.textContent = 'المنشأة غير مسجلة حالياً في نظام الفوترة الإلكترونية.';
        }
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  // Onboard Action
  if (onboardBtn) {
    onboardBtn.addEventListener('click', function () {
      var vat = document.getElementById('zatcaVat').value.trim();
      var name = document.getElementById('zatcaBusinessName').value.trim();
      var otp = document.getElementById('zatcaOtp').value.trim();
      var env = document.getElementById('zatcaEnv').value;
      var cat = document.getElementById('zatcaCategory').value.trim();
      var city = document.getElementById('zatcaCity').value.trim();
      var district = document.getElementById('zatcaDistrict').value.trim();
      var street = document.getElementById('zatcaStreet').value.trim();
      var building = document.getElementById('zatcaBuilding').value.trim();

      if (!vat || !name || !otp) {
        toast('يرجى ملء جميع الحقول الإلزامية (الرقم الضريبي، الاسم، والـ OTP)', 'error');
        return;
      }

      onboardBtn.disabled = true;
      onboardBtn.textContent = '⏳ جاري الاتصال بالهيئة والتحقق...';
      logsContainer.textContent = '[بدء الفحص والامتثال]\n';

      var pin = localStorage.getItem('mken_admin_pin') || '';

      fetch('/api/v1/zatca', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': pin
        },
        body: JSON.stringify({
          action: 'onboard',
          tenantSlug: currentTenant,
          vatNumber: vat,
          otp: otp,
          businessName: name,
          environment: env,
          businessCategory: cat,
          city: city,
          district: district,
          street: street,
          buildingNo: building
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'حدث خطأ أثناء الاتصال بالهيئة');
            return data;
          });
        })
        .then(function (data) {
          toast('تم الربط والتحقق بنجاح مع ZATCA!', 'success');
          if (data.logs && data.logs.length) {
            logsContainer.textContent = data.logs.join('\n');
          }
          refreshZatcaStatus();
        })
        .catch(function (err) {
          toast(err.message, 'error');
          logsContainer.textContent += '\n[خطأ]: ' + err.message;
        })
        .finally(function () {
          onboardBtn.disabled = false;
          onboardBtn.textContent = '🇸🇦 بدء عملية الربط والتحقق الذكي';
        });
    });
  }

  // Register this tab controller in the admin suite
  window.MkenAdminZatca = {
    refresh: refreshZatcaStatus
  };

  // Trigger loading status if currently active
  setTimeout(function () {
    var activeTab = document.querySelector('.admin-tab--active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'zatca') {
      refreshZatcaStatus();
    }
  }, 500);

})();
