#!/usr/bin/env bash
# n8n VPS deploy helper — run on Ubuntu/Debian as root or with sudo
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/mken-n8n}"
DOMAIN="${DOMAIN:-}"

red() { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "Missing: $1"
    exit 1
  fi
}

step() {
  echo ""
  green "==> $1"
}

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  red "Run as root: sudo bash deploy-vps.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step "Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  yellow "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi
require_cmd docker
docker compose version >/dev/null 2>&1 || { red "docker compose plugin missing"; exit 1; }

step "Preparing install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  yellow "Created $INSTALL_DIR/.env — edit it before continuing."
  yellow "Required: POSTGRES_PASSWORD, N8N_HOST, WEBHOOK_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  if [[ -z "$DOMAIN" ]]; then
    read -r -p "Enter n8n domain (e.g. n8n.yourdomain.com): " DOMAIN
  fi
  if [[ -n "$DOMAIN" ]]; then
    sed -i "s|n8n.yourdomain.com|$DOMAIN|g" "$INSTALL_DIR/.env"
  fi
  POSTGRES_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  sed -i "s|choose_a_secure_password_here|$POSTGRES_PASS|g" "$INSTALL_DIR/.env"
  green "Generated POSTGRES_PASSWORD in .env"
  echo ""
  yellow "Open .env and set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, then re-run:"
  echo "  nano $INSTALL_DIR/.env"
  echo "  sudo bash $SCRIPT_DIR/deploy-vps.sh --start"
  exit 0
fi

# shellcheck disable=SC1091
source "$INSTALL_DIR/.env"

if [[ "${1:-}" != "--start" ]] && [[ "${1:-}" != "--nginx" ]]; then
  step "Starting containers"
fi

missing=0
for var in POSTGRES_PASSWORD SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY N8N_HOST WEBHOOK_URL; do
  val="${!var:-}"
  if [[ -z "$val" ]] || [[ "$val" == *"YOUR_"* ]] || [[ "$val" == *"choose_"* ]] || [[ "$val" == *"your_"* ]]; then
    red "Set $var in $INSTALL_DIR/.env"
    missing=1
  fi
done
[[ "$missing" -eq 1 ]] && exit 1

step "Pulling images and starting stack"
cd "$INSTALL_DIR"
docker compose pull
docker compose up -d

step "Waiting for health..."
sleep 5
docker compose ps

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5678 || true)"
if [[ "$HTTP_CODE" =~ ^(200|401|302)$ ]]; then
  green "n8n responds locally (HTTP $HTTP_CODE)"
else
  yellow "n8n local check returned HTTP $HTTP_CODE — check: docker compose logs n8n"
fi

if [[ "${1:-}" == "--nginx" ]] || [[ "${2:-}" == "--nginx" ]]; then
  require_cmd nginx
  DOMAIN="${N8N_HOST:-$DOMAIN}"
  step "Writing nginx site for $DOMAIN"
  cat > /etc/nginx/sites-available/n8n << EOF
server {
    listen 80;
    server_name $DOMAIN;

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
  ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  green "Nginx configured. Run SSL:"
  echo "  certbot --nginx -d $DOMAIN"
fi

echo ""
green "Done."
echo "  Editor:  https://${N8N_HOST}/"
echo "  Webhook: https://${N8N_HOST}/webhook/mken-whatsapp?tenant=SLUG"
echo "  Logs:    cd $INSTALL_DIR && docker compose logs -f n8n"
echo ""
yellow "Next: import examples/n8n/mken-whatsapp-saas.workflow.json and activate it."
