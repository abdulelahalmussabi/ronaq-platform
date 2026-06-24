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
      else if (ord.status === 'measurements_pending') { statusColor = '#f2994a'; statusText = 'بانتظار القياسات'; }
      else if (ord.status === 'cutting') { statusColor = '#0288d1'; statusText = 'مرحلة القص ✂️'; }
      else if (ord.status === 'stitching') { statusColor = '#9b51e0'; statusText = 'تحت الخياطة 🪡'; }
      else if (ord.status === 'ironing_packaging') { statusColor = '#f2c94c'; statusText = 'الكي والتجهيز 🌟'; }
      else if (ord.status === 'ready') { statusColor = '#27ae60'; statusText = 'جاهز للتسليم 📦'; }
      else if (ord.status === 'completed') { statusColor = '#2e7d32'; statusText = 'تم التسليم'; }

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


      var isTailoring = ord.activityId === 'tailoring' || ord.activityId === 'military-tailoring';
      var statusSelectHtml = '';
      if (isTailoring) {
        statusSelectHtml = 
          '        <select class="admin-input btn--sm" data-action="status" style="width: auto; padding: 4px 8px;" title="تعديل الحالة">' +
          '          <option value="pending"' + (ord.status === 'pending' ? ' selected' : '') + '>قيد الانتظار</option>' +
          '          <option value="measurements_pending"' + (ord.status === 'measurements_pending' ? ' selected' : '') + '>بانتظار القياسات</option>' +
          '          <option value="cutting"' + (ord.status === 'cutting' ? ' selected' : '') + '>مرحلة القص ✂️</option>' +
          '          <option value="stitching"' + (ord.status === 'stitching' ? ' selected' : '') + '>تحت الخياطة 🪡</option>' +
          '          <option value="ironing_packaging"' + (ord.status === 'ironing_packaging' ? ' selected' : '') + '>الكي والتجهيز 🌟</option>' +
          '          <option value="ready"' + (ord.status === 'ready' ? ' selected' : '') + '>جاهز للتسليم 📦</option>' +
          '          <option value="completed"' + (ord.status === 'completed' ? ' selected' : '') + '>تم التسليم</option>' +
          '          <option value="cancelled"' + (ord.status === 'cancelled' ? ' selected' : '') + '>إلغاء الطلب</option>' +
          '        </select>';
      } else {
        statusSelectHtml =
          '        <select class="admin-input btn--sm" data-action="status" style="width: auto; padding: 4px 8px;" title="تعديل الحالة">' +
          '          <option value="pending"' + (ord.status === 'pending' ? ' selected' : '') + '>قيد الانتظار</option>' +
          '          <option value="confirmed"' + (ord.status === 'confirmed' ? ' selected' : '') + '>تأكيد الطلب</option>' +
          '          <option value="cancelled"' + (ord.status === 'cancelled' ? ' selected' : '') + '>إلغاء الطلب</option>' +
          '        </select>';
      }

      var tailoringDetailsHtml = '';
      if (ord.tailoringDetails) {
        var td = ord.tailoringDetails;
        if (ord.activityId === 'military-tailoring') {
          var branchNameAr = '';
          if (td.militaryBranch === 'defense') branchNameAr = 'وزارة الدفاع';
          else if (td.militaryBranch === 'national_guard') branchNameAr = 'وزارة الحرس الوطني';
          else if (td.militaryBranch === 'interior') branchNameAr = 'وزارة الداخلية';
          else if (td.militaryBranch === 'state_security') branchNameAr = 'رئاسة أمن الدولة';

          var rankNameAr = '';
          if (td.militaryRank === 'soldier') rankNameAr = 'جندي إلى وكيل رقيب';
          else if (td.militaryRank === 'sergeant') rankNameAr = 'رقيب إلى رئيس رقباء';
          else if (td.militaryRank === 'officer_junior') rankNameAr = 'ملازم إلى نقيب';
          else if (td.militaryRank === 'officer_senior') rankNameAr = 'رائد إلى عقيد';
          else if (td.militaryRank === 'officer_general') rankNameAr = 'عميد وأعلى';

          var typeNameAr = '';
          if (td.militaryUniformType === 'camo_field') typeNameAr = 'ميدانية / مموه';
          else if (td.militaryUniformType === 'office') typeNameAr = 'مكتبية / يومية';
          else if (td.militaryUniformType === 'ceremonial') typeNameAr = 'مراسم / رسمية';

          var isVerified = ord.militaryVerified || false;
          var verifBadge = isVerified 
            ? '<span class="badge" style="background: #2e7d3220; color: #2e7d32; font-weight: bold; margin-top: 6px;">✓ تم مطابقة الهوية العسكرية</span>'
            : '<span class="badge" style="background: #c0392b20; color: #c0392b; font-weight: bold; margin-top: 6px;">⚠️ بانتظار مطابقة الهوية العسكرية</span>';

          tailoringDetailsHtml = 
            '<div style="margin-top: 10px; padding: 10px; background: #f0f4c320; border: 1px solid #d4e15780; border-radius: 6px; font-size: 0.85rem; text-align: right; width: 100%; box-sizing: border-box;">' +
            '  <strong style="color: #558b2f; display: block; margin-bottom: 4px;">🎯 تفاصيل البدلة العسكرية ومطابقة الهوية:</strong>' +
            '  <div>القطاع: ' + esc(branchNameAr) + ' | النوع: ' + esc(typeNameAr) + '</div>' +
            '  <div>الرتبة: ' + esc(rankNameAr) + ' | الرقم العسكري: <code>' + esc(td.militaryIdNumber) + '</code></div>' +
            '  <div style="margin-top: 6px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">' +
                 verifBadge +
                 (!isVerified ? '<button type="button" class="btn btn--sm" data-action="verify-military" style="padding: 2px 8px; font-size: 0.75rem; background: #558b2f; color: #fff; border:none; border-radius:3px; cursor:pointer; font-weight: bold;">تأكيد مطابقة الهوية العسكرية</button>' : '') +
            '  </div>' +
            (td.measurements ? 
            '  <div style="margin-top: 8px; font-size: 0.8rem; color: #555; border-top: 1px dashed #d4e15780; padding-top: 6px;">' +
            '    <strong>المقاسات:</strong> السترة: ' + td.measurements.jacketLength + 'سم | الكتف: ' + td.measurements.shoulder + 'سم | الصدر: ' + td.measurements.chest + 'سم | الكم: ' + td.measurements.sleeve + 'سم | البنطلون: ' + td.measurements.trouserLength + 'سم | الخصر: ' + td.measurements.waist + 'سم | الرقبة: ' + td.measurements.neck + 'سم' +
            '  </div>' : '') +
            '</div>';
        } else {
          var collarName = td.collar === 'round_hard' ? 'سعودي كلاسيك' : (td.collar === 'round_soft' ? 'قلاب لين' : 'كويتي سادة');
          var cuffName = td.cuff === 'cuff_normal' ? 'عادي بزرار' : (td.cuff === 'cuff_french' ? 'فرنسي كبك' : 'سادة مفتوح');
          var pocketName = td.pocket === 'hidden_side' ? 'جانبي مخفي' : (td.pocket === 'visible_chest' ? 'أمامي صدر' : 'جانبي وصدري');
          var placketName = td.placket === 'hidden_buttons' ? 'مخفية مغطاة' : 'ظاهرة';
          tailoringDetailsHtml = 
            '<div style="margin-top: 10px; padding: 10px; background: #e3f2fd20; border: 1px solid #90caf980; border-radius: 6px; font-size: 0.85rem; text-align: right; width: 100%; box-sizing: border-box;">' +
            '  <strong style="color: #1565c0; display: block; margin-bottom: 4px;">تفاصيل تصميم الثوب:</strong>' +
            '  <div>الياقة: ' + esc(collarName) + ' | الأكمام: ' + esc(cuffName) + ' | الجيب: ' + esc(pocketName) + ' | الأزرار: ' + esc(placketName) + '</div>' +
            (td.measurements ? 
            '  <div style="margin-top: 8px; font-size: 0.8rem; color: #555; border-top: 1px dashed #90caf980; padding-top: 6px;">' +
            '    <strong>المقاسات:</strong> الطول: ' + td.measurements.height + 'سم | الكتف: ' + td.measurements.shoulder + 'سم | الصدر: ' + td.measurements.chest + 'سم | الكم: ' + td.measurements.sleeve + 'سم | الرقبة: ' + td.measurements.neck + 'سم' +
            '  </div>' : '') +
            '</div>';
        }
      }

      return (
        '<div class="admin-appointment-card" data-order-id="' + ord.id + '" style="border-right: 4px solid ' + statusColor + '; padding: 16px; background: #fff; margin-bottom: 12px; border-radius: var(--radius); border: 1px solid var(--color-border); border-right-width: 5px;">' +
        '  <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">' +
        '    <div style="flex: 1; min-width: 280px;">' +
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
        '      ' + tailoringDetailsHtml +
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
        '        ' + statusSelectHtml +
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

      var verifyMilBtn = card.querySelector('[data-action="verify-military"]');
      if (verifyMilBtn) {
        verifyMilBtn.addEventListener('click', function () {
          verifyMilitaryOrder(id);
        });
      }
    });
  }

  function deductTailoringInventory(order) {
    var tenantSlug = store.getCurrentTenantSlug() || 'default';
    
    // 1. Calculate fabric consumed
    var fabricItem = (order.items || []).find(function (item) {
      return item.serviceId.indexOf('fabric-') === 0 || item.serviceId.indexOf('uniform-') === 0;
    });
    if (!fabricItem) return;

    var metersUsed = 3.5;
    if (order.tailoringDetails && order.tailoringDetails.measurements) {
      if (order.activityId === 'military-tailoring') {
        var jacket = order.tailoringDetails.measurements.jacketLength || 75;
        var trouser = order.tailoringDetails.measurements.trouserLength || 102;
        metersUsed = parseFloat(((jacket + trouser) * 2.1 / 100 + 0.3).toFixed(1));
        if (isNaN(metersUsed) || metersUsed < 1) metersUsed = 4.0;
      } else if (order.tailoringDetails.measurements.height) {
        var h = order.tailoringDetails.measurements.height;
        metersUsed = parseFloat(((h * 2.3) / 100 + 0.2).toFixed(1));
        if (isNaN(metersUsed) || metersUsed < 1) metersUsed = 3.5;
      }
    }

    var deductions = [
      { id: fabricItem.serviceId, qty: metersUsed, notes: order.activityId === 'military-tailoring' ? 'قص قماش للبدلة العسكرية' : 'قص قماش للثوب' }
    ];

    var design = order.tailoringDetails || {};
    var placket = design.placket || '';

    if (order.activityId === 'military-tailoring') {
      deductions.push({ name: 'أزرار عسكرية', searchKeyword: 'زرار', qty: 8, notes: 'أزرار للبدلة العسكرية' });
      deductions.push({ name: 'حشوة ياقة عسكرية', searchKeyword: 'حشوة', qty: 1.0, notes: 'حشوة وجبزور للبدلة' });
      deductions.push({ name: 'كرتون تغليف فاخر', searchKeyword: 'كرتون', qty: 1, notes: 'صندوق التغليف للبدلة' });
    } else {
      deductions.push({ name: 'أزرار ثياب بيضاء', searchKeyword: 'زرار', qty: 5, notes: 'أزرار للثوب' });
      deductions.push({ name: 'حشوة ياقة لاصقة', searchKeyword: 'حشوة', qty: 0.5, notes: 'حشوة ياقة وجبزور' });
      deductions.push({ name: 'كرتون تغليف فاخر', searchKeyword: 'كرتون', qty: 1, notes: 'صندوق التغليف' });
      if (placket === 'hidden_buttons') {
        deductions.push({ name: 'سحاب مخفي ثياب', searchKeyword: 'سحاب', qty: 1, notes: 'سحاب مخفي للصدر' });
      }
    }

    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var client = window.MkenSupabaseDb.getClient();
      window.MkenSupabaseDb.fetchInventoryItems(tenantSlug).then(function (dbItems) {
        deductions.forEach(function (d) {
          var targetItem = null;
          if (d.id) {
            targetItem = dbItems.find(function (x) { return x.id === d.id; });
          } else {
            targetItem = dbItems.find(function (x) {
              return x.name.indexOf(d.searchKeyword) !== -1;
            });
          }

          if (targetItem) {
            client.rpc('deduct_inventory_stock', {
              p_tenant: tenantSlug,
              p_item_id: targetItem.id,
              p_quantity: d.qty,
              p_reference_id: order.id
            }).then(function () {
              client.from('mken_inventory_transactions').insert({
                tenant_slug: tenantSlug,
                item_id: targetItem.id,
                type: 'stock-out',
                quantity: d.qty,
                reference_id: order.id,
                notes: 'استهلاك تلقائي: ' + d.notes + ' لطلب تفصيل رقم ' + order.id
              });
            });
          }
        });
      });
    } else {
      // Local fallback
      var localItems = [];
      try {
        localItems = JSON.parse(localStorage.getItem('mken_inventory_items') || '[]');
      } catch (e) {}

      deductions.forEach(function (d) {
        var targetItem = null;
        if (d.id) {
          targetItem = localItems.find(function (x) { return x.id === d.id; });
        } else {
          targetItem = localItems.find(function (x) {
            return x.name.indexOf(d.searchKeyword) !== -1;
          });
        }

        if (targetItem) {
          targetItem.quantity = parseFloat((targetItem.quantity - d.qty).toFixed(2));
          if (targetItem.quantity < 0) targetItem.quantity = 0;
          
          var localTx = [];
          try {
            localTx = JSON.parse(localStorage.getItem('mken_inventory_transactions') || '[]');
          } catch (e) {}
          localTx.push({
            itemId: targetItem.id,
            type: 'stock-out',
            quantity: d.qty,
            referenceId: order.id,
            notes: 'استهلاك تلقائي: ' + d.notes + ' لطلب تفصيل رقم ' + order.id,
            createdAt: new Date().toISOString()
          });
          localStorage.setItem('mken_inventory_transactions', JSON.stringify(localTx));
        }
      });
      localStorage.setItem('mken_inventory_items', JSON.stringify(localItems));
    }
  }

  function verifyMilitaryOrder(id) {
    var updated = orderStore.updateOrder(id, { militaryVerified: true });
    if (updated) {
      toast('تم التحقق من الهوية العسكرية وتأكيدها بنجاح');
      loadOrders();
    } else {
      toast('فشل تأكيد التحقق', 'error');
    }
  }

  function updateOrderStatus(id, status) {
    var ord = _orders.find(function (x) { return x.id === id; });
    if (ord && ord.activityId === 'military-tailoring' && !ord.militaryVerified && (status === 'cutting' || status === 'stitching' || status === 'ironing_packaging' || status === 'ready' || status === 'completed')) {
      toast('لا يمكن البدء بالتفصيل أو تعديل الحالة قبل التحقق من الهوية العسكرية ومطابقتها!', 'error');
      loadOrders();
      return;
    }

    var updated = orderStore.updateOrder(id, { status: status });
    if (updated) {
      toast('تم تحديث حالة الطلب بنجاح');
      var config = window.MkenServicesStore ? window.MkenServicesStore.loadConfig() : {};
      
      // WhatsApp notifications
      if (window.MkenWhatsappAutomation) {
        if (status === 'confirmed') {
          window.MkenWhatsappAutomation.sendOrderConfirmation(updated, config)
            .catch(function (err) {
              console.error('Failed to send order confirmation:', err);
            });
        } else {
          window.MkenWhatsappAutomation.sendOrderStatusUpdate(updated, status, config)
            .catch(function (err) {
              console.error('Failed to send status update notification:', err);
            });
        }
      }

      // Auto inventory deduction when status becomes "cutting"
      if (status === 'cutting' && (updated.activityId === 'tailoring' || updated.activityId === 'military-tailoring')) {
        deductTailoringInventory(updated);
        // Refresh inventory if active in admin dashboard
        if (window.MkenAdminInventory) {
          setTimeout(function() { window.MkenAdminInventory.refresh(); }, 500);
        }
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
