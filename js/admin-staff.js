/**
 * إدارة الموظفين والفنيين — لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.RonaqServicesStore;
  if (!store) return;

  var staffListContainer = document.getElementById('adminStaffList');
  var staffModal = document.getElementById('staffModal');
  var staffForm = document.getElementById('staffForm');
  var addStaffBtn = document.getElementById('addStaffBtn');
  var staffModalCancel = document.getElementById('staffModalCancel');

  var _staffList = [];
  var editingId = null;

  function toast(msg, type) {
    if (window.RonaqAdminToast) window.RonaqAdminToast(msg, type);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function loadStaff() {
    if (staffListContainer) {
      staffListContainer.innerHTML = '<p class="admin-hint">جاري تحميل الفنيين والموظفين...</p>';
    }

    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      return window.RonaqSupabaseDb.fetchStaff(tenantSlug)
        .then(function (dbStaff) {
          _staffList = dbStaff;
          localStorage.setItem('ronaq_mken_staff', JSON.stringify(dbStaff));
          renderStaff();
        })
        .catch(function (err) {
          console.warn('Failed to fetch staff from Supabase, trying local fallback', err);
          loadLocalStaff();
        });
    } else {
      loadLocalStaff();
      return Promise.resolve();
    }
  }

  function loadLocalStaff() {
    try {
      var raw = localStorage.getItem('ronaq_mken_staff');
      _staffList = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _staffList = [];
    }
    renderStaff();
  }

  function renderStaff() {
    if (!staffListContainer) return;
    if (!_staffList.length) {
      staffListContainer.innerHTML = '<p class="admin-hint" style="text-align:center; padding:20px;">لا يوجد موظفون أو فنيون مسجلون حالياً.</p>';
      return;
    }

    var html = 
      '<div style="overflow-x:auto; background:#fff; border:1px solid var(--color-border); border-radius:var(--radius);">' +
      '  <table class="admin-table" style="width:100%; border-collapse:collapse; text-align:right;">' +
      '    <thead>' +
      '      <tr style="background:#f9f8f6; border-bottom:1px solid var(--color-border);">' +
      '        <th style="padding:12px;">الاسم</th>' +
      '        <th style="padding:12px;">الجوال</th>' +
      '        <th style="padding:12px;">الدور الوظيفي</th>' +
      '        <th style="padding:12px;">رمز PIN</th>' +
      '        <th style="padding:12px;">الحالة</th>' +
      '        <th style="padding:12px; text-align:left;">إجراءات</th>' +
      '      </tr>' +
      '    </thead>' +
      '    <tbody>' +
      _staffList.map(function (s) {
        var roleText = s.role === 'coordinator' ? 'منسّق مواعيد / مشرف' : 'فني صيانة / منفّذ خدمة';
        var statusColor = s.status === 'active' ? '#2e7d32' : '#c0392b';
        var statusText = s.status === 'active' ? 'نشط' : 'غير نشط';
        return (
          '      <tr style="border-bottom:1px solid var(--color-border);">' +
          '        <td style="padding:12px; font-weight:bold;">' + esc(s.name) + '</td>' +
          '        <td style="padding:12px;" dir="ltr">' + esc(s.phone) + '</td>' +
          '        <td style="padding:12px;">' + roleText + '</td>' +
          '        <td style="padding:12px; font-family:monospace; font-weight:bold;">' + esc(s.pinCode) + '</td>' +
          '        <td style="padding:12px;"><span style="color:' + statusColor + '; font-weight:bold;">● ' + statusText + '</span></td>' +
          '        <td style="padding:12px; text-align:left;">' +
          '          <button type="button" class="btn btn--outline btn--sm" data-edit-staff="' + s.id + '" style="padding:3px 8px;">تعديل</button>' +
          '          <button type="button" class="btn btn--outline btn--sm" data-delete-staff="' + s.id + '" style="padding:3px 8px; color:#c0392b; border-color:#c0392b15; margin-right:5px;">حذف</button>' +
          '        </td>' +
          '      </tr>'
        );
      }).join('') +
      '    </tbody>' +
      '  </table>' +
      '</div>';

    staffListContainer.innerHTML = html;

    // Bind item buttons
    staffListContainer.querySelectorAll('[data-edit-staff]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(btn.getAttribute('data-edit-staff'));
      });
    });

    staffListContainer.querySelectorAll('[data-delete-staff]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-delete-staff');
        var member = _staffList.find(function (s) { return s.id === id; });
        if (member && confirm('هل أنت متأكد من حذف الموظف/الفني "' + member.name + '"؟')) {
          deleteStaffMember(id);
        }
      });
    });
  }

  function openModal(id) {
    editingId = id || null;
    var title = document.getElementById('staffModalTitle');
    if (title) title.textContent = editingId ? 'تعديل بيانات فني/موظف' : 'إضافة فني/موظف جديد';

    if (editingId) {
      var s = _staffList.find(function (x) { return x.id === editingId; });
      if (s) {
        document.getElementById('staffName').value = s.name;
        document.getElementById('staffPhone').value = s.phone;
        document.getElementById('staffEmail').value = s.email || '';
        document.getElementById('staffRole').value = s.role;
        document.getElementById('staffPin').value = s.pinCode;
        document.getElementById('staffStatus').value = s.status;
      }
    } else {
      if (staffForm) staffForm.reset();
      document.getElementById('staffRole').value = 'technician';
      document.getElementById('staffStatus').value = 'active';
    }

    if (staffModal) staffModal.hidden = false;
  }

  function closeModal() {
    if (staffModal) staffModal.hidden = true;
    editingId = null;
  }

  function deleteStaffMember(id) {
    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      window.RonaqSupabaseDb.deleteStaff(id)
        .then(function () {
          toast('تم حذف الموظف بنجاح');
          loadStaff();
        })
        .catch(function (err) {
          toast('فشل حذف الموظف من السحابة: ' + err.message, 'error');
        });
    } else {
      _staffList = _staffList.filter(function (s) { return s.id !== id; });
      localStorage.setItem('ronaq_mken_staff', JSON.stringify(_staffList));
      toast('تم الحذف محلياً');
      renderStaff();
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    var name = document.getElementById('staffName').value.trim();
    var phone = document.getElementById('staffPhone').value.trim();
    var email = document.getElementById('staffEmail').value.trim();
    var role = document.getElementById('staffRole').value;
    var pinCode = document.getElementById('staffPin').value.trim();
    var status = document.getElementById('staffStatus').value;

    if (!name || !phone || !pinCode) {
      toast('يرجى تعبئة كافة الحقول الإلزامية', 'error');
      return;
    }
    if (editingId && pinCode === '****') {
      // Keep existing PIN, valid
    } else if (pinCode.length !== 4 || isNaN(pinCode)) {
      toast('يجب أن يتكون رمز PIN من 4 أرقام فقط', 'error');
      return;
    }

    var id = editingId || 'stf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var member = {
      id: id,
      tenantSlug: store.getCurrentTenantSlug() || 'default',
      name: name,
      phone: phone,
      email: email || null,
      role: role,
      pinCode: pinCode,
      status: status
    };

    if (window.RonaqSupabaseDb && window.RonaqSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      window.RonaqSupabaseDb.saveStaff(member, tenantSlug)
        .then(function () {
          toast('تم حفظ بيانات الموظف بنجاح سحابياً');
          closeModal();
          loadStaff();
        })
        .catch(function (err) {
          toast('فشل الحفظ في السحابة: ' + err.message, 'error');
        });
    } else {
      var found = false;
      _staffList = _staffList.map(function (x) {
        if (x.id !== id) return x;
        found = true;
        if (member.pinCode === '****') {
          member.pinCode = x.pinCode;
        }
        return member;
      });
      if (!found) _staffList.push(member);
      localStorage.setItem('ronaq_mken_staff', JSON.stringify(_staffList));
      toast('تم الحفظ محلياً بنجاح');
      closeModal();
      renderStaff();
    }
  }

  function getStaffList() {
    return _staffList;
  }

  function getStaffName(id) {
    var found = _staffList.find(function (s) { return s.id === id; });
    return found ? found.name : '';
  }

  function refresh() {
    loadStaff();
    
    // Update staff portal link in UI to reflect correct tenant query param
    var link = document.getElementById('staffPortalLink');
    if (link) {
      var tenantSlug = store.getCurrentTenantSlug() || 'default';
      link.href = 'staff.html?tenant=' + encodeURIComponent(tenantSlug);
      link.textContent = 'staff.html?tenant=' + esc(tenantSlug);
    }
  }

  function bindEvents() {
    if (addStaffBtn) addStaffBtn.addEventListener('click', function () { openModal(null); });
    if (staffModalCancel) staffModalCancel.addEventListener('click', closeModal);
    if (staffForm) staffForm.addEventListener('submit', handleFormSubmit);

    // Wire closing modal on backdrop click
    if (staffModal) {
      staffModal.addEventListener('click', function (e) {
        if (e.target === staffModal) closeModal();
      });
    }
  }

  window.RonaqAdminStaff = {
    refresh: refresh,
    getStaffList: getStaffList,
    getStaffName: getStaffName
  };

  bindEvents();
})();
