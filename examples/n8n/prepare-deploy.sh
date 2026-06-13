#!/usr/bin/env bash
# يُشغَّل محلياً (Git Bash / WSL / Linux) لتوليد حزمة نشر جاهزة للرفع إلى VPS
# الاستخدام: bash prepare-deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/deploy-bundle"

green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }

NON_INTERACTIVE=0
[[ "${1:-}" == "--non-interactive" ]] && NON_INTERACTIVE=1

echo ""
green "=== تجهيز حزمة نشر n8n — منصة مكِّن ==="
echo ""

if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
  DOMAIN="${DOMAIN:?Set DOMAIN}"
  VPS_IP="${VPS_IP:-}"
  SUPABASE_URL="${SUPABASE_URL:?Set SUPABASE_URL}"
  SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"
else
  read -r -p "النطاق الفرعي لـ n8n (مثل n8n.example.com): " DOMAIN
  read -r -p "IP عنوان VPS (لتعليمات DNS): " VPS_IP
  read -r -p "SUPABASE_URL (https://xxx.supabase.co): " SUPABASE_URL
  read -r -s -p "SUPABASE_SERVICE_ROLE_KEY (مخفي): " SUPABASE_KEY
  echo ""
fi

if [[ -z "$DOMAIN" || -z "$SUPABASE_URL" || -z "$SUPABASE_KEY" ]]; then
  echo "خطأ: النطاق و Supabase مطلوبان."
  exit 1
fi

POSTGRES_PASS="$(openssl rand -base64 24 2>/dev/null | tr -d '/+=' | head -c 32 || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"

mkdir -p "$OUT_DIR"
cp "$SCRIPT_DIR/docker-compose.yml" "$OUT_DIR/"
cp "$SCRIPT_DIR/mken-whatsapp-saas.workflow.json" "$OUT_DIR/"
cp "$SCRIPT_DIR/mken-whatsapp-test.workflow.json" "$OUT_DIR/"
cp "$SCRIPT_DIR/deploy-vps.sh" "$OUT_DIR/"

cat > "$OUT_DIR/.env" << EOF
POSTGRES_USER=n8n_user
POSTGRES_PASSWORD=${POSTGRES_PASS}
POSTGRES_DB=n8n_database

N8N_HOST=${DOMAIN}
WEBHOOK_URL=https://${DOMAIN}/

GENERIC_TIMEZONE=Asia/Riyadh

SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_KEY}
EOF

cat > "$OUT_DIR/nginx-n8n.conf" << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

cat > "$OUT_DIR/RUN-ON-VPS.sh" << 'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="/opt/mken-n8n"
mkdir -p "$INSTALL_DIR"
cp -f ./* "$INSTALL_DIR/" 2>/dev/null || true
cp -f .env "$INSTALL_DIR/.env"
cp -f docker-compose.yml "$INSTALL_DIR/"
cd "$INSTALL_DIR"

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
fi

docker compose pull
docker compose up -d
sleep 5
docker compose ps

if command -v nginx >/dev/null 2>&1; then
  cp nginx-n8n.conf /etc/nginx/sites-available/n8n
  ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  echo "Run: certbot --nginx -d $(grep N8N_HOST .env | cut -d= -f2)"
fi

echo "Done. Open https://$(grep N8N_HOST .env | cut -d= -f2)/"
RUNEOF
chmod +x "$OUT_DIR/RUN-ON-VPS.sh"
chmod +x "$OUT_DIR/deploy-vps.sh"

cat > "$OUT_DIR/INSTRUCTIONS.txt" << EOF
========================================
حزمة نشر n8n — ${DOMAIN}
========================================

## 1) DNS (افعل هذا أولاً)
في لوحة النطاق، أضف:

  النوع: A
  الاسم: $(echo "$DOMAIN" | cut -d. -f1)
  القيمة: ${VPS_IP:-YOUR_VPS_IP}

انتظر 5–15 دقيقة، ثم تحقق:
  ping ${DOMAIN}

## 2) رفع الحزمة إلى VPS
من جهازك:
  scp -r deploy-bundle/* root@${VPS_IP:-YOUR_VPS_IP}:/opt/mken-n8n/

## 3) على VPS
  ssh root@${VPS_IP:-YOUR_VPS_IP}
  cd /opt/mken-n8n
  apt update && apt install -y nginx certbot python3-certbot-nginx ufw
  ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
  bash RUN-ON-VPS.sh
  certbot --nginx -d ${DOMAIN}

## 4) n8n
  - افتح https://${DOMAIN}/
  - استورد mken-whatsapp-saas.workflow.json
  - Active = ON

## 5) Webhook لكل عميل
  https://${DOMAIN}/webhook/mken-whatsapp?tenant=SLUG

## 6) اختبار
  curl -X POST "https://${DOMAIN}/webhook/mken-whatsapp?tenant=SLUG" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer TOKEN" \\
    -d '{"to":"9665xxxxxxxx","body":"test","event":"test"}'

========================================
EOF

green "تم إنشاء الحزمة في:"
echo "  $OUT_DIR"
echo ""
yellow "الخطوة التالية:"
echo "  1. ارفع deploy-bundle/* إلى VPS"
echo "  2. اتبع INSTRUCTIONS.txt"
echo ""
yellow "تحذير: deploy-bundle/.env يحتوي أسراراً — لا ترفعه إلى Git."
