/**
 * Unit tests for military tailoring additions (catalog, services, order-store logic)
 * Run with: node scripts/test-military-logic.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadScript(relativePath, context) {
  const code = fs.readFileSync(path.join(root, relativePath), 'utf8');
  vm.runInContext(code, context);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const storage = {};
  const context = {
    window: {
      location: {
        origin: 'https://mken.live'
      }
    },
    console,
    localStorage: {
      getItem(k) { return storage[k] || null; },
      setItem(k, v) { storage[k] = v; },
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        brand: { name: 'رونق' },
        enabledActivities: ['military-tailoring', 'tailoring']
      })
    }),
  };
  vm.createContext(context);

  // Load catalogs and stores
  loadScript('js/activities-catalog.js', context);
  loadScript('js/services-catalog.js', context);
  loadScript('js/services-store.js', context);
  loadScript('js/order-store.js', context);

  const payload = {
    id: 'ord_military_test_1',
    activityId: 'military-tailoring',
    activityTitle: 'تفصيل البدل العسكرية',
    customerName: 'رقيب تجريبي',
    phone: '966500000000',
    district: 'الملز',
    locationAddress: 'شارع صلاح الدين',
    notes: 'عاجل قبل العيد',
    status: 'pending',
    militaryVerified: false,
    items: [
      { serviceId: 'uniform-land-forces', quantity: 1, priceLabel: '450 ريال' }
    ],
    tailoringDetails: {
      militaryBranch: 'defense',
      militaryUniformType: 'camo_field',
      militaryRank: 'sergeant',
      militaryIdNumber: '10928374', // ID to be masked
      measurementMethod: 'manual',
      measurements: {
        jacketLength: 75,
        shoulder: 48,
        chest: 104,
        sleeve: 64,
        trouserLength: 102,
        waist: 92,
        neck: 43
      }
    }
  };

  const activities = context.window.MkenActivitiesCatalog;
  const services = context.window.MkenServicesCatalog;
  const orderStore = context.window.MkenOrderStore;

  // Mock order store methods to bypass localStorage key mismatch
  let ordersList = [payload];
  orderStore.getOrders = () => ordersList;
  orderStore.updateOrder = (id, patch) => {
    const o = ordersList.find(x => x.id === id);
    if (o) {
      Object.assign(o, patch);
      storage['mken_orders'] = JSON.stringify(ordersList);
      return o;
    }
    return null;
  };

  // 1. Verify activity registration
  const militaryActivity = activities.find(a => a.id === 'military-tailoring');
  assert(militaryActivity, 'Military tailoring activity should be registered');
  assert(militaryActivity.title === 'تفصيل البدل العسكرية', 'Activity title should be correct');

  // 2. Verify service catalog registration
  const militaryServices = services.filter(s => s.activityId === 'military-tailoring');
  assert(militaryServices.length === 4, 'Should have exactly 4 military services registered');
  
  const landForces = militaryServices.find(s => s.id === 'uniform-land-forces');
  assert(landForces, 'Land forces uniform service should exist');
  assert(landForces.consumption_rate_per_thobe === 4.0, 'Land forces consumption rate should be 4.0');

  // 3. Verify order store WhatsApp message generation and masking
  const message = orderStore.buildCartWhatsAppMessage('رونق', payload);
  console.log('Generated WhatsApp Message Preview:\n');
  console.log(message);
  console.log('\n----------------------------------------\n');

  assert(message.includes('طلب تفصيل بدل عسكرية'), 'WhatsApp message should mention military tailoring');
  assert(message.includes('الرقم العسكري: ******'), 'Military ID number must be masked with ******');
  assert(!message.includes('10928374'), 'Military ID number must not be exposed in cleartext');
  assert(message.includes('البنطلون: 102 سم'), 'Should include trouser length');
  assert(message.includes('الخصر: 92 سم'), 'Should include waist size');
  assert(message.includes('وزارة الدفاع'), 'Should map defense branch to Arabic translation');
  assert(message.includes('ميدانية / مموه'), 'Should map camo_field to Arabic translation');
  assert(message.includes('رقيب إلى رئيس رقباء'), 'Should map sergeant rank to Arabic translation');

  // 4. Test admin-orders.js logic (blocking & inventory deduction)
  let lastToastMsg = null;
  let lastToastType = null;
  
  // Set up mock DOM and window variables for admin-orders.js
  context.window.MkenAdminToast = (msg, type) => {
    lastToastMsg = msg;
    lastToastType = type;
  };

  const mockDb = {
    isConfigured: () => false,
  };
  context.window.MkenSupabaseDb = mockDb;

  // Mock document and DOM elements
  const eventListeners = {};
  const mockElementsMap = {};
  function createMockElement(customAttrs = {}) {
    const el = {
      addEventListener: (event, handler) => {
        const key = (customAttrs.selector || '') + ':' + event;
        if (!eventListeners[key]) eventListeners[key] = [];
        eventListeners[key].push(handler);
      },
      appendChild: () => {},
      querySelector: (sel) => {
        if (!mockElementsMap[sel]) mockElementsMap[sel] = createMockElement({ selector: sel });
        return mockElementsMap[sel];
      },
      querySelectorAll: (sel) => {
        if (!mockElementsMap[sel]) mockElementsMap[sel] = createMockElement({ selector: sel });
        return [mockElementsMap[sel]];
      },
      getAttribute: (attr) => {
        if (attr === 'data-order-id') return 'ord_military_test_1';
        return '';
      },
      value: 'all',
      innerHTML: '',
      textContent: '',
      ...customAttrs
    };
    return el;
  }

  const mockElement = createMockElement();

  context.document = {
    getElementById: (id) => {
      return mockElement;
    },
    createElement: () => mockElement
  };

  // Mock localStorage data for inventory items
  const initialInventory = [
    { id: 'uniform-land-forces', name: 'قماش مموه', quantity: 100, type: 'fabric' },
    { id: 'military-buttons', name: 'أزرار عسكرية', quantity: 200, searchKeyword: 'زرار' },
    { id: 'military-lining', name: 'حشوة ياقة عسكرية', quantity: 50, searchKeyword: 'حشوة' },
    { id: 'luxury-box', name: 'كرتون تغليف فاخر', quantity: 100, searchKeyword: 'كرتون' }
  ];
  storage['mken_inventory_items'] = JSON.stringify(initialInventory);
  storage['mken_orders'] = JSON.stringify([payload]);

  // Load admin orders script
  loadScript('js/admin-orders.js', context);

  const adminOrders = context.window.MkenAdminOrders;
  assert(adminOrders, 'MkenAdminOrders should load');

  // Load orders to trigger rendering and event binding
  adminOrders.loadOrders();

  // Test 4a: Verify status transition to cutting is blocked when militaryVerified is false
  lastToastMsg = null;
  lastToastType = null;

  // Log the registered keys for debugging
  console.log('Registered event keys:', Object.keys(eventListeners));

  // Retrieve the status change handler
  const statusSelectChangeHandlers = eventListeners['[data-action="status"]:change'];
  assert(statusSelectChangeHandlers && statusSelectChangeHandlers.length > 0, 'Should bind status select change listener');

  // Trigger changing status to 'cutting' by updating mock element value
  mockElementsMap['[data-action="status"]'].value = 'cutting';
  statusSelectChangeHandlers[0]();

  assert(lastToastMsg && lastToastMsg.includes('لا يمكن البدء بالتفصيل أو تعديل الحالة'), 'Should block status change and show error toast');
  assert(lastToastType === 'error', 'Toast type should be error');
  console.log('✅ Status change to cutting blocked for unverified orders as expected.');

  // Test 4b: Verify military order verification
  const verifyClickHandlers = eventListeners['[data-action="verify-military"]:click'];
  assert(verifyClickHandlers && verifyClickHandlers.length > 0, 'Should bind verify military click listener');

  // Trigger clicking "Verify Military ID"
  verifyClickHandlers[0]();

  // Check if order is updated to verified
  const orders = JSON.parse(storage['mken_orders'] || '[]');
  const updatedOrder = orders.find(o => o.id === 'ord_military_test_1');
  assert(updatedOrder && updatedOrder.militaryVerified === true, 'Order should be marked as militaryVerified: true');
  assert(lastToastMsg && lastToastMsg.includes('تم التحقق من الهوية العسكرية'), 'Should toast success verification');
  console.log('✅ Military verification succeeds and updates storage state.');

  // Reload orders after update
  adminOrders.loadOrders();

  // Test 4c: Verify status transition to cutting is now allowed and triggers inventory deduction
  lastToastMsg = null;
  lastToastType = null;
  
  // Trigger changing status to 'cutting' again
  mockElementsMap['[data-action="status"]'].value = 'cutting';
  statusSelectChangeHandlers[0]();

  // Check order status
  const ordersAfterCutting = JSON.parse(storage['mken_orders'] || '[]');
  const cuttingOrder = ordersAfterCutting.find(o => o.id === 'ord_military_test_1');
  assert(cuttingOrder && cuttingOrder.status === 'cutting', 'Order status should be updated to cutting');
  assert(lastToastMsg && lastToastMsg.includes('تم تحديث حالة الطلب بنجاح'), 'Should toast success status update');

  // Check inventory deduction
  const inventoryItems = JSON.parse(storage['mken_inventory_items'] || '[]');
  const fabric = inventoryItems.find(i => i.id === 'uniform-land-forces');
  const buttons = inventoryItems.find(i => i.id === 'military-buttons');
  const lining = inventoryItems.find(i => i.id === 'military-lining');
  const box = inventoryItems.find(i => i.id === 'luxury-box');

  // Expected fabric deduction:
  // jacketLength: 75, trouserLength: 102
  // metersUsed = ((75 + 102) * 2.1 / 100 + 0.3) = (177 * 2.1 / 100 + 0.3) = 3.717 + 0.3 = 4.017 -> 4.0 meters
  assert(fabric && fabric.quantity === 100 - 4.0, 'Should deduct exactly 4.0 meters of fabric (jacket: 75, trouser: 102)');
  assert(buttons && buttons.quantity === 200 - 8, 'Should deduct exactly 8 buttons');
  assert(lining && lining.quantity === 50 - 1.0, 'Should deduct exactly 1.0 meters of lining');
  assert(box && box.quantity === 100 - 1, 'Should deduct exactly 1 luxury packaging box');

  console.log('✅ Inventory deducted correctly for military uniform tailoring.');
  console.log('   - Fabric: ' + fabric.quantity + ' meters left (deducted 4.0)');
  console.log('   - Buttons: ' + buttons.quantity + ' left (deducted 8)');
  console.log('   - Lining: ' + lining.quantity + ' left (deducted 1.0)');
  console.log('   - Box: ' + box.quantity + ' left (deducted 1)');

  console.log('\n✅ All military tailoring logic and admin verification unit tests passed successfully!');
}

try {
  run();
} catch (err) {
  console.error('❌ Unit test failed:', err.message);
  process.exit(1);
}
