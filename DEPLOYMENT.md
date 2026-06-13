# دليل النشر والتهيئة للإنتاج — منصة مكِّن (SAAS)

يقدم هذا الدليل الخطوات اللازمة لتهيئة ونشر منصة مكِّن متعددة الأنشطة سحابياً في بيئة الإنتاج بشكل آمن ومتكامل.

---

## 1. نشر الواجهة الأمامية (Frontend Deployment)

المنصة عبارة عن تطبيق ويب ساكن (Static Web App) مبني بـ HTML/JS/CSS، مما يجعله مثالياً للنشر على المنصات السحابية المجانية والسريعة.

### الخيار أ: النشر عبر Vercel (موصى به لدعم النطاقات الفرعية)
1. قم بإنشاء حساب على [Vercel](https://vercel.com).
2. قم بربط مستودع Git الخاص بالمشروع.
3. قم بإنشاء مشروع جديد واعمل له Deploy مباشرة.
4. **توجيه النطاقات الفرعية (Wildcard Subdomains):**
   * من لوحة تحكم المشروع في Vercel، انتقل إلى **Settings** -> **Domains**.
   * أضف نطاقك المخصص بصيغة النجمة، مثل: `*.yourdomain.com`.
   * قم بتوجيه إعدادات الـ DNS لنطاقك (مستندات CNAME أو A record) إلى خوادم Vercel كما هو موضح في لوحتهم.
   * الآن، عند الدخول إلى `test-salon.yourdomain.com` سيتعرف النظام أوتوماتيكياً على المعرّف `test-salon` ويشحن بياناته!

### الخيار ب: النشر عبر Netlify
1. قم بإنشاء حساب على [Netlify](https://netlify.com) وارفع مجلد المشروع.
2. لتفعيل النطاقات الفرعية التلقائية، يجب ترقية الحساب أو استخدام إعدادات DNS الخاصة بـ Netlify وتوجيه Wildcard CNAME.

---

## 2. إعداد قاعدة البيانات والربط السحابي (Supabase Setup)

تعتمد المنصة على Supabase كخلفية سحابية لإدارة بيانات المستأجرين والمواعيد والحسابات.

### أ) إنشاء المشروع والجداول
1. أنشئ حساباً ومشروعاً جديداً على [Supabase](https://supabase.com).
2. انتقل إلى لوحة التحكم الخاصة بالمشروع ثم إلى قسم **SQL Editor**.
3. افتح لوحة الإدارة الخاصة بموقعك `/admin.html` وانتقل إلى تبويب **الربط والأتمتة**.
4. انسخ كود الـ SQL بالكامل من الصندوق المخصص في صفحة الإدارة.
5. الصق الكود في **SQL Editor** بـ Supabase واضغط على **Run**.
6. سيقوم السكريبت بإنشاء:
   * جدول المستأجرين `mken_saas_clients`.
   * جدول المواعيد `mken_appointments` مع عمود `tenant_slug`.
   * تفعيل جدار حماية الجداول (RLS) وتجهيز سياسات الأمان للإنتاج.

### ب) تفعيل نظام الحسابات (Supabase Auth)
1. في لوحة تحكم Supabase، انتقل إلى **Authentication** -> **Providers** -> **Email**.
2. تأكد من تفعيل خيار **Enable Email Signup** و **Confirm Email** (أو عطل خيار التحقق من البريد لتسجيل مباشر وسهل للعملاء).
3. **لربط مستخدم جديد بمستأجر:**
   * عند قيام العميل بالتسجيل عبر واجهة تسجيل حساب جديد في `/admin.html`، يتم تلقائياً إنشاء مستخدم في Supabase Auth وربطه بصف الـ Client عبر حقل `owner_id`.
   * **للتسجيل اليدوي من طرفك (Super Admin):**
     1. أنشئ مستخدماً بريداً إلكترونياً جديداً في قسم **Users** بـ Supabase.
     2. انسخ معرّف المستخدم (User ID / UUID).
     3. أدخل صفاً جديداً في جدول `mken_saas_clients` وضع المعرّف المنسوخ في حقل `owner_id`.

---

## 3. تشغيل أتمتة الواتساب وتنبيهات الاشتراكات (WhatsApp Scheduler)

يقوم السكربت [whatsapp-scheduler.mjs](file:///d:/de7me/mken-platform/scripts/whatsapp-scheduler.mjs) بفحص قاعدة البيانات دورياً لإرسال تنبيهات المواعيد وتذكير العملاء قبل انتهاء اشتراكاتهم بـ 30 يوماً و 14 يوماً.

### أ) المتطلبات والتشغيل المحلي
1. انتقل لمجلد السكربتات وثبت الحزم:
   ```bash
   cd scripts
   npm install @supabase/supabase-js
   ```
2. قم بإنشاء ملف إعداد بيئي `.env` في المجلد الرئيسي يحتوي على بيانات الاتصال بـ Supabase:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-service-role-key-or-anon-key
   ```
3. لتشغيل السكربت يدوياً:
   ```bash
   node scripts/whatsapp-scheduler.mjs
   ```

### ب) التشغيل التلقائي دورياً (Production Cron Job)
لضمان عمل السكربت بانتظام، يوصى بجدولته للعمل كل ساعة أو كل ساعتين تلقائياً عبر إحدى الطرق التالية:

#### 1. الجدولة عبر Vercel Cron (موصى به وسهل جداً سحابياً)
المنصة مجهزة بملف إعداد `vercel.json` ووظيفة سحابية مخصصة للجدولة في المجلد `/api/cron-whatsapp.js`.
1. عند نشر مشروعك على Vercel، سيتعرف النظام تلقائياً على الجدولة المحددة في `vercel.json` (افتراضياً كل ساعتين).
2. قم بإضافة المتغيرات البيئية التالية في إعدادات مشروع Vercel (**Environment Variables**):

   | المتغير | الوصف | الأهمية |
   |---------|-------|---------|
   | `SUPABASE_URL` | رابط مشروعك في Supabase | 🔴 إلزامي |
   | `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخدمة الكاملة (لتعديل البيانات والتأكيد) | 🔴 إلزامي |
   | `MOYASAR_SECRET_KEY` | مفتاح Moyasar السري للتحقق من المدفوعات | 🔴 إلزامي (webhook يرفض الطلبات بدونه) |
   | `ADMIN_PIN` | رمز الدخول للوحة الإدارة (بديل `mken2026` الافتراضي) | 🟡 موصى به |
   | `MKEN_PIN` | رمز الدخول البديل للوحة الإدارة | 🟡 موصى به |
   | `CRON_SECRET` | رمز حماية مسار ويب هوك الكرون من الاستدعاء العشوائي | 🟢 اختياري |

   > [!CAUTION]
   > **أمان حرج:** لا تضع قيم هذه المتغيرات في الكود المصدري أو ملفات `.env` المرفوعة للمستودع.  
   > استخدم دائماً **Vercel Environment Variables** أو **GitHub Secrets**.

3. يمكنك اختبار تشغيل الجدولة يدوياً بزيارة مسار الويب هوك الخاص بك: `https://your-domain.com/api/cron-whatsapp`.

#### 2. الجدولة عبر GitHub Actions (مجاني للتشغيل المستقل)
قم بإنشاء ملف سير عمل `.github/workflows/whatsapp-scheduler.yml`:
```yaml
name: Run WhatsApp Scheduler

on:
  schedule:
    - cron: '0 */6 * * *' # يعمل كل 6 ساعات
  workflow_dispatch: # للتشغيل اليدوي

jobs:
  run-scheduler:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install @supabase/supabase-js
      - name: Run Script
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
        run: node scripts/whatsapp-scheduler.mjs
```
*أضف المفاتيح السحابية في إعدادات مستودع GitHub الخاص بك تحت قسم Secrets.*

#### 3. الجدولة على خادم VPS (Linux Cron Job)
أضف السطر التالي لملف الجدولة `crontab -e`:
```bash
0 */6 * * * cd /path/to/mken-platform && SUPABASE_URL="https://xxx.supabase.co" SUPABASE_KEY="your_key" node scripts/whatsapp-scheduler.mjs >> scheduler.log 2>&1
```

---

## 4. استضافة n8n للإنتاج (WhatsApp SaaS Automation)

لتشغيل سير عمل واتساب مركزي يخدم **جميع المستأجرين** ديناميكياً (بدون متغيرات بيئة ثابتة لكل عميل)، استضِف n8n على VPS.

### أ) تشغيل n8n عبر Docker Compose

1. على VPS (DigitalOcean / Hetzner / AWS)، انسخ مجلد `examples/n8n/` إلى السيرفر.
2. انسخ `.env.example` إلى `.env` وعبّئ القيم:
   ```env
   POSTGRES_PASSWORD=secure_password_here
   N8N_HOST=n8n.yourdomain.com
   WEBHOOK_URL=https://n8n.yourdomain.com/
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
3. شغّل الحاويات:
   ```bash
   cd /path/to/examples/n8n
   docker compose up -d
   ```
4. راقب السجلات: `docker compose logs -f n8n`

### ب) Reverse Proxy و SSL (Nginx + Let's Encrypt)

1. انسخ `examples/n8n/nginx-n8n.conf.example` إلى `/etc/nginx/sites-available/n8n`.
2. عدّل `server_name` ليطابق نطاقك.
3. فعّل الموقع: `sudo ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/`
4. احصل على شهادة SSL:
   ```bash
   sudo certbot --nginx -d n8n.yourdomain.com
   sudo nginx -t && sudo systemctl reload nginx
   ```

> n8n يستمع على `127.0.0.1:5678` فقط — لا تفتح المنفذ مباشرة للإنترنت.

### ج) استيراد سير العمل SaaS

1. افتح `https://n8n.yourdomain.com` وسجّل الدخول.
2. **Workflows → Import from File** → `mken-whatsapp-saas.workflow.json`
3. تأكد أن متغيرات `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` موجودة في `.env` (تُمرَّر تلقائياً عبر Docker Compose).
4. فعّل الـ Workflow (**Active = ON**).

**مسار الـ Webhook لكل عميل:**
```
https://n8n.yourdomain.com/webhook/mken-whatsapp?tenant=CLIENT-SLUG
```

### د) تهيئة العملاء من لوحة الإدارة

كل عميل (Tenant) في `/admin.html` → **الربط والأتمتة → إعدادات واتساب**:

| الحقل | القيمة |
|-------|--------|
| بوابة الإرسال | Custom Webhook |
| API URL | `https://n8n.yourdomain.com/webhook/mken-whatsapp?tenant=slug-العميل` |
| Token | مفتاح Bearer لحماية المسار |
| بوابة الإرسال الفعلية | UltraMsg أو Twilio + بيانات الحساب |

يحفظ n8n بيانات البوابة الفعلية في `config_data.whatsappApi.gateway` ويقرأها من Supabase عند كل طلب.

### هـ) سير العمل داخل n8n (SaaS)

```
Webhook (?tenant=slug)
  → Fetch Tenant Settings (Supabase REST)
  → Validate And Extract (Token + gateway credentials)
  → Route Provider (ultramsg / twilio)
  → Send → Respond 200
```

**ملفات سير العمل:**

| الملف | الاستخدام |
|-------|-----------|
| `mken-whatsapp-saas.workflow.json` | **إنتاج SaaS** — متعدد المستأجرين |
| `mken-whatsapp-test.workflow.json` | اختبار الربط فقط (بدون إرسال) |
| `mken-whatsapp-ultramsg.workflow.json` | Legacy — عميل واحد بمتغيرات بيئة ثابتة |

---

## 5. الفحص الأمني بعد النشر (Post-Deployment Audit)

* افتح متصفحك في وضع التصفح المخفي وحاول الدخول لصفحة الإدارة لعميل آخر.
* تأكد من أن أي محاولة لقراءة أو تحديث جدول المواعيد أو إعدادات المستأجرين بدون تسجيل الدخول بحساب المالك الصحيح تفشل كلياً وتُرجع خطأ `401 Unauthorized` بفضل سياسات RLS المفعّلة.
