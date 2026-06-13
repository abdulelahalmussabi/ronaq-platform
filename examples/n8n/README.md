# n8n Workflows — منصة مكِّن / رونق

## الملفات

| الملف | الوصف |
|-------|--------|
| `mken-whatsapp-saas.workflow.json` | **موصى به للإنتاج** — webhook واحد لجميع المستأجرين |
| `mken-whatsapp-test.workflow.json` | اختبار Token والـ payload بدون إرسال |
| `mken-whatsapp-ultramsg.workflow.json` | Legacy — عميل واحد (`ULTRAMSG_*` env vars) |
| `docker-compose.yml` | PostgreSQL + n8n للإنتاج |
| `nginx-n8n.conf.example` | Reverse proxy + SSL |
| `.env.example` | قالب متغيرات البيئة |

## SaaS — خطوات سريعة

**دليل مفصّل:** [DEPLOY-VPS.md](./DEPLOY-VPS.md)  
**سكربت مساعد:** `sudo bash deploy-vps.sh` (على Ubuntu VPS)

1. `cp .env.example .env` — عبّئ Supabase + كلمة مرور Postgres
2. `docker compose up -d`
3. أعد Nginx + certbot (راجع `DEPLOYMENT.md`)
4. استورد `mken-whatsapp-saas.workflow.json` وفعّله
5. كل عميل يضع في لوحة الإدارة:
   - Custom Webhook URL مع `?tenant=slug`
   - Token للـ Bearer
   - بوابة الإرسال الفعلية (UltraMsg/Twilio)

## متغيرات البيئة (n8n)

| المتغير | مطلوب | الوصف |
|---------|-------|--------|
| `SUPABASE_URL` | نعم | رابط مشروع Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | نعم | مفتاح service role لقراءة `mken_saas_clients` |
| `N8N_HOST` | نعم | النطاق العام |
| `WEBHOOK_URL` | نعم | `https://n8n.domain.com/` |

لا حاجة لـ `ULTRAMSG_INSTANCE_ID` أو `MKEN_WEBHOOK_TOKEN` على مستوى النظام في وضع SaaS.
