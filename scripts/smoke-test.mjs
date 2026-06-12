/**
 * اختبارات Smoke المؤتمتة لمسارات الحجز والدفع والطلب والـ API وبوابة الموظفين
 * 
 * طريقة التشغيل:
 * 1. شغّل خادم التطوير المحلي أولاً (مثال: python -m http.server 8080 أو عبر start.ps1)
 * 2. انتقل لمجلد السكريبتات وثبّت الحزم:
 *    cd scripts && npm install
 * 3. شغّل الاختبار:
 *    node smoke-test.mjs
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const BASE_URL = 'http://localhost:8080';

async function runTests() {
  console.log('🚀 بدء اختبارات Smoke المؤتمتة لمنصة مكِّن (mken)...');
  
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error('❌ فشل تشغيل متصفح Playwright Chromium. تأكد من تثبيته عبر تشغيل `npx playwright install` في الطرفية.');
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'ar-SA',
    dir: 'rtl'
  });

  const page = await context.newPage();

  // الاستماع لرسائل الكونسول من المتصفح لتسهيل تتبع أي أخطاء JS في الصفحات
  page.on('console', msg => {
    const txt = msg.text();
    if (txt.includes('[Supabase]') || txt.toLowerCase().includes('error') || txt.includes('فشل')) {
      console.log(`   🚨 [Browser Console]: ${txt}`);
    } else {
      console.log(`   ℹ️ [Browser Console]: ${txt}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`   ❌ [Browser Page Error]: ${err.message}`);
  });

  // فحص تواجد الخادم المحلي
  try {
    await page.goto(BASE_URL);
  } catch (err) {
    console.error(`❌ لم يتم العثور على خادم ويب محلي في الرابط ${BASE_URL}.`);
    console.log('💡 يرجى تشغيل المشروع محلياً أولاً عبر تشغيل الملف `start.ps1` أو تشغيل الأمر `python -m http.server 8080` في المجلد الرئيسي.');
    await browser.close();
    process.exit(1);
  }

  try {
    // ----------------------------------------------------
    // الاختبار 1: مسار حجز الخدمات (booking.html)
    // ----------------------------------------------------
    console.log('\n🔍 1. اختبار مسار الحجز والدفع (book.html)...');
    await page.goto(`${BASE_URL}/book.html?activity=barber-salon`);
    await page.waitForLoadState('networkidle');

    // التأكد من تحميل صفحة الحجز
    const title = await page.title();
    console.log(`ℹ️ عنوان الصفحة الحالية: ${title}`);

    // اختيار الخدمة الأولى المتاحة
    console.log('   - اختيار الخدمة الأولى...');
    const firstService = page.locator('.booking-service').first();
    await firstService.click();
    await page.waitForTimeout(500);

    // النقر للانتقال للتاريخ
    console.log('   - الانتقال للخطوة التالية: التاريخ...');
    const toDateBtn = page.locator('#btnToDate');
    await toDateBtn.click();
    await page.waitForTimeout(500);

    // اختيار اليوم الأول المتاح بالتقويم
    console.log('   - اختيار يوم متاح من التقويم...');
    const availableDay = page.locator('.booking-calendar__day--available').first();
    await availableDay.click();
    await page.waitForTimeout(500);

    // الانتقال للوقت
    console.log('   - الانتقال للخطوة التالية: الوقت...');
    const toTimeBtn = page.locator('#btnToTime');
    await toTimeBtn.click();
    await page.waitForTimeout(500);

    // اختيار الفترة الأولى المتاحة
    console.log('   - اختيار فترة زمنية متاحة...');
    const availableSlot = page.locator('.booking-slot').first();
    await availableSlot.click();
    await page.waitForTimeout(500);

    // الانتقال لبيانات العميل
    console.log('   - الانتقال لخطوة البيانات وتعبئة النموذج...');
    const toFormBtn = page.locator('#btnToForm');
    await toFormBtn.click();
    await page.waitForTimeout(500);

    // تعبئة البيانات
    await page.fill('#customerName', 'عميل تجريبي Smoke Test');
    await page.fill('#customerPhone', '9665056138908');
    await page.fill('#customerDistrict', 'النسيم الشرقية');
    if (await page.locator('#customerAddress').isVisible()) {
      await page.fill('#customerAddress', 'شارع حراء، مبنى 12');
    }
    await page.fill('#customerNotes', 'موعد تجريبي تلقائي عبر Playwright');

    // إرسال النموذج
    console.log('   - إرسال الحجز...');
    await page.click('#bookingForm button[type="submit"]');
    await page.waitForTimeout(1500);

    // التحقق من الانتقال للدفع أو النجاح
    const isPaymentPanelVisible = await page.locator('#panelPayment').isVisible();
    const isSuccessPanelVisible = await page.locator('#panelSuccess').isVisible();

    if (isPaymentPanelVisible) {
      console.log('   ✅ حجز ناجح: تم الانتقال إلى بوابة الدفع الإلكتروني بنجاح!');
      const hasMoyasar = await page.locator('.mysr-form').innerHTML();
      if (hasMoyasar.includes('iframe') || hasMoyasar.length > 0) {
        console.log('   ✅ نجاح: تم تحميل واجهة دفع Moyasar بنجاح.');
      } else {
        console.log('   ⚠️ تنبيه: واجهة Moyasar فارغة، قد يكون المفتاح العام Publishable Key غير مهيأ.');
      }
    } else if (isSuccessPanelVisible) {
      console.log('   ✅ حجز ناجح: تم الانتقال لصفحة النجاح مباشرة (الدفع غير إلزامي أو غير مفعل).');
    } else {
      throw new Error('فشل إرسال الحجز، لم تظهر صفحة الدفع أو النجاح.');
    }

    // ----------------------------------------------------
    // الاختبار 2: مسار الطلبات والتجارة (order.html)
    // ----------------------------------------------------
    console.log('\n🔍 2. اختبار مسار طلب المنتجات والسلة (order.html)...');
    await page.goto(`${BASE_URL}/order.html?activity=commerce`);
    await page.waitForLoadState('networkidle');

    // إضافة أول منتج للسلة
    console.log('   - إضافة منتج للسلة...');
    const addProductBtn = page.locator('[data-add]').first();
    await addProductBtn.click();
    await page.waitForTimeout(500);

    // فتح السلة
    console.log('   - الانتقال إلى السلة...');
    const cartBar = page.locator('#orderCartBar');
    await cartBar.locator('#btnOpenCart').click();
    await page.waitForTimeout(500);

    // الانتقال للبيانات
    console.log('   - الانتقال للخطوة التالية: بيانات الشحن والتواصل...');
    await page.click('#btnToForm');
    await page.waitForTimeout(500);

    // تعبئة البيانات
    await page.fill('#orderName', 'مشتري تجريبي Smoke Test');
    await page.fill('#orderPhone', '9665056138908');
    await page.fill('#orderDistrict', 'حي الصفا');
    if (await page.locator('#orderAddress').isVisible()) {
      await page.fill('#orderAddress', 'شارع التحلية، بجانب البريد');
    }
    await page.fill('#orderNotes', 'طلب تجريبي تلقائي عبر Playwright');

    // إرسال الطلب
    console.log('   - إرسال الطلب والتأكيد...');
    await page.click('#orderForm button[type="submit"]');
    await page.waitForTimeout(1500);

    // التحقق من انتقال الطلب
    const isOrderPaymentVisible = await page.locator('#panelPayment').isVisible();
    const isOrderSuccessVisible = await page.locator('#panelOrderSuccess').isVisible();

    if (isOrderPaymentVisible) {
      console.log('   ✅ طلب ناجح: تم الانتقال إلى بوابة الدفع الإلكتروني بنجاح!');
    } else if (isOrderSuccessVisible) {
      console.log('   ✅ طلب ناجح: تم الانتقال لصفحة نجاح الطلب وإرساله للواتساب.');
    } else {
      throw new Error('فشل إرسال الطلب، لم تظهر صفحة النجاح.');
    }

    // ----------------------------------------------------
    // الاختبار 3: بوابة الفنيين والموظفين (staff.html)
    // ----------------------------------------------------
    console.log('\n🔍 3. اختبار بوابة الموظفين والفنيين (staff.html)...');
    await page.goto(`${BASE_URL}/staff.html`);
    await page.waitForLoadState('networkidle');

    // حقن محاكاة Supabase في صفحة الفني للتشغيل بدون تهيئة حقيقية
    console.log('   - حقن محاكاة Supabase لصفحة الموظف...');
    await page.evaluate(() => {
      window.mockSupabaseData = {
        ronaq_staff: [
          {
            id: 'staff_test_1',
            name: 'فني تجريبي Smoke Test',
            role: 'technician',
            phone: '0505613890',
            pin_code: '1234',
            status: 'active',
            tenant_slug: 'default'
          }
        ],
        ronaq_appointments: [
          {
            id: 'apt_test_1',
            tenant_slug: 'default',
            activity_id: 'barber-salon',
            service_id: 'haircut',
            date: new Date().toISOString().split('T')[0],
            time: '14:00',
            customer_name: 'عميل تجريبي Smoke',
            phone: '9665056138908',
            district: 'حي النخيل',
            location_address: 'شارع التخصصي',
            notes: 'موعد فحص البصمة والتحكم',
            status: 'pending',
            staff_id: 'staff_test_1'
          }
        ]
      };

      window.RonaqSupabaseDb = {
        isConfigured: () => true,
        getClient: () => {
          const builder = {
            select: () => builder,
            eq: () => builder,
            order: () => builder,
            maybeSingle: async () => {
              return { data: window.mockSupabaseData.ronaq_staff[0], error: null };
            },
            update: (updates) => {
              Object.assign(window.mockSupabaseData.ronaq_appointments[0], updates);
              return {
                eq: () => ({
                  then: function(resolve) {
                    resolve({ data: [window.mockSupabaseData.ronaq_appointments[0]], error: null });
                    return Promise.resolve({ data: [window.mockSupabaseData.ronaq_appointments[0]], error: null });
                  }
                })
              };
            },
            then: function(resolve) {
              resolve({ data: window.mockSupabaseData.ronaq_appointments, error: null });
              return Promise.resolve({ data: window.mockSupabaseData.ronaq_appointments, error: null });
            }
          };
          const rpcBuilder = {
            order: () => rpcBuilder,
            then: function(resolve) {
              resolve({ data: window.mockSupabaseData.ronaq_appointments, error: null });
              return Promise.resolve({ data: window.mockSupabaseData.ronaq_appointments, error: null });
            }
          };
          return {
            from: (table) => builder,
            rpc: (name, args) => {
              if (name === 'verify_staff_pin') {
                return {
                  then: function(resolve) {
                    const staff = window.mockSupabaseData.ronaq_staff[0];
                    resolve({
                      data: {
                        success: true,
                        id: staff.id,
                        name: staff.name,
                        role: staff.role,
                        phone: staff.phone,
                        tenantSlug: staff.tenant_slug
                      },
                      error: null
                    });
                    return Promise.resolve();
                  }
                };
              }
              if (name === 'get_staff_appointments') {
                return rpcBuilder;
              }
              if (name === 'update_staff_appointment_status') {
                if (args && args.p_new_status) {
                  window.mockSupabaseData.ronaq_appointments[0].status = args.p_new_status;
                }
                return {
                  then: function(resolve) {
                    resolve({ data: { success: true }, error: null });
                    return Promise.resolve();
                  }
                };
              }
              return {
                then: function(resolve) {
                  resolve({ data: null, error: null });
                  return Promise.resolve();
                }
              };
            }
          };
        }
      };
    });

    // تعبئة البيانات للفني
    console.log('   - تعبئة بيانات الدخول (PIN)...');
    await page.fill('#loginTenant', 'default');
    await page.fill('#loginPhone', '0505613890');
    await page.fill('#loginPin', '1234');

    // النقر على تسجيل الدخول
    console.log('   - النقر على زر تسجيل الدخول للفني...');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForTimeout(1000);

    // التحقق من الانتقال للوحة التحكم
    const isDashboardVisible = await page.locator('#panelDashboard').isVisible();
    if (!isDashboardVisible) {
      throw new Error('فشل الدخول إلى لوحة الفني، بقيت واجهة الدخول معروضة.');
    }
    console.log('   ✅ نجاح: تم تسجيل دخول الفني وعرض لوحة المهام.');

    // التحقق من اسم الفني
    const greeting = await page.locator('#staffGreeting').textContent();
    console.log(`   ℹ️ الترحيب الظاهر: ${greeting}`);
    if (!greeting.includes('فني تجريبي')) {
      throw new Error('الترحيب بالفني لا يحتوي الاسم الصحيح المحاكي.');
    }

    // التحقق من وجود المهمة
    const taskTitle = await page.locator('.task-title').first().textContent();
    console.log(`   ℹ️ عنوان المهمة المسندة: ${taskTitle}`);

    // النقر على بدء العمل
    console.log('   - النقر على "⚙️ بدء العمل" لتغيير حالة الموعد...');
    await page.click('[data-action="start"]');
    await page.waitForTimeout(1000);

    // فحص البادج الخاص بالحالة
    const statusLabel = await page.locator('.task-status-badge').first().textContent();
    console.log(`   ℹ️ حالة المهمة الحالية: ${statusLabel}`);
    if (!statusLabel.includes('قيد التنفيذ')) {
      throw new Error('لم تتغير حالة المهمة إلى "قيد التنفيذ" بعد النقر.');
    }
    console.log('   ✅ نجاح: تم بدء العمل بنجاح ومحاكاة التحديث سحابياً.');

    // ----------------------------------------------------
    // الاختبار 4: واجهة المطورين العامة (Public API v1)
    // ----------------------------------------------------
    console.log('\n🔍 4. اختبار واجهات المطورين العامة (Public API v1)...');
    
    // إعداد بيئة محاكاة لـ API
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_key';

    // حقن محاكي Supabase في require.cache ليكون متاحاً للـ handlers
    const mockPath = require.resolve('@supabase/supabase-js');
    
    // إيجاد مسار الحزمة بالنسبة للمجلدات الفرعية (كواجهة الـ API) لتجنب حل المسار الفعلي من node_modules الرئيسي
    const apiRequire = createRequire(new URL('../api/v1/appointments.js', import.meta.url));
    let mockPathApi = null;
    try {
      mockPathApi = apiRequire.resolve('@supabase/supabase-js');
    } catch (e) {}

    const supabaseMock = {
      createClient: () => ({
        from: (table) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'ronaq_api_keys') {
                  return { data: { tenant_slug: 'default', expires_at: null }, error: null };
                }
                if (table === 'ronaq_appointments' || table === 'ronaq_orders') {
                  return { data: { id: 'test_123', tenant_slug: 'default' }, error: null };
                }
                return { data: null, error: null };
              },
              order: () => ({
                then: (resolve) => {
                  const items = table === 'ronaq_appointments' 
                    ? [{ id: 'apt_test_1', tenant_slug: 'default', activity_id: 'hair', service_id: 'cut', date: '2026-06-12', time: '12:00', customer_name: 'Ahmed', phone: '966500000000', status: 'pending' }]
                    : [{ id: 'ord_test_1', tenant_slug: 'default', activity_id: 'commerce', customer_name: 'Ali', phone: '966500000000', items: [], status: 'pending' }];
                  resolve({ data: items, error: null });
                }
              })
            })
          }),
          insert: (row) => ({
            select: () => ({
              single: async () => ({ data: row, error: null })
            })
          }),
          update: (updates) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: Object.assign({ id: 'test_123', tenant_slug: 'default' }, updates), error: null })
                })
              })
            })
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null })
            })
          })
        })
      })
    };

    require.cache[mockPath] = {
      id: mockPath,
      filename: mockPath,
      loaded: true,
      exports: supabaseMock
    };

    if (mockPathApi && mockPathApi !== mockPath) {
      require.cache[mockPathApi] = {
        id: mockPathApi,
        filename: mockPathApi,
        loaded: true,
        exports: supabaseMock
      };
    }

    const appointmentsHandler = require('../api/v1/appointments.js');
    const ordersHandler = require('../api/v1/orders.js');

    const mockRes = () => {
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        end() { return this; }
      };
      return res;
    };

    // 4أ. اختبار التحقق من الهيدر (Authorization)
    console.log('   - 4أ. فحص رفض الطلبات دون رمز Token...');
    const req1 = { method: 'GET', headers: {}, query: {} };
    const res1 = mockRes();
    await appointmentsHandler(req1, res1);
    if (res1.statusCode !== 401) {
      throw new Error(`يجب رفض الطلب بدون Token بكود 401، ولكن استجاب بكود: ${res1.statusCode}`);
    }
    console.log('   ✅ تم رفض الطلب بنجاح (401 Unauthorized).');

    // 4ب. اختبار جلب المواعيد بالتفويض الصحيح
    console.log('   - 4ب. فحص جلب قائمة المواعيد مع Token صحيح...');
    const req2 = { method: 'GET', headers: { authorization: 'Bearer mken_live_mock_token' }, query: {} };
    const res2 = mockRes();
    await appointmentsHandler(req2, res2);
    if (res2.statusCode !== 200 || !Array.isArray(res2.body)) {
      throw new Error(`فشل جلب المواعيد، الكود: ${res2.statusCode}`);
    }
    console.log(`   ✅ تم جلب المواعيد بنجاح، العدد: ${res2.body.length}`);

    // 4ج. اختبار إضافة موعد جديد
    console.log('   - 4ج. فحص إضافة موعد جديد (POST)...');
    const newApt = {
      activityId: 'barber-salon',
      serviceId: 'haircut',
      customerName: 'عميل خارجي API',
      phone: '966555555555',
      date: '2026-07-01',
      time: '15:30'
    };
    const req3 = {
      method: 'POST',
      headers: { authorization: 'Bearer mken_live_mock_token' },
      body: newApt
    };
    const res3 = mockRes();
    await appointmentsHandler(req3, res3);
    if (res3.statusCode !== 201 || res3.body.customerName !== 'عميل خارجي API') {
      throw new Error(`فشل إضافة موعد عبر API، الكود: ${res3.statusCode}`);
    }
    console.log('   ✅ تم إضافة الموعد بنجاح بكود 201.');

    // 4د. اختبار جلب الطلبات (GET Orders)
    console.log('   - 4د. فحص جلب قائمة الطلبات...');
    const req4 = { method: 'GET', headers: { authorization: 'Bearer mken_live_mock_token' }, query: {} };
    const res4 = mockRes();
    await ordersHandler(req4, res4);
    if (res4.statusCode !== 200 || !Array.isArray(res4.body)) {
      throw new Error(`فشل جلب الطلبات، الكود: ${res4.statusCode}`);
    }
    console.log(`   ✅ تم جلب الطلبات بنجاح، العدد: ${res4.body.length}`);

    // 4هـ. اختبار إضافة طلب جديد (POST Order)
    console.log('   - 4هـ. فحص إضافة طلب جديد (POST)...');
    const newOrder = {
      activityId: 'commerce',
      activityTitle: 'متجر مكِّن',
      customerName: 'مشتري خارجي API',
      phone: '966555555555',
      items: [{ id: 'prod_1', title: 'منتج تجريبي', price: 100, quantity: 2 }]
    };
    const req5 = {
      method: 'POST',
      headers: { authorization: 'Bearer mken_live_mock_token' },
      body: newOrder
    };
    const res5 = mockRes();
    await ordersHandler(req5, res5);
    if (res5.statusCode !== 201 || res5.body.customerName !== 'مشتري خارجي API') {
      throw new Error(`فشل إضافة طلب عبر API، الكود: ${res5.statusCode}`);
    }
    console.log('   ✅ تم إضافة الطلب بنجاح بكود 201.');

    console.log('\n🎉 جميع اختبارات Smoke انتهت بنجاح وتعمل مسارات الحجز والدفع وبوابة الموظفين والـ API دون أي مشاكل! 🚀\n');
    await browser.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ حدث خطأ أثناء فحص مسار الاختبار:');
    console.error(error.stack || error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

runTests();

