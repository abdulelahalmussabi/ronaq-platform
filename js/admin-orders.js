/**
 * إدارة طلبات الشراء (التجارة) — لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.MkenServicesStore;
  var orderStore = window.MkenOrderStore;
  if (!store || !orderStore) return;

  var filterActivity = document.getElementById('ordersActivityFilter');
  var ordersListContainer = document.getElementById('adminOrdersList');
  var saveBtn = document.getElementById('saveOrdersBtn');
  var exportBtn = document.getElementById('exportOrdersBtn');
  var importBtn = document.getElementById('importOrdersBtn');
  var importFile = document.getElementById('importOrdersFile');

  var _orders = [];

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

  function initFilters() {
    if (!filterActivity) return;
    var current = filterActivity.value || 'all';
    
    // Clear and add default
    filterActivity.innerHTML = '<option value="all">— كل الأنشطة —</option>';
    
    store.getOrderableActivities().forEach(function (act) {
      var opt = document.createElement('option');
      opt.value = act.id;
      opt.textContent = act.icon + ' ' + act.title;
      filterActivity.appendChild(opt);
    });
    
    filterActivity.value = current;
  }

  function loadOrders() {
    ordersListContainer.innerHTML = '<p class="admin-hint">جاري تحميل الطلبات...</p>';
    
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      return window.MkenSupabaseDb.fetchOrders(tenantSlug)
        .then(function (dbOrders) {
          _orders = dbOrders;
          // Sync back to local storage
          localStorage.setItem(orderStore.STORAGE_KEY, JSON.stringify(dbOrders));
          renderOrders();
        })
        .catch(function (err) {
          console.warn('Failed to load orders from Supabase, fallback to local', err);
          _orders = orderStore.getOrders();
          renderOrders();
        });
    } else {
      _orders = orderStore.getOrders();
      renderOrders();
      return Promise.resolve();
    }
  }

  function renderOrders() {
    if (!ordersListContainer) return;
    
    var actFilter = filterActivity ? filterActivity.value : 'all';
    var filtered = _orders.filter(function (ord) {
      if (actFilter !== 'all' && ord.activityId !== actFilter) return false;
      return true;
    });

    if (!filtered.length) {
      ordersListContainer.innerHTML = '<p class="admin-hint" style="text-align: center; padding: 30px;">لا توجد طلبات واردة حالياً.</p>';
      return;
    }

    ordersListContainer.innerHTML = filtered.map(function (ord) {
      var statusColor = '#777';
      var statusText = 'قيد الانتظار';
      if (ord.status === 'confirmed') { statusColor = '#2e7d32'; statusText = 'مؤكد'; }
      else if (ord.status === 'cancelled') { statusColor = '#c0392b'; statusText = 'ملغي'; }

      var payColor = '#777';
      var payText = 'غير مدفوع';
      if (ord.paymentStatus === 'paid') { payColor = '#2e7d32'; payText = 'مدفوع'; }
      else if (ord.paymentStatus === 'failed') { payColor = '#c0392b'; payText = 'فشل الدفع'; }
      else if (ord.paymentStatus === 'refunded') { payColor = '#0288d1'; payText = 'مسترجع'; }

      var itemsHtml = (ord.items || []).map(function (item) {
        return '<li>' + (item.icon || '🛒') + ' ' + esc(item.serviceTitle) + ' <strong>× ' + item.quantity + '</strong>' + 
          (item.priceLabel ? ' <span class="order-price">(' + esc(item.priceLabel) + ')</span>' : '') + '</li>';
      }).join('');

      var phoneStr = String(ord.phone || '').replace(/\D/g, '');
      var waMsg = orderStore.buildCartWhatsAppMessage(store.getBrand().name, ord);
      // If confirmed, update header
      if (ord.status === 'confirmed') {
        waMsg = waMsg.replace('طلب شراء', 'تم تأكيد طلب الشراء بنجاح');
        waMsg = waMsg.replace('يُرجى تأكيد الطلب والسعر النهائي', 'شكراً لتعاملك معنا! سنقوم بالتوصيل/التنفيذ قريباً.');
      }
      var waLink = 'https://wa.me/' + phoneStr + '?text=' + encodeURIComponent(waMsg);

      return (
        '<div class="admin-appointment-card" data-order-id="' + ord.id + '" style="border-right: 4px solid ' + statusColor + '; padding: 16px; background: #fff; margin-bottom: 12px; border-radius: var(--radius); border: 1px solid var(--color-border); border-right-width: 5px;">' +
        '  <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">' +
        '    <div>' +
        '      <span class="badge" style="background: var(--terracotta-50); color: var(--color-primary); margin-bottom: 8px;">' + esc(ord.activityTitle || ord.activityId) + '</span>' +
        '      <h4 style="margin: 4px 0 8px 0; font-size: 1.05rem; color: var(--terracotta-900);">' + esc(ord.customerName) + '</h4>' +
        '      <p style="margin: 2px 0; font-size: 0.85rem; color: var(--color-text-muted);">📞 ' + esc(ord.phone) + '</p>' +
        '      ' + (ord.district ? '<p style="margin: 2px 0; font-size: 0.85rem; color: var(--color-text-muted);">📍 الحي: ' + esc(ord.district) + '</p>' : '') +
        '      ' + (ord.locationAddress ? '<p style="margin: 2px 0; font-size: 0.85rem; color: var(--color-text-muted);">🏠 العنوان: ' + esc(ord.locationAddress) + '</p>' : '') +
        '      ' + (ord.notes ? '<p style="margin: 6px 0; font-size: 0.85rem; padding: 6px; background: #fdf6f0; border-radius: 4px; color: #8a6d3b;">📝 ملاحظات: ' + esc(ord.notes) + '</p>' : '') +
        '      <div style="margin-top: 10px;">' +
        '        <strong style="font-size: 0.88rem; display: block; margin-bottom: 4px; color: var(--terracotta-800);">المنتجات المطلوبة:</strong>' +
        '        <ul style="padding-right: 16px; margin: 0; font-size: 0.88rem; line-height: 1.5;">' + itemsHtml + '</ul>' +
        '      </div>' +
        '    </div>' +
        '    <div style="text-align: left; display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">' +
        '      <span style="font-size: 0.75rem; color: var(--color-text-muted);">' + formatDate(ord.createdAt) + '</span>' +
        '      <div style="display: flex; gap: 6px; margin-top: 4px;">' +
        '        <span class="badge" style="background: ' + statusColor + '20; color: ' + statusColor + '; font-weight: bold;">الحالة: ' + statusText + '</span>' +
        '        <span class="badge" style="background: ' + payColor + '20; color: ' + payColor + '; font-weight: bold;">الدفع: ' + payText + '</span>' +
        '      </div>' +
        '      ' + (ord.paymentId ? '<span style="font-size: 0.75rem; color: var(--color-text-muted); display:block;">رقم العملية: ' + esc(ord.paymentId) + ' (' + esc(ord.paymentMethod) + ')</span>' : '') +
        '      ' + (ord.paymentAmount ? '<span style="font-size: 0.82rem; font-weight: bold; color: var(--color-primary);">المبلغ: ' + ord.paymentAmount + ' ريال</span>' : '') +
        '      <div style="display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;">' +
        '        <select class="admin-input btn--sm" data-action="status" style="width: auto; padding: 4px 8px;" title="تعديل الحالة">' +
        '          <option value="pending"' + (ord.status === 'pending' ? ' selected' : '') + '>قيد الانتظار</option>' +
        '          <option value="confirmed"' + (ord.status === 'confirmed' ? ' selected' : '') + '>تأكيد الطلب</option>' +
        '          <option value="cancelled"' + (ord.status === 'cancelled' ? ' selected' : '') + '>إلغاء الطلب</option>' +
        '        </select>' +
        '        <select class="admin-input btn--sm" data-action="payment" style="width: auto; padding: 4px 8px;" title="حالة الدفع">' +
        '          <option value="unpaid"' + (ord.paymentStatus === 'unpaid' ? ' selected' : '') + '>غير مدفوع</option>' +
        '          <option value="paid"' + (ord.paymentStatus === 'paid' ? ' selected' : '') + '>مدفوع</option>' +
        '          <option value="failed"' + (ord.paymentStatus === 'failed' ? ' selected' : '') + '>فشل الدفع</option>' +
        '          <option value="refunded"' + (ord.paymentStatus === 'refunded' ? ' selected' : '') + '>مسترجع</option>' +
        '        </select>' +
        '        <a href="' + waLink + '" class="btn btn--outline btn--sm" target="_blank" rel="noopener" style="padding: 4px 8px;">💬 واتساب</a>' +
        '        <button type="button" class="btn btn--outline btn--sm" data-action="delete" style="padding: 4px 8px; color: #c0392b; border-color: #c0392b20;">حذف</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      );
    }).join('');

    // Wire up actions
    ordersListContainer.querySelectorAll('[data-order-id]').forEach(function (card) {
      var id = card.getAttribute('data-order-id');
      
      var statusSelect = card.querySelector('[data-action="status"]');
      if (statusSelect) {
        statusSelect.addEventListener('change', function () {
          updateOrderStatus(id, statusSelect.value);
        });
      }

      var paySelect = card.querySelector('[data-action="payment"]');
      if (paySelect) {
        paySelect.addEventListener('change', function () {
          updateOrderPayment(id, paySelect.value);
        });
      }

      var deleteBtn = card.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          if (confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) {
            deleteOrderCard(id);
          }
        });
      }
    });
  }

  function updateOrderStatus(id, status) {
    var updated = orderStore.updateOrder(id, { status: status });
    if (updated) {
      toast('تم تحديث حالة الطلب بنجاح');
      if (status === 'confirmed' && window.MkenWhatsappAutomation) {
        var config = window.MkenServicesStore ? window.MkenServicesStore.loadConfig() : {};
        window.MkenWhatsappAutomation.sendOrderConfirmation(updated, config)
          .catch(function (err) {
            console.error('Failed to send order confirmation:', err);
          });
      }
      loadOrders();
    } else {
      toast('فشل تحديث حالة الطلب', 'error');
    }
  }

  function updateOrderPayment(id, paymentStatus) {
    var patch = { paymentStatus: paymentStatus };
    if (paymentStatus === 'paid') {
      patch.paymentMethod = patch.paymentMethod || 'manual';
    }
    var updated = orderStore.updateOrder(id, patch);
    if (updated) {
      toast('تم تحديث حالة الدفع بنجاح');
      loadOrders();
    } else {
      toast('فشل تحديث حالة الدفع', 'error');
    }
  }

  function deleteOrderCard(id) {
    var success = orderStore.removeOrder(id);
    if (success) {
      toast('تم حذف الطلب بنجاح');
      loadOrders();
    } else {
      toast('فشل حذف الطلب', 'error');
    }
  }

  function bindEvents() {
    if (filterActivity) {
      filterActivity.addEventListener('change', renderOrders);
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        loadOrders().then(function () {
          toast('تم تحديث ومزامنة الطلبات بنجاح');
        });
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var blob = new Blob([JSON.stringify({ orders: _orders, updatedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'orders.json';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('تم تنزيل ملف النسخ الاحتياطي للطلبات');
      });
    }

    if (importBtn && importFile) {
      importBtn.addEventListener('click', function () {
        importFile.click();
      });
      importFile.addEventListener('change', function () {
        var file = importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var parsed = JSON.parse(e.target.result);
            var list = Array.isArray(parsed && parsed.orders) ? parsed.orders : [];
            if (!list.length) {
              toast('الملف لا يحتوي على طلبات صالحة', 'error');
              return;
            }
            orderStore.saveOrdersBulk(list);
            toast('تم استيراد الطلبات وحفظها بنجاح!');
            loadOrders();
          } catch (err) {
            toast('فشل قراءة ملف النسخ الاحتياطي', 'error');
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function refresh() {
    initFilters();
    loadOrders();
  }

  window.MkenAdminOrders = {
    refresh: refresh,
    loadOrders: loadOrders
  };

  bindEvents();
})();
