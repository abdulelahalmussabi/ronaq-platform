/**
 * إدارة المخزون والمستودع — لوحة الإدارة
 */
(function () {
  'use strict';

  var store = window.MkenServicesStore;
  if (!store) return;

  var addNewBtn = document.getElementById('addNewItemBtn');
  var modal = document.getElementById('inventoryModal');
  var form = document.getElementById('inventoryForm');
  var cancelBtn = document.getElementById('inventoryModalCancel');
  var listContainer = document.getElementById('adminInventoryList');
  var transactionsContainer = document.getElementById('adminInventoryTransactions');

  var statTotalCost = document.getElementById('statTotalCost');
  var statTotalSell = document.getElementById('statTotalSell');
  var statLowStockCount = document.getElementById('statLowStockCount');

  var _items = [];
  var _transactions = [];

  function toast(msg, type) {
    if (window.MkenAdminToast) window.MkenAdminToast(msg, type);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function generateId() {
    return 'itm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function loadInventory() {
    if (!listContainer) return;
    listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center;" class="admin-hint">جاري تحميل المستودع...</td></tr>';

    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      var tenantSlug = store.getCurrentTenantSlug();
      Promise.all([
        window.MkenSupabaseDb.fetchInventoryItems(tenantSlug),
        window.MkenSupabaseDb.fetchInventoryTransactions(tenantSlug)
      ])
        .then(function (results) {
          _items = results[0];
          _transactions = results[1];
          renderInventory();
          renderTransactions();
          updateStats();
        })
        .catch(function (err) {
          console.error('Failed to load inventory from Supabase', err);
          listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--color-primary);" class="admin-hint">تأكد من إعداد المزامنة السحابية للوصول للمستودع.</td></tr>';
        });
    } else {
      listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center;" class="admin-hint">ميزة المستودع تتطلب تفعيل الربط السحابي (Supabase). الرجاء تفعيله في تبويب «الربط والأتمتة».</td></tr>';
    }
  }

  function renderInventory() {
    if (!_items.length) {
      listContainer.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center;" class="admin-hint">المستودع فارغ حالياً. أضف منتجات للبدء.</td></tr>';
      return;
    }

    listContainer.innerHTML = _items.map(function (item) {
      var imgHtml = item.imageUrl 
        ? '<img src="' + esc(item.imageUrl) + '" alt="' + esc(item.name) + '" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--color-border);">'
        : '<div style="width: 40px; height: 40px; background: #eee; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">📦</div>';

      var qtyStyle = '';
      if (item.quantity <= item.minStockAlert) {
        qtyStyle = 'background: #fdf2f2; color: #c0392b; font-weight: bold; padding: 4px 8px; border-radius: 4px; border: 1px solid #fde2e2;';
      }

      var nameHtml = esc(item.name);
      if (item.is_fabric_roll || item.name.indexOf('لفة') !== -1 || item.name.indexOf('قماش') !== -1) {
        var rate = item.consumption_rate_per_thobe || 3.5;
        var estThobes = Math.floor(item.quantity / rate);
        nameHtml += ' <br><span class="badge" style="background: #e3f2fd; color: #0d47a1; margin-top: 4px; display: inline-block; font-size: 0.75rem;">' +
                    'طول اللفة: ' + item.quantity + ' م — تكفي لـ ' + estThobes + ' ثياب (معدل: ' + rate + 'م)' + '</span>';
      }

      return (
        '<tr data-item-id="' + item.id + '" style="border-bottom: 1px solid var(--color-border);">' +
        '  <td style="padding: 12px;">' + imgHtml + '</td>' +
        '  <td style="padding: 12px; font-weight: 500; color: var(--color-text);">' + nameHtml + '</td>' +
        '  <td style="padding: 12px; font-family: monospace;">' + esc(item.sku || '—') + (item.barcode ? ' / ' + esc(item.barcode) : '') + '</td>' +
        '  <td style="padding: 12px;">' + item.costPrice.toFixed(2) + ' ريال</td>' +
        '  <td style="padding: 12px; font-weight: bold; color: var(--color-primary);">' + item.sellPrice.toFixed(2) + ' ريال</td>' +
        '  <td style="padding: 12px;"><span style="' + qtyStyle + '">' + item.quantity + '</span></td>' +
        '  <td style="padding: 12px;">' +
        '    <button type="button" class="btn btn--outline btn--sm" data-action="edit" style="padding: 4px 8px; margin-left: 6px;">تعديل</button>' +
        '    <button type="button" class="btn btn--outline btn--sm" data-action="delete" style="padding: 4px 8px; color: #c0392b; border-color: #c0392b20;">حذف</button>' +
        '  </td>' +
        '</tr>'
      );
    }).join('');

    // Wire events
    listContainer.querySelectorAll('[data-item-id]').forEach(function (row) {
      var id = row.getAttribute('data-item-id');
      var item = _items.find(function (x) { return x.id === id; });

      var editBtn = row.querySelector('[data-action="edit"]');
      if (editBtn) {
        editBtn.addEventListener('click', function () {
          openModal(item);
        });
      }

      var deleteBtn = row.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          if (confirm('هل أنت متأكد من حذف المنتج "' + item.name + '" نهائياً؟')) {
            deleteItem(id);
          }
        });
      }
    });
  }

  function renderTransactions() {
    if (!transactionsContainer) return;

    if (!_transactions.length) {
      transactionsContainer.innerHTML = '<tr><td colspan="6" style="padding: 12px; text-align: center;" class="admin-hint">لا توجد حركات مخزنية مسجلة.</td></tr>';
      return;
    }

    transactionsContainer.innerHTML = _transactions.slice(0, 15).map(function (tx) {
      var prod = _items.find(function (x) { return x.id === tx.itemId; });
      var prodName = prod ? prod.name : 'منتج محذوف';
      
      var dateStr = '';
      try {
        dateStr = new Date(tx.createdAt).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      } catch (e) {
        dateStr = tx.createdAt;
      }

      var typeBadge = '';
      if (tx.type === 'stock-in') {
        typeBadge = '<span class="badge" style="background: #e6f4ea; color: #137333;">وارد</span>';
      } else if (tx.type === 'stock-out') {
        typeBadge = '<span class="badge" style="background: #fce8e6; color: #c5221f;">صادر</span>';
      } else {
        typeBadge = '<span class="badge" style="background: #f1f3f4; color: #5f6368;">تسوية</span>';
      }

      return (
        '<tr style="border-bottom: 1px solid var(--color-border); font-size: 0.85rem;">' +
        '  <td style="padding: 8px 12px;">' + esc(dateStr) + '</td>' +
        '  <td style="padding: 8px 12px; font-weight: 500;">' + esc(prodName) + '</td>' +
        '  <td style="padding: 8px 12px;">' + typeBadge + '</td>' +
        '  <td style="padding: 8px 12px; font-weight: bold;">' + tx.quantity + '</td>' +
        '  <td style="padding: 8px 12px;">' + esc(tx.referenceId || '—') + '</td>' +
        '  <td style="padding: 8px 12px; color: var(--color-text-muted);">' + esc(tx.notes || '') + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function updateStats() {
    var totalCost = 0;
    var totalSell = 0;
    var lowStockCount = 0;

    _items.forEach(function (item) {
      var qty = Math.max(0, item.quantity);
      totalCost += item.costPrice * qty;
      totalSell += item.sellPrice * qty;
      if (qty <= item.minStockAlert) {
        lowStockCount++;
      }
    });

    if (statTotalCost) statTotalCost.textContent = totalCost.toFixed(2) + ' ريال';
    if (statTotalSell) statTotalSell.textContent = totalSell.toFixed(2) + ' ريال';
    if (statLowStockCount) statLowStockCount.textContent = lowStockCount + ' صنف';
  }

  function openModal(item) {
    if (!modal) return;
    modal.hidden = false;

    var title = document.getElementById('inventoryModalTitle');
    var idInput = document.getElementById('itemId');
    var nameInput = document.getElementById('itemName');
    var skuInput = document.getElementById('itemSku');
    var barcodeInput = document.getElementById('itemBarcode');
    var costInput = document.getElementById('itemCostPrice');
    var sellInput = document.getElementById('itemSellPrice');
    var qtyInput = document.getElementById('itemQuantity');
    var minInput = document.getElementById('itemMinStockAlert');
    var urlInput = document.getElementById('itemImageUrl');

    var isFabricCheckbox = document.getElementById('itemIsFabricRoll');
    var fabricFields = document.getElementById('fabricRollFields');
    var consumptionRateInput = document.getElementById('itemConsumptionRate');

    if (item) {
      title.textContent = 'تعديل المنتج';
      idInput.value = item.id;
      nameInput.value = item.name;
      skuInput.value = item.sku;
      barcodeInput.value = item.barcode;
      costInput.value = item.costPrice;
      sellInput.value = item.sellPrice;
      qtyInput.value = item.quantity;
      minInput.value = item.minStockAlert;
      urlInput.value = item.imageUrl;
      qtyInput.disabled = true; // Adjustments should go through stock logs or custom adjustment, disabled for simplicity in basic edit
      
      if (isFabricCheckbox) isFabricCheckbox.checked = !!item.is_fabric_roll;
      if (consumptionRateInput) consumptionRateInput.value = item.consumption_rate_per_thobe || '3.5';
      if (fabricFields) fabricFields.hidden = !item.is_fabric_roll;
    } else {
      title.textContent = 'إضافة منتج جديد';
      idInput.value = '';
      nameInput.value = '';
      skuInput.value = '';
      barcodeInput.value = '';
      costInput.value = '0.00';
      sellInput.value = '0.00';
      qtyInput.value = '0';
      minInput.value = '5';
      urlInput.value = '';
      qtyInput.disabled = false;
      
      if (isFabricCheckbox) isFabricCheckbox.checked = false;
      if (consumptionRateInput) consumptionRateInput.value = '3.5';
      if (fabricFields) fabricFields.hidden = true;
    }
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  function deleteItem(id) {
    if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
      window.MkenSupabaseDb.deleteInventoryItem(id)
        .then(function () {
          toast('تم حذف المنتج بنجاح');
          loadInventory();
        })
        .catch(function (err) {
          toast('فشل حذف المنتج من قاعدة البيانات', 'error');
          console.error(err);
        });
    }
  }

  function bindEvents() {
    var isFabricCheckbox = document.getElementById('itemIsFabricRoll');
    var fabricFields = document.getElementById('fabricRollFields');
    if (isFabricCheckbox && fabricFields) {
      isFabricCheckbox.addEventListener('change', function () {
        fabricFields.hidden = !isFabricCheckbox.checked;
      });
    }

    if (addNewBtn) {
      addNewBtn.addEventListener('click', function () {
        openModal(null);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        var idInput = document.getElementById('itemId').value;
        var isNew = !idInput;
        var targetId = idInput || generateId();
        
        var nameVal = document.getElementById('itemName').value;
        var skuVal = document.getElementById('itemSku').value;
        var barcodeVal = document.getElementById('itemBarcode').value;
        var costVal = parseFloat(document.getElementById('itemCostPrice').value) || 0;
        var sellVal = parseFloat(document.getElementById('itemSellPrice').value) || 0;
        var qtyVal = parseInt(document.getElementById('itemQuantity').value) || 0;
        var minVal = parseInt(document.getElementById('itemMinStockAlert').value) || 0;
        var urlVal = document.getElementById('itemImageUrl').value;

        var isFabricRoll = document.getElementById('itemIsFabricRoll').checked;
        var consumptionRate = parseFloat(document.getElementById('itemConsumptionRate').value) || 3.5;

        var payload = {
          id: targetId,
          name: nameVal,
          sku: skuVal,
          barcode: barcodeVal,
          costPrice: costVal,
          sellPrice: sellVal,
          quantity: qtyVal,
          minStockAlert: minVal,
          imageUrl: urlVal,
          is_fabric_roll: isFabricRoll,
          consumption_rate_per_thobe: consumptionRate
        };

        if (window.MkenSupabaseDb && window.MkenSupabaseDb.isConfigured()) {
          var tenantSlug = store.getCurrentTenantSlug();
          
          window.MkenSupabaseDb.saveInventoryItem(payload, tenantSlug)
            .then(function () {
              // If new item, let's insert a stock-in transaction
              if (isNew && qtyVal > 0) {
                var client = window.MkenSupabaseDb.getClient();
                return client.from('mken_inventory_transactions').insert({
                  tenant_slug: tenantSlug,
                  item_id: targetId,
                  type: 'stock-in',
                  quantity: qtyVal,
                  notes: 'رصيد مخزون أول المدة'
                });
              }
            })
            .then(function () {
              toast(isNew ? 'تم إضافة المنتج بنجاح' : 'تم تعديل المنتج بنجاح');
              closeModal();
              loadInventory();
            })
            .catch(function (err) {
              toast('فشل حفظ المنتج في السحابة', 'error');
              console.error(err);
            });
        } else {
          toast('الرجاء تفعيل الربط السحابي لحفظ المنتجات', 'error');
        }
      });
    }
  }

  function refresh() {
    loadInventory();
  }

  window.MkenAdminInventory = {
    refresh: refresh,
    getItems: function () { return _items; }
  };

  bindEvents();
})();
