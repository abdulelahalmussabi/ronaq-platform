# نشر n8n على VPS — دليل خطوة بخطوة

> **المدة المتوقعة:** 20–40 دقيقة  
> **المتطلبات:** VPS بـ Ubuntu 22.04/24.04، نطاق فرعي (مثل `n8n.yourdomain.com`)، مفاتيح Supabase

---

## 1. تجهيز DNS

في لوحة تحكم النطاق، أضف سجل **A**:

| النوع | الاسم | القيمة |
|-------|-------|--------|
| A | `n8n` | IP عنوان VPS |

انتظر 5–15 دقيقة حتى ينتشر DNS، ثم تحقق:

```bash
ping n8n.yourdomain.com
```

---

## 2. الاتصال بالسيرفر وتثبيت المتطلبات

```bash
ssh root@YOUR_VPS_IP
```

```bash
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw
```

### Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

تحقق:

```bash
docker --version
docker compose version
```

### جدار الحماية

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

> المنفذ **5678** لا يُفتح للعامة — n8n يعمل على `127.0.0.1` فقط.

---

## 3. رفع ملفات n8n

### الخيار أ — من Git (موصى به)

```bash
mkdir -p /opt/mken-n8n
cd /opt/mken-n8n
git clone https://github.com/YOUR_ORG/ronaq-platform.git repo
cp -r repo/examples/n8n/* .
```

### الخيار ب — نسخ يدوي

انسخ من جهازك إلى السيرفر:

```bash
scp -r examples/n8n/* root@YOUR_VPS_IP:/opt/mken-n8n/
```

---

## 4. إعداد ملف `.env`

```bash
cd /opt/mken-n8n
cp .env.example .env
nano .env
```

عبّئ القيم:

```env
POSTGRES_USER=n8n_user
POSTGRES_PASSWORD=STRONG_RANDOM_PASSWORD_HERE
POSTGRES_DB=n8n_database

N8N_HOST=n8n.yourdomain.com
WEBHOOK_URL=https://n8n.yourdomain.com/

GENERIC_TIMEZONE=Asia/Riyadh

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**توليد كلمة مرور قوية:**

```bash
openssl rand -base64 32
```

> `SUPABASE_SERVICE_ROLE_KEY` من: Supabase → Project Settings → API → `service_role` (secret)

---

## 5. تشغيل Docker Compose

```bash
cd /opt/mken-n8n
docker compose up -d
docker compose ps
docker compose logs -f n8n
```

يجب أن ترى:

```
n8n-postgres   running (healthy)
n8n-app        running
```

تحقق محلياً على السيرفر:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5678
# المتوقع: 200 أو 401
```

---

## 6. Nginx + SSL

### أ) إعداد HTTP مؤقت (لـ certbot)

```bash
cat > /etc/nginx/sites-available/n8n << 'EOF'
server {
    listen 80;
    server_name n8n.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
```

**عدّل** `n8n.yourdomain.com` إلى نطاقك الفعلي.

```bash
ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### ب) شهادة SSL

```bash
certbot --nginx -d n8n.yourdomain.com
```

اتبع التعليمات (بريد، الموافقة على الشروط، إعادة التوجيه HTTPS).

### ج) التحقق

```bash
curl -I https://n8n.yourdomain.com
```

افتح في المتصفح: `https://n8n.yourdomain.com` — يجب أن تظهر شاشة إعداد حساب n8n.

---

## 7. إعداد n8n لأول مرة

1. أنشئ حساب المدير (البريد + كلمة مرور).
2. **Workflows → Import from File** → `mken-whatsapp-saas.workflow.json`
3. تأكد أن Workflow **Active = ON** (مفتاح أخضر).
4. من عقدة **Mken Webhook** انسخ رابط الإنتاج:
   ```
   https://n8n.yourdomain.com/webhook/mken-whatsapp?tenant=SLUG
   ```

---

## 8. اختبار Webhook

```bash
curl -X POST "https://n8n.yourdomain.com/webhook/mken-whatsapp?tenant=YOUR-TENANT-SLUG" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
  -d '{"to":"9665xxxxxxxx","body":"اختبار n8n SaaS","event":"test"}'
```

**استجابة ناجحة:**

```json
{"ok":true,"sent":true,"tenant":"YOUR-TENANT-SLUG","event":"test","to":"9665xxxxxxxx"}
```

**أخطاء شائعة:**

| الاستجابة | السبب | الحل |
|-----------|-------|------|
| `401 Unauthorized` | Token غير مطابق | طابق Token في لوحة الإدارة مع Bearer |
| `404 Tenant not found` | slug خاطئ | تحقق من `tenant_slug` في Supabase |
| `422 Gateway provider not configured` | بوابة الإرسال الفعلية فارغة | أكمل قسم «بوابة الإرسال الفعلية» في admin.html واحفظ |
| `502 Bad Gateway` | n8n متوقف | `docker compose restart n8n` |

---

## 9. أوامر الصيانة

```bash
cd /opt/mken-n8n

# إعادة تشغيل
docker compose restart

# تحديث n8n لأحدث إصدار
docker compose pull
docker compose up -d

# السجلات
docker compose logs -f n8n --tail 100

# نسخ احتياطي لبيانات n8n
docker run --rm -v mken-n8n_n8n_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/n8n-backup-$(date +%Y%m%d).tar.gz -C /data .
```

> اسم volume قد يختلف — اعرضه بـ: `docker volume ls | grep n8n`

---

## 10. التشغيل التلقائي بعد إعادة تشغيل السيرفر

Docker Compose مع `restart: always` يكفي عادةً. تحقق:

```bash
reboot
# بعد الدخول مجدداً:
docker compose -f /opt/mken-n8n/docker-compose.yml ps
```

---

## Checklist سريع

- [ ] DNS يشير إلى IP السيرفر
- [ ] `.env` مكتمل (Postgres + Supabase)
- [ ] `docker compose ps` — حاويتان running
- [ ] `https://n8n.domain.com` يفتح
- [ ] Workflow SaaS مفعّل (Active)
- [ ] اختبار curl يرجع `ok: true`
- [ ] عميل واحد على الأقل مضبوط في admin.html
