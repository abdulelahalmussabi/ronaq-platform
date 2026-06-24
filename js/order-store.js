/**
 * طلبات التجارة — سلة + localStorage + رسائل واتساب
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'mken_platform_orders';
  var CART_PREFIX = 'mken_platform_cart_';

  function generateId() {
    return 'ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function cartStorageKey(activityId) {
    return CART_PREFIX + (activityId || 'default');
  }

  function getCart(activityId) {
    try {
      var list = JSON.parse(localStorage.getItem(cartStorageKey(activityId)) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(activityId, items) {
    localStorage.setItem(cartStorageKey(activityId), JSON.stringify(items || []));
    return items;
  }

  function cartCount(activityId) {
    return getCart(activityId).reduce(function (sum, line) {
      return sum + (parseInt(line.quantity, 10) || 0);
    }, 0);
  }

  function addToCart(activityId, item) {
    var cart = getCart(activityId);
    var qty = Math.min(999, Math.max(1, parseInt(item.quantity, 10) || 1));
    var found = cart.find(function (line) { return line.serviceId === item.serviceId; });
    if (found) {
      found.quantity = Math.min(999, (parseInt(found.quantity, 10) || 0) + qty);
    } else {
      cart.push({
        lineId: generateId(),
        serviceId: item.serviceId,
        serviceTitle: item.serviceTitle || '',
        icon: item.icon || '🛒',
        priceLabel: item.priceLabel || '',
        quantity: qty,
      });
    }
    return saveCart(activityId, cart);
  }

  function updateCartLine(activityId, lineId, quantity) {
    var cart = getCart(activityId);
    var qty = Math.min(999, Math.max(1, parseInt(quantity, 10) || 1));
    cart = cart.map(function (line) {
      if (line.lineId !== lineId) return line;
      return Object.assign({}, line, { quantity: qty });
    });
    return saveCart(activityId, cart);
  }

  function removeCartLine(activityId, lineId) {
    var cart = getCart(activityId).filter(function (line) { return line.lineId !== lineId; });
    return saveCart(activityId, cart);
  }

  function clearCart(activityId) {
    return saveCart(activityId, []);
  }

  function getOrders() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function addPendingOrder(order) {
    try {
      var list = getOrders();
      var newOrder = Object.assign({
        id: generateId(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        paymentStatus: 'unpaid',
      }, order);
      list.push(newOrder);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
        var tenantSlug = window.MkenServicesStore ? window.MkenServicesStore.getCurrentTenantSlug() : null;
        window.MkenSupabaseDb.saveOrder(newOrder, tenantSlug).catch(function (err) {
          console.error('Failed to save order to Supabase:', err);
        });
      }
      return newOrder;
    } catch (e) {
      return null;
    }
  }

  function saveOrdersBulk(orders) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders || []));
      if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
        var tenantSlug = window.MkenServicesStore ? window.MkenServicesStore.getCurrentTenantSlug() : null;
        window.MkenSupabaseDb.saveOrdersBulk(orders, tenantSlug).catch(function (err) {
          console.error('Failed to sync bulk orders to Supabase:', err);
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function updateOrder(id, patch) {
    try {
      var list = getOrders();
      var found = false;
      var updatedOrder = null;
      list = list.map(function (o) {
        if (o.id !== id) return o;
        found = true;
        updatedOrder = Object.assign({}, o, patch, { id: o.id });
        return updatedOrder;
      });
      if (!found) return null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured() && updatedOrder) {
        var tenantSlug = window.MkenServicesStore ? window.MkenServicesStore.getCurrentTenantSlug() : null;
        window.MkenSupabaseDb.saveOrder(updatedOrder, tenantSlug).catch(function (err) {
          console.error('Failed to sync updated order to Supabase:', err);
        });
      }
      return updatedOrder;
    } catch (e) {
      return null;
    }
  }

  function removeOrder(id) {
    try {
      var list = getOrders().filter(function (o) { return o.id !== id; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
        window.MkenSupabaseDb.deleteOrder(id).catch(function (err) {
          console.error('Failed to delete order from Supabase:', err);
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildCartWhatsAppMessage(brandName, payload) {
    var lines = [
      'طلب تفصيل ثياب رجالية — ' + brandName,
      '━━━━━━━━━━━━━━',
    ];
    if (payload.activityTitle) lines.push('النشاط: ' + payload.activityTitle);
    lines.push('المنتجات المختارة:');
    (payload.items || []).forEach(function (line, i) {
      var row = (i + 1) + '. ' + (line.icon || '') + ' ' + line.serviceTitle +
        ' × ' + line.quantity;
      if (line.priceLabel) row += ' (' + line.priceLabel + ')';
      lines.push(row);
    });
    lines.push('━━━━━━━━━━━━━━');

    // إضافة تفاصيل التفصيل والموديل
    if (payload.tailoringDetails) {
      var td = payload.tailoringDetails;
      var collarMap = { round_hard: 'ياقة قلاب قاسي (سعودي)', round_soft: 'ياقة قلاب لين', plain_neck: 'سادة بدون ياقة (كويتي)' };
      var cuffMap = { cuff_normal: 'سحاب/زرار عادي', cuff_french: 'أكمام كبك فرنسي', cuff_plain: 'أكمام مفتوحة سادة' };
      var pocketMap = { hidden_side: 'جيب جانبي مخفي', visible_chest: 'جيب صدري', both: 'جيب صدري وجانبي' };
      var placketMap = { hidden_buttons: 'أزرار مخفية', visible_buttons: 'أزرار ظاهرة كلاسيكية' };
      var methodMap = { home_visit: 'زيارة خياط للمنزل 🏠', manual: 'إدخال يدوي 📏', saved_profile: 'المقاسات المحفوظة 📂' };
      
      lines.push('خيارات الموديل والتفصيل:');
      lines.push('• الياقة: ' + (collarMap[td.collar] || td.collar));
      lines.push('• الأكمام: ' + (cuffMap[td.cuff] || td.cuff));
      lines.push('• الجيب: ' + (pocketMap[td.pocket] || td.pocket));
      lines.push('• الأزرار: ' + (placketMap[td.placket] || td.placket));
      lines.push('• طريقة أخذ القياس: ' + (methodMap[td.measurementMethod] || td.measurementMethod));
      
      if (td.measurements) {
        lines.push('• المقاسات المدخلة:');
        lines.push('  - الطول: ' + td.measurements.height + ' سم');
        lines.push('  - الكتف: ' + td.measurements.shoulder + ' سم');
        lines.push('  - الصدر: ' + td.measurements.chest + ' سم');
        lines.push('  - الكم: ' + td.measurements.sleeve + ' سم');
        lines.push('  - الرقبة: ' + td.measurements.neck + ' سم');
      }
      lines.push('━━━━━━━━━━━━━━');
    }

    lines.push(
      'الاسم: ' + payload.customerName,
      'الجوال: ' + payload.phone
    );
    if (payload.district) lines.push('الحي: ' + payload.district);
    if (payload.locationAddress) lines.push('العنوان: ' + payload.locationAddress);
    if (payload.notes) lines.push('ملاحظات: ' + payload.notes);
    
    // إضافة رابط التتبع الإلكتروني
    if (payload.id) {
      var origin = window.location.origin || 'https://mken.live';
      var trackLink = origin + '/track.html?id=' + payload.id;
      lines.push(
        '━━━━━━━━━━━━━━',
        '🔗 تتبع حالة ثوبك إلكترونياً:',
        trackLink
      );
    }
    
    lines.push('━━━━━━━━━━━━━━', 'يُرجى تأكيد طلب التفصيل والسعر النهائي');
    return lines.join('\n');
  }

  function buildWhatsAppMessage(brandName, order, serviceTitle, activityTitle) {
    return buildCartWhatsAppMessage(brandName, {
      activityTitle: activityTitle,
      items: [{
        icon: order.icon,
        serviceTitle: serviceTitle || order.serviceTitle,
        quantity: order.quantity,
        priceLabel: order.priceLabel,
      }],
      customerName: order.customerName,
      phone: order.phone,
      district: order.district,
      locationAddress: order.locationAddress,
      notes: order.notes,
    });
  }

  window.MkenOrderStore = {
    STORAGE_KEY: STORAGE_KEY,
    getCart: getCart,
    saveCart: saveCart,
    cartCount: cartCount,
    addToCart: addToCart,
    updateCartLine: updateCartLine,
    removeCartLine: removeCartLine,
    clearCart: clearCart,
    getOrders: getOrders,
    addPendingOrder: addPendingOrder,
    saveOrdersBulk: saveOrdersBulk,
    updateOrder: updateOrder,
    removeOrder: removeOrder,
    buildWhatsAppMessage: buildWhatsAppMessage,
    buildCartWhatsAppMessage: buildCartWhatsAppMessage,
  };
})();
