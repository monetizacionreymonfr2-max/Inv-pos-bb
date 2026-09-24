#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}==============================================================${NC}"
echo -e "${GREEN}    ACTUALIZANDO BIBI STORE A LA ÚLTIMA VERSIÓN EN TU VPS    ${NC}"
echo -e "${BLUE}==============================================================${NC}"

APP_DIR="/var/www/bibi-store"
REPO_URL="https://github.com/monetizacionreymonfr2-max/Bibi-Store.git"

mkdir -p "$APP_DIR"
cd "$APP_DIR"

echo -e "${YELLOW}[1/3] Obteniendo la última versión desde GitHub...${NC}"
if [ -d ".git" ]; then
    git fetch --all
    git reset --hard origin/main || git pull origin main
else
    rm -rf /tmp/bibi-repo-temp
    git clone "$REPO_URL" /tmp/bibi-repo-temp
    cp -r /tmp/bibi-repo-temp/. "$APP_DIR/"
    rm -rf /tmp/bibi-repo-temp
fi

echo -e "${YELLOW}[2/4] Verificando dependencias y configurando Backend Autónomo...${NC}"
export NODE_OPTIONS="--max-old-space-size=768"
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/server"

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "Instalando dependencias necesarias..."
    npm install --no-audit --no-fund
fi

if [ ! -d "node_modules/express" ]; then
    npm install --omit=dev express cors || true
fi

# Configurar servicio systemd para el backend de la VPS
cat << 'EOF' > /etc/systemd/system/bibi-backend.service
[Unit]
Description=Bibi Store VPS Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/bibi-store
ExecStart=/usr/bin/node /var/www/bibi-store/server/vps_server.cjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now bibi-backend
systemctl restart bibi-backend

# Configurar Nginx con soporte para la API del backend y subida de archivos grandes (fotos/JSON)
cat << 'EOF' > /etc/nginx/sites-available/bibi-store
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name 64.227.15.171 _;

    root /var/www/bibi-store/dist;
    index index.html;

    client_max_body_size 100M;

    # Compresión Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript image/svg+xml;

    # Rutas API hacia el backend local en puerto 5000
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    # SPA Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/bibi-store /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default || true
nginx -t || true

echo -e "${YELLOW}[3/4] Compilando la aplicación (Vite + React)...${NC}"
npm run build

echo -e "${YELLOW}[4/4] Recargando Nginx y verificando servicios...${NC}"
systemctl reload nginx || systemctl restart nginx || true

echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}  ✓ ¡BIBI STORE ACTUALIZADO EXITOSAMENTE EN TU VPS!          ${NC}"
echo -e "${GREEN}  ✓ Backend Autónomo: $(systemctl is-active bibi-backend)    ${NC}"
echo -e "${GREEN}  Abre en tu navegador: http://64.227.15.171                 ${NC}"
echo -e "${GREEN}==============================================================${NC}"
