/**
 * إدارة الفواتير والمبيعات — لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.MkenServicesStore;
  if (!store) return;

  var addNewBtn = document.getElementById('addNewInvoiceBtn');
  var modal = document.getElementById('invoiceModal');
  var form = document.getElementById('invoiceForm');
  var cancelBtn = document.getElementById('invoiceModalCancel');
  var listContainer = document.getElementById('adminInvoicesList');
  
  var addItemBtn = document.getElementById('invoiceAddItemBtn');
  var itemsListTable = document.getElementById('invoiceItemsList');
  var subtotalEl = document.getElementById('invoiceSubtotal');
  var discountInput = document.getElementById('invoiceDiscount');
  var taxEl = document.getElementById('invoiceTax');
  var totalEl = document.getElementById('invoiceTotal');

  // Print Elements
  var printModal = document.getElementById('invoicePrintModal');
  var printCancelBtn = document.getElementById('printInvoiceCancel');
  var printDoBtn = document.getElementById('printInvoiceDoBtn');

  var _invoices = [];
  var _items = []; // Inventory items for selection
  var _customers = []; // Customers list
  var currentPrintInv = null;

  function toast(msg, type) {
    if (window.MkenAdminToast) window.MkenAdminToast(msg, type);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function generateId() {
    return 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function loadInvoices() {
    if (!listContainer) return;
    listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center;" class="admin-hint">جاري تحميل الفواتير...</td></tr>';

    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      
      // Fetch invoices & items & customers
      Promise.all([
        window.MkenSupabaseDb.fetchCustomerInvoices(tenantSlug),
        window.MkenSupabaseDb.fetchInventoryItems(tenantSlug),
        window.MkenSupabaseDb.fetchCustomers(tenantSlug)
      ])
        .then(function (results) {
          _invoices = results[0];
          _items = results[1];
          _customers = results[2] || [];
          renderInvoices();
          populateCustomerSelect();
        })
        .catch(function (err) {
          console.error('Failed to load invoices from Supabase', err);
          listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--color-primary);" class="admin-hint">تأكد من إعداد المزامنة السحابية للوصول للفواتير.</td></tr>';
        });
    } else {
      listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center;" class="admin-hint">ميزة الفواتير تتطلب تفعيل المزامنة السحابية.</td></tr>';
    }
  }

  function renderInvoices() {
    if (!_invoices.length) {
      listContainer.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center;" class="admin-hint">لا توجد فواتير أو عروض أسعار صادرة حالياً.</td></tr>';
      return;
    }

    listContainer.innerHTML = _invoices.map(function (inv) {
      var statusColor = '#777';
      var statusText = 'غير مدفوعة';
      if (inv.paymentStatus === 'paid') { statusColor = '#2e7d32'; statusText = 'مدفوعة'; }
      else if (inv.paymentStatus === 'partial') { statusColor = '#f2994a'; statusText = 'مدفوعة جزئياً'; }

      var methodText = 'نقدي';
      if (inv.paymentMethod === 'card') methodText = 'بطاقة مدى';
      else if (inv.paymentMethod === 'bank') methodText = 'تحويل بنكي';
      else if (inv.paymentMethod === 'whatsapp') methodText = 'دفع إلكتروني';

      var dateStr = '';
      try {
        dateStr = new Date(inv.createdAt).toLocaleDateString('ar-SA');
      } catch (e) {
        dateStr = inv.createdAt;
      }

      var typeText = inv.type === 'estimate' ? 'عرض سعر' : 'فاتورة';
      var typeColor = inv.type === 'estimate' ? '#2f80ed' : '#9b51e0';
      var typeBadge = '<span class="badge" style="background: ' + typeColor + '20; color: ' + typeColor + '; font-weight: bold;">' + typeText + '</span>';

      var convertBtn = '';
      if (inv.type === 'estimate') {
        convertBtn = '<button type="button" class="btn btn--outline btn--sm" data-action="convert-invoice" style="padding: 4px 8px; margin-left: 6px; color: #2e7d32; border-color: #2e7d3220;">🔄 تحويل لفاتورة</button>';
      } else if (inv.type === 'invoice' && inv.paymentStatus === 'unpaid') {
        convertBtn = '<button type="button" class="btn btn--outline btn--sm" data-action="convert-estimate" style="padding: 4px 8px; margin-left: 6px; color: #2f80ed; border-color: #2f80ed20;">🔄 تحويل لعرض سعر</button>';
      }

      return (
        '<tr data-invoice-id="' + inv.id + '" style="border-bottom: 1px solid var(--color-border);">' +
        '  <td style="padding: 12px; font-weight: bold; font-family: monospace;">' + esc(inv.id) + '</td>' +
        '  <td style="padding: 12px;">' + typeBadge + '</td>' +
        '  <td style="padding: 12px; font-weight: 500;">' + esc(inv.customerName) + '</td>' +
        '  <td style="padding: 12px; font-weight: bold; color: var(--color-primary);">' + inv.totalAmount.toFixed(2) + ' ريال</td>' +
        '  <td style="padding: 12px;"><span class="badge" style="background: ' + statusColor + '20; color: ' + statusColor + '; font-weight: bold;">' + statusText + '</span></td>' +
        '  <td style="padding: 12px;">' + methodText + '</td>' +
        '  <td style="padding: 12px;">' + esc(dateStr) + '</td>' +
        '  <td style="padding: 12px;">' +
        '    ' + convertBtn +
        '    <button type="button" class="btn btn--outline btn--sm" data-action="print" style="padding: 4px 8px; margin-left: 6px;">🖨️ طباعة</button>' +
        '    <button type="button" class="btn btn--outline btn--sm" data-action="delete" style="padding: 4px 8px; color: #c0392b; border-color: #c0392b20;">حذف</button>' +
        '  </td>' +
        '</tr>'
      );
    }).join('');

    // Wire events
    listContainer.querySelectorAll('[data-invoice-id]').forEach(function (row) {
      var id = row.getAttribute('data-invoice-id');
      var inv = _invoices.find(function (x) { return x.id === id; });

      var printBtn = row.querySelector('[data-action="print"]');
      if (printBtn) {
        printBtn.addEventListener('click', function () {
          openPrintModal(inv);
        });
      }

      var convertInvoiceBtn = row.querySelector('[data-action="convert-invoice"]');
      if (convertInvoiceBtn) {
        convertInvoiceBtn.addEventListener('click', function () {
          if (confirm('هل ترغب في تحويل عرض السعر هذا إلى فاتورة مبيعات حقيقية وتطبيق خصم المخزون؟')) {
            toggleInvoiceType(id, 'invoice');
          }
        });
      }

      var convertEstimateBtn = row.querySelector('[data-action="convert-estimate"]');
      if (convertEstimateBtn) {
        convertEstimateBtn.addEventListener('click', function () {
          if (confirm('هل ترغب في تحويل هذه الفاتورة غير المدفوعة إلى عرض سعر؟')) {
            toggleInvoiceType(id, 'estimate');
          }
        });
      }

      var deleteBtn = row.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          if (confirm('هل أنت متأكد من حذف هذا المستند نهائياً؟')) {
            deleteInvoice(id);
          }
        });
      }
    });
  }

  function toggleInvoiceType(id, targetType) {
    var inv = _invoices.find(function (x) { return x.id === id; });
    if (!inv) return;
    
    inv.type = targetType;
    if (targetType === 'estimate') {
      inv.paymentStatus = 'unpaid';
    }
    
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      saveAndReportInvoice(inv, tenantSlug, function () {
          if (targetType === 'invoice') {
            var client = window.MkenSupabaseDb.getClient();
            var promises = (inv.items || []).map(function (item) {
              return client.rpc('deduct_inventory_stock', {
                p_tenant: tenantSlug,
                p_item_id: item.itemId,
                p_quantity: item.quantity,
                p_reference_id: inv.id
              });
            });
            return Promise.all(promises);
          }
          return Promise.resolve([]);
        })
        .then(function () {
          toast(targetType === 'estimate' ? 'تم تحويل الفاتورة لعرض سعر بنجاح' : 'تم تحويل عرض السعر لفاتورة مبيعات وخصم المخزون بنجاح');
          loadInvoices();
          if (window.MkenAdminInventory) {
            window.MkenAdminInventory.refresh();
          }
        })
        .catch(function (err) {
          toast('حدث خطأ أثناء تحديث المستند في السحابة', 'error');
          console.error(err);
        });
    } else {
      toast('الرجاء تفعيل الربط السحابي لإجراء التحديثات', 'error');
    }
  }

  function getZatcaTlvQrCode(sellerName, vatNumber, timestamp, totalAmount, taxAmount) {
    var encoder = new TextEncoder();
    function getTlvRecord(tag, valString) {
      var valBytes = encoder.encode(valString);
      var record = new Uint8Array(2 + valBytes.length);
      record[0] = tag;
      record[1] = valBytes.length;
      record.set(valBytes, 2);
      return record;
    }
    
    var r1 = getTlvRecord(1, sellerName);
    var r2 = getTlvRecord(2, vatNumber);
    var r3 = getTlvRecord(3, timestamp);
    var r4 = getTlvRecord(4, String(totalAmount));
    var r5 = getTlvRecord(5, String(taxAmount));
    
    var totalLen = r1.length + r2.length + r3.length + r4.length + r5.length;
    var buffer = new Uint8Array(totalLen);
    var offset = 0;
    [r1, r2, r3, r4, r5].forEach(function(r) {
      buffer.set(r, offset);
      offset += r.length;
    });
    
    var binary = '';
    var len = buffer.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return window.btoa(binary);
  }

  function saveAndReportInvoice(invoice, tenantSlug, onSuccess) {
    var cfg = store.loadConfig() || {};
    var zatca = cfg.zatcaConfig;
    
    var savePromise;
    if (zatca && zatca.active && invoice.type === 'invoice' && !invoice.zatcaStatus) {
      var pin = localStorage.getItem('mken_admin_pin') || '';
      
      savePromise = fetch('/api/v1/zatca', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': pin
        },
        body: JSON.stringify({
          action: 'report',
          invoice: invoice,
          tenantSlug: tenantSlug
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'فشل الاتصال بـ ZATCA');
            return data;
          });
        })
        .then(function (data) {
          invoice.zatcaStatus = data.zatcaStatus;
          invoice.zatcaUuid = data.zatcaUuid;
          invoice.zatcaXmlHash = data.zatcaXmlHash;
          invoice.zatcaQrCode = data.zatcaQrCode;
          return window.MkenSupabaseDb.saveCustomerInvoice(invoice, tenantSlug);
        })
        .catch(function (err) {
          console.warn('ZATCA reporting failed, saving offline', err);
          invoice.zatcaStatus = 'PENDING';
          return window.MkenSupabaseDb.saveCustomerInvoice(invoice, tenantSlug);
        });
    } else {
      savePromise = window.MkenSupabaseDb.saveCustomerInvoice(invoice, tenantSlug);
    }
    
    return savePromise.then(onSuccess);
  }

  function generateThermalLayoutHtml(inv, brand, phone, qrBase64) {
    var docTitle = inv.type === 'estimate' ? 'عرض سعر' : 'فاتورة ضريبية مبسطة';
    var itemsHtml = (inv.items || []).map(function (item) {
      var price = Number(item.price || 0);
      var qty = Number(item.quantity || 0);
      var total = price * qty;
      return (
        '<tr style="border-bottom: 1px dashed #eee;">' +
        '  <td style="padding: 6px 0; text-align: right;">' + esc(item.name) + '</td>' +
        '  <td style="padding: 6px; text-align: center;">' + qty + '</td>' +
        '  <td style="padding: 6px; text-align: left;">' + price.toFixed(2) + ' ريال</td>' +
        '  <td style="padding: 6px 0; text-align: left;">' + total.toFixed(2) + ' ريال</td>' +
        '</tr>'
      );
    }).join('');

    var qrBlock = '';
    if (inv.type !== 'estimate') {
      qrBlock = 
        '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 15px;">' +
        '  <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(qrBase64) + '" style="width: 110px; height: 110px;" />' +
        '  <div style="font-size: 0.65rem; color: #27ae60; font-weight: bold; margin-top: 5px; text-align: center;">🧾 فاتورة مبسطة معتمدة ضريبياً</div>' +
        '</div>';
    }

    return (
      '<div style="width: 100%; max-width: 380px; margin: 0 auto; font-family: sans-serif; font-size: 0.85rem; color: #000; direction: rtl; text-align: right;">' +
      '  <div style="text-align: center; margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 10px;">' +
      '    <h3 style="margin: 0; font-size: 1.3rem; font-weight: bold;">' + esc(brand.name) + '</h3>' +
      '    <div style="font-size: 0.75rem; margin-top: 2px; color: #555;">' + esc(brand.tagline || '') + '</div>' +
      '    <div style="font-size: 0.75rem; margin-top: 2px;">الهاتف: ' + esc(phone) + '</div>' +
      '    <h4 style="margin: 8px 0 0 0; font-size: 1rem; font-weight: bold; background: #eee; padding: 3px 0;">' + docTitle + '</h4>' +
      '  </div>' +
      '  <div style="margin-bottom: 12px; font-size: 0.78rem; line-height: 1.4; border-bottom: 1px dashed #ccc; padding-bottom: 8px;">' +
      '    <div><strong>رقم المستند:</strong> ' + esc(inv.id) + '</div>' +
      '    <div><strong>تاريخ الإصدار:</strong> ' + new Date(inv.createdAt).toLocaleString('ar-SA') + '</div>' +
      '    <div><strong>العميل:</strong> ' + esc(inv.customerName) + '</div>' +
      '    <div><strong>جوال العميل:</strong> ' + esc(inv.customerPhone || '—') + '</div>' +
      '  </div>' +
      '  <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 12px;">' +
      '    <thead>' +
      '      <tr style="border-bottom: 1px solid #000; font-weight: bold;">' +
      '        <th style="padding: 4px 0; text-align: right;">الصنف</th>' +
      '        <th style="padding: 4px; text-align: center;">الكمية</th>' +
      '        <th style="padding: 4px; text-align: left;">السعر</th>' +
      '        <th style="padding: 4px 0; text-align: left;">المجموع</th>' +
      '      </tr>' +
      '    </thead>' +
      '    <tbody>' + itemsHtml + '</tbody>' +
      '  </table>' +
      '  <div style="border-top: 1px solid #000; padding-top: 8px; font-size: 0.8rem; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; line-height: 1.3;">' +
      '    <div>المجموع قبل الضريبة: <span>' + inv.subtotal.toFixed(2) + ' ريال</span></div>' +
      '    <div>الخصم: <span>' + inv.discount.toFixed(2) + ' ريال</span></div>' +
      '    <div>ضريبة القيمة المضافة (15%): <span>' + inv.taxAmount.toFixed(2) + ' ريال</span></div>' +
      '    <div style="font-size: 0.95rem; font-weight: bold; border-top: 1px double #000; padding-top: 4px; margin-top: 2px;">الإجمالي النهائي: <span>' + inv.totalAmount.toFixed(2) + ' ريال</span></div>' +
      '  </div>' +
      '  <div style="margin-top: 15px; border-top: 2px dashed #000; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">' +
      '    <div style="font-size: 0.7rem; line-height: 1.3; max-width: 60%; color: #333;">' +
      '      <strong>شكراً لزيارتكم!</strong>' +
      '      <div>يسعدنا التعامل معكم دائماً.</div>' +
      '      <div>فاتورة إلكترونية معتمدة</div>' +
      '    </div>' + qrBlock +
      '  </div>' +
      '</div>';
  }

  function generateA4LayoutHtml(inv, brand, phone, qrBase64) {
    var cfg = store.loadConfig() || {};
    var zatca = cfg.zatcaConfig || {};
    var docTitle = inv.type === 'estimate' ? 'عرض سعر (Quote)' : 'فاتورة ضريبية مبسطة (Simplified Tax Invoice)';
    
    var itemsHtml = (inv.items || []).map(function (item, index) {
      var price = Number(item.price || 0);
      var qty = Number(item.quantity || 0);
      var total = price * qty;
      var tax = total * 0.15;
      return (
        '<tr style="border-bottom: 1px solid #e0e0e0;">' +
        '  <td style="padding: 10px; text-align: center;">' + (index + 1) + '</td>' +
        '  <td style="padding: 10px; text-align: right; font-weight: 500;">' + esc(item.name) + '</td>' +
        '  <td style="padding: 10px; text-align: center;">' + qty + '</td>' +
        '  <td style="padding: 10px; text-align: left;">' + price.toFixed(2) + ' ريال</td>' +
        '  <td style="padding: 10px; text-align: center;">15%</td>' +
        '  <td style="padding: 10px; text-align: left;">' + tax.toFixed(2) + ' ريال</td>' +
        '  <td style="padding: 10px; text-align: left; font-weight: bold;">' + (total + tax).toFixed(2) + ' ريال</td>' +
        '</tr>'
      );
    }).join('');

    var qrBlock = '';
    if (inv.type !== 'estimate') {
      qrBlock = 
        '<div style="text-align: center; border: 1px solid #ddd; padding: 10px; border-radius: 4px; background: #fafafa; display: inline-block;">' +
        '  <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=' + encodeURIComponent(qrBase64) + '" style="width: 120px; height: 120px; display: block; margin: 0 auto 5px;" />' +
        '  <div style="font-size: 0.65rem; color: #27ae60; font-weight: bold;">🧾 الفوترة الإلكترونية (ZATCA)</div>' +
        '  <div style="font-size: 0.55rem; color: #777; margin-top: 2px; font-family: monospace; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">UUID: ' + esc(inv.zatcaUuid || 'N/A') + '</div>' +
        '</div>';
    }

    return (
      '<div style="width: 100%; font-family: sans-serif; color: #000; direction: rtl; text-align: right; line-height: 1.5; padding: 10px;">' +
      '  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #9b51e0; padding-bottom: 20px; margin-bottom: 25px;">' +
      '    <div>' +
      '      <h2 style="margin: 0 0 5px 0; color: #9b51e0; font-weight: 800; font-size: 1.8rem;">' + esc(brand.name) + '</h2>' +
      '      <div style="font-size: 0.85rem; color: #555;">' + esc(brand.tagline || 'حلول الأعمال الذكية') + '</div>' +
      '      <div style="margin-top: 10px; font-size: 0.85rem; color: #333;">' +
      '        <div><strong>العنوان:</strong> ' + esc(zatca.buildingNo || '1234') + ' ' + esc(zatca.street || 'شارع العليا العام') + '، ' + esc(zatca.district || 'الورود') + '، ' + esc(zatca.city || 'الرياض') + '، المملكة العربية السعودية</div>' +
      '        <div><strong>الهاتف:</strong> ' + esc(phone) + '</div>' +
      '        <div><strong>الرقم الضريبي للمورد (VAT):</strong> ' + esc(zatca.vatNumber || '311234567800003') + '</div>' +
      '      </div>' +
      '    </div>' +
      '    <div style="text-align: left; background: #fafafa; border: 1px solid #eee; padding: 15px; border-radius: 4px; min-width: 240px;">' +
      '      <h3 style="margin: 0 0 10px 0; color: #000; font-size: 1.15rem; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px;">' + docTitle + '</h3>' +
      '      <div style="font-size: 0.85rem; color: #333; display: grid; gap: 4px;">' +
      '        <div><strong>رقم الفاتورة:</strong> <span style="font-family: monospace; font-weight: bold;">' + esc(inv.id) + '</span></div>' +
      '        <div><strong>التاريخ والوقت:</strong> ' + new Date(inv.createdAt).toLocaleString('ar-SA') + '</div>' +
      '        <div><strong>العملة:</strong> ريال سعودي (SAR)</div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 4px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; gap: 15px;">' +
      '    <div>' +
      '      <h4 style="margin: 0 0 8px 0; color: #777; font-size: 0.8rem; text-transform: uppercase;">تفاصيل العميل (Client Details)</h4>' +
      '      <div style="font-weight: bold; font-size: 1rem; color: #000;">الاسم: ' + esc(inv.customerName) + '</div>' +
      '      <div style="font-size: 0.85rem; color: #555; margin-top: 4px;">الجوال: ' + esc(inv.customerPhone || '—') + '</div>' +
      '    </div>' +
      '    <div style="text-align: left; display: flex; flex-direction: column; justify-content: center;">' +
      '      <div style="font-size: 0.85rem; color: #333;">حالة الدفع: <span style="font-weight: bold; color: ' + (inv.paymentStatus === 'paid' ? 'green' : 'orange') + ';">' + (inv.paymentStatus === 'paid' ? 'مدفوعة (Paid)' : 'غير مدفوعة (Unpaid)') + '</span></div>' +
      '      <div style="font-size: 0.85rem; color: #333; margin-top: 4px;">طريقة الدفع: ' + (inv.paymentMethod === 'card' ? 'بطاقة مدى (Mada)' : inv.paymentMethod === 'bank' ? 'تحويل بنكي (Bank)' : 'نقدي (Cash)') + '</div>' +
      '    </div>' +
      '  </div>' +
      '  <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-bottom: 25px;">' +
      '    <thead>' +
      '      <tr style="background: #fafafa; border-bottom: 2px solid #ddd; font-weight: bold; color: #333;">' +
      '        <th style="padding: 10px; text-align: center; width: 40px;">#</th>' +
      '        <th style="padding: 10px; text-align: right;">الوصف / الصنف (Description)</th>' +
      '        <th style="padding: 10px; text-align: center; width: 80px;">الكمية</th>' +
      '        <th style="padding: 10px; text-align: left; width: 120px;">سعر الوحدة</th>' +
      '        <th style="padding: 10px; text-align: center; width: 80px;">الضريبة</th>' +
      '        <th style="padding: 10px; text-align: left; width: 120px;">مبلغ الضريبة</th>' +
      '        <th style="padding: 10px; text-align: left; width: 130px;">الإجمالي شاملاً الضريبة</th>' +
      '      </tr>' +
      '    </thead>' +
      '    <tbody>' + itemsHtml + '</tbody>' +
      '  </table>' +
      '  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px;">' +
      '    <div>' + qrBlock + '</div>' +
      '    <div style="min-width: 320px; display: grid; gap: 8px; font-size: 0.9rem; border: 1px solid #eee; padding: 15px; border-radius: 4px; background: #fdfdfd;">' +
      '      <div style="display: flex; justify-content: space-between;">' +
      '        <span style="color: #666;">المجموع قبل الضريبة:</span>' +
      '        <span style="font-weight: 500;">' + inv.subtotal.toFixed(2) + ' ريال</span>' +
      '      </div>' +
      '      <div style="display: flex; justify-content: space-between; color: #c0392b;">' +
      '        <span>الخصم (Discount):</span>' +
      '        <span>-' + inv.discount.toFixed(2) + ' ريال</span>' +
      '      </div>' +
      '      <div style="display: flex; justify-content: space-between;">' +
      '        <span style="color: #666;">ضريبة القيمة المضافة (15%):</span>' +
      '        <span style="font-weight: 500;">' + inv.taxAmount.toFixed(2) + ' ريال</span>' +
      '      </div>' +
      '      <div style="display: flex; justify-content: space-between; font-size: 1.15rem; font-weight: bold; border-top: 2px solid #ddd; padding-top: 8px; margin-top: 4px; color: #9b51e0;">' +
      '        <span>الإجمالي النهائي (Total):</span>' +
      '        <span>' + inv.totalAmount.toFixed(2) + ' ريال</span>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 15px; font-size: 0.75rem; text-align: center; color: #777;">' +
      '    تخضع هذه الفاتورة لكافة اشتراطات هيئة الزكاة والضريبة والجمارك بالمملكة العربية السعودية (لائحة الفوترة الإلكترونية المرحلة الثانية).' +
      '  </div>' +
      '</div>';
  }

  function renderPrintArea(inv, layout) {
    var brand = store.getBrand() || { name: 'منصة مكن', tagline: 'حلول ذكية' };
    var phone = store.loadConfig().phone || '966543530333';
    var cfg = store.loadConfig() || {};
    
    var qrBase64 = inv.zatcaQrCode;
    if (!qrBase64) {
      var vatNumber = (cfg.zatcaConfig && cfg.zatcaConfig.vatNumber) || '311234567800003';
      qrBase64 = getZatcaTlvQrCode(brand.name, vatNumber, inv.createdAt, inv.totalAmount.toFixed(2), inv.taxAmount.toFixed(2));
    }
    
    var printArea = document.getElementById('invoicePrintArea');
    if (!printArea) return;
    
    if (layout === 'a4') {
      printArea.innerHTML = generateA4LayoutHtml(inv, brand, phone, qrBase64);
    } else {
      printArea.innerHTML = generateThermalLayoutHtml(inv, brand, phone, qrBase64);
    }
  }

  function openPrintModal(inv) {
    if (!printModal) return;
    printModal.hidden = false;
    currentPrintInv = inv;
    
    var layoutSelect = document.getElementById('printInvoiceLayout');
    var layout = (layoutSelect && layoutSelect.value) || 'thermal';
    renderPrintArea(inv, layout);
  }

  function closePrintModal() {
    if (printModal) printModal.hidden = true;
  }

  function populateCustomerSelect(selectedCustomerId) {
    var select = document.getElementById('invoiceCustomerSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- اختر العميل --</option>' + _customers.map(function (c) {
      var sel = c.id === selectedCustomerId ? ' selected' : '';
      return '<option value="' + c.id + '"' + sel + ' data-phone="' + esc(c.phone) + '" data-name="' + esc(c.name) + '">' + esc(c.name) + ' (' + esc(c.phone || 'بدون هاتف') + ')</option>';
    }).join('');
  }

  function openInvoiceModal() {
    if (!modal) return;
    modal.hidden = false;

    document.getElementById('invoiceId').value = '';
    document.getElementById('invoiceType').value = 'invoice';
    var custSelect = document.getElementById('invoiceCustomerSelect');
    if (custSelect) custSelect.value = '';
    document.getElementById('invoiceCustomerPhone').value = '';
    document.getElementById('invoicePaymentStatus').value = 'unpaid';
    document.getElementById('invoicePaymentMethod').value = 'cash';
    discountInput.value = '0.00';
    
    itemsListTable.innerHTML = '';
    calculateTotals();
    
    // Auto-add first item row
    addInvoiceItemRow();
  }

  function addInvoiceItemRow(selectedItemId, quantity, price) {
    var rowId = 'row_' + Math.random().toString(36).slice(2, 7);
    var optionsHtml = _items.map(function (item) {
      var selected = item.id === selectedItemId ? ' selected' : '';
      return '<option value="' + item.id + '"' + selected + ' data-price="' + item.sellPrice + '">' + esc(item.name) + ' (' + item.quantity + ' متوفر)</option>';
    }).join('');

    var tr = document.createElement('tr');
    tr.id = rowId;
    tr.style.borderBottom = '1px solid var(--color-border)';
    tr.innerHTML = 
      '  <td style="padding: 6px;">' +
      '    <select class="admin-input invoice-item-select" style="width: 100%; padding: 4px;" required>' +
      '      <option value="">— اختر صنف —</option>' +
      '      ' + optionsHtml +'    </select>' +
      '  </td>' +
      '  <td style="padding: 6px;"><input type="number" class="admin-input invoice-item-qty" min="1" value="' + (quantity || 1) + '" style="width: 100%; padding: 4px;" required></td>' +
      '  <td style="padding: 6px;"><input type="number" step="0.01" class="admin-input invoice-item-price" value="' + (price || 0).toFixed(2) + '" style="width: 100%; padding: 4px;" required></td>' +
      '  <td style="padding: 6px; font-weight: bold; vertical-align: middle;"><span class="invoice-item-total">0.00</span> ريال</td>' +
      '  <td style="padding: 6px; text-align: center;"><button type="button" class="btn btn--outline btn--sm" data-action="remove-row" style="color: #c0392b; border-color: #c0392b20; padding: 2px 6px;">×</button></td>';

    itemsListTable.appendChild(tr);

    // Event listeners
    var select = tr.querySelector('.invoice-item-select');
    var qtyInput = tr.querySelector('.invoice-item-qty');
    var priceInput = tr.querySelector('.invoice-item-price');
    var totalSpan = tr.querySelector('.invoice-item-total');
    var removeBtn = tr.querySelector('[data-action="remove-row"]');

    function updateRowTotal() {
      var q = parseInt(qtyInput.value) || 0;
      var p = parseFloat(priceInput.value) || 0;
      totalSpan.textContent = (q * p).toFixed(2);
      calculateTotals();
    }

    select.addEventListener('change', function () {
      var opt = select.options[select.selectedIndex];
      if (opt && opt.value) {
        var basePrice = parseFloat(opt.getAttribute('data-price')) || 0;
        priceInput.value = basePrice.toFixed(2);
      } else {
        priceInput.value = '0.00';
      }
      updateRowTotal();
    });

    qtyInput.addEventListener('input', updateRowTotal);
    priceInput.addEventListener('input', updateRowTotal);

    removeBtn.addEventListener('click', function () {
      tr.remove();
      calculateTotals();
    });

    updateRowTotal();
  }

  function calculateTotals() {
    var subtotal = 0;
    
    itemsListTable.querySelectorAll('tr').forEach(function (tr) {
      var q = parseInt(tr.querySelector('.invoice-item-qty').value) || 0;
      var p = parseFloat(tr.querySelector('.invoice-item-price').value) || 0;
      subtotal += q * p;
    });

    var discount = parseFloat(discountInput.value) || 0;
    var netSubtotal = Math.max(0, subtotal - discount);
    var tax = netSubtotal * 0.15; // 15% VAT
    var total = netSubtotal + tax;

    subtotalEl.textContent = subtotal.toFixed(2) + ' ريال';
    taxEl.textContent = tax.toFixed(2) + ' ريال';
    totalEl.textContent = total.toFixed(2) + ' ريال';
  }

  function closeInvoiceModal() {
    if (modal) modal.hidden = true;
  }

  function deleteInvoice(id) {
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      window.MkenSupabaseDb.deleteCustomerInvoice(id)
        .then(function () {
          toast('تم حذف الفاتورة بنجاح');
          loadInvoices();
        })
        .catch(function (err) {
          toast('فشل حذف الفاتورة من قاعدة البيانات', 'error');
          console.error(err);
        });
    }
  }

  function bindEvents() {
    if (addNewBtn) {
      addNewBtn.addEventListener('click', openInvoiceModal);
    }

    var custSelect = document.getElementById('invoiceCustomerSelect');
    if (custSelect) {
      custSelect.addEventListener('change', function () {
        var opt = custSelect.options[custSelect.selectedIndex];
        var phoneInput = document.getElementById('invoiceCustomerPhone');
        if (phoneInput) {
          phoneInput.value = (opt && opt.getAttribute('data-phone')) || '';
        }
      });
    }

    var quickAddBtn = document.getElementById('invoiceQuickAddCustomerBtn');
    if (quickAddBtn) {
      quickAddBtn.addEventListener('click', function () {
        if (window.MkenAdminCustomers) {
          window.MkenAdminCustomers.openCreateModal(function (newCustomer) {
            if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
              var tenantSlug = store.getCurrentTenantSlug();
              window.MkenSupabaseDb.fetchCustomers(tenantSlug)
                .then(function (customers) {
                  _customers = customers;
                  populateCustomerSelect(newCustomer.id);
                  var phoneInput = document.getElementById('invoiceCustomerPhone');
                  if (phoneInput) phoneInput.value = newCustomer.phone || '';
                });
            }
          });
        } else {
          toast('إدارة العملاء غير متوفرة حالياً', 'error');
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeInvoiceModal);
    }

    if (addItemBtn) {
      addItemBtn.addEventListener('click', function () {
        addInvoiceItemRow();
      });
    }

    if (discountInput) {
      discountInput.addEventListener('input', calculateTotals);
    }

    if (printCancelBtn) {
      printCancelBtn.addEventListener('click', closePrintModal);
    }

    var layoutSelect = document.getElementById('printInvoiceLayout');
    if (layoutSelect) {
      layoutSelect.addEventListener('change', function () {
        if (currentPrintInv) {
          renderPrintArea(currentPrintInv, this.value);
        }
      });
    }

    if (printDoBtn) {
      printDoBtn.addEventListener('click', function () {
        var printContent = document.getElementById('invoicePrintArea').innerHTML;
        var originalContent = document.body.innerHTML;

        // Simplify page structure for print
        var printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>طباعة فاتورة</title>');
        printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">');
        printWindow.document.write('<style>body { font-family: "IBM Plex Sans Arabic", sans-serif; direction: rtl; text-align: right; padding: 20px; } table { width: 100%; border-collapse: collapse; } th, td { padding: 8px; border-bottom: 1px solid #ddd; }</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(printContent);
        printWindow.document.write('</body></html>');
        printWindow.document.close();

        // Trigger print after load
        printWindow.setTimeout(function () {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 500);
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        var custSelect = document.getElementById('invoiceCustomerSelect');
        var customerId = (custSelect && custSelect.value) || null;
        var customerName = '';
        if (custSelect && custSelect.selectedIndex >= 0) {
          customerName = custSelect.options[custSelect.selectedIndex].getAttribute('data-name') || '';
        }
        var customerPhone = document.getElementById('invoiceCustomerPhone').value;
        var paymentStatus = document.getElementById('invoicePaymentStatus').value;
        var paymentMethod = document.getElementById('invoicePaymentMethod').value;
        var discount = parseFloat(discountInput.value) || 0;

        var items = [];
        var isValid = true;

        itemsListTable.querySelectorAll('tr').forEach(function (tr) {
          var select = tr.querySelector('.invoice-item-select');
          var itemId = select.value;
          var qty = parseInt(tr.querySelector('.invoice-item-qty').value) || 0;
          var price = parseFloat(tr.querySelector('.invoice-item-price').value) || 0;

          if (!itemId) {
            isValid = false;
            toast('الرجاء اختيار صنف لكل بند مضاف', 'error');
            return;
          }

          var itemObj = _items.find(function (x) { return x.id === itemId; });
          items.push({
            itemId: itemId,
            name: itemObj ? itemObj.name : 'منتج غير معروف',
            quantity: qty,
            price: price
          });
        });

        if (!isValid) return;
        if (!items.length) {
          toast('يجب إضافة بند واحد على الأقل لإصدار الفاتورة', 'error');
          return;
        }

        var invoiceId = generateId();
        
        // Calculations
        var subtotal = items.reduce(function (sum, item) { return sum + (item.price * item.quantity); }, 0);
        var netSubtotal = Math.max(0, subtotal - discount);
        var tax = netSubtotal * 0.15;
        var total = netSubtotal + tax;

        var invoice = {
          id: invoiceId,
          customerId: customerId,
          customerName: customerName,
          customerPhone: customerPhone,
          items: items,
          subtotal: subtotal,
          discount: discount,
          taxAmount: tax,
          totalAmount: total,
          paymentStatus: paymentStatus,
          paymentMethod: paymentMethod,
          type: type,
          createdAt: new Date().toISOString()
        };

        if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
          var tenantSlug = store.getCurrentTenantSlug();

          saveAndReportInvoice(invoice, tenantSlug, function () {
              // Deduct stock in DB via rpc calls ONLY IF type is 'invoice'
              if (type === 'invoice') {
                var client = window.MkenSupabaseDb.getClient();
                var promises = items.map(function (item) {
                  return client.rpc('deduct_inventory_stock', {
                    p_tenant: tenantSlug,
                    p_item_id: item.itemId,
                    p_quantity: item.quantity,
                    p_reference_id: invoiceId
                  });
                });
                return Promise.all(promises);
              }
              return Promise.resolve([]);
            })
            .then(function (results) {
              // Check if any deduction failed
              var failed = results.find(function (r) { return r.data && r.data.success === false; });
              if (failed) {
                console.warn('One or more items had stock issues:', failed.data.error);
              }
              toast('تم إصدار الفاتورة وحفظها بنجاح');
              closeInvoiceModal();
              loadInvoices();
              
              // Refresh inventory tab values if open
              if (window.MkenAdminInventory) {
                window.MkenAdminInventory.refresh();
              }
            })
            .catch(function (err) {
              toast('حدث خطأ أثناء إصدار الفاتورة', 'error');
              console.error(err);
            });
        } else {
          toast('الرجاء تفعيل المزامنة السحابية لإصدار الفواتير', 'error');
        }
      });
    }
  }

  function refresh() {
    loadInvoices();
  }

  window.MkenAdminInvoices = {
    refresh: refresh
  };

  bindEvents();
})();
