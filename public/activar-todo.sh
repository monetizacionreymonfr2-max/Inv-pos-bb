#!/usr/bin/env bash
# ==============================================================================
# SCRIPT UNIFICADO EN 1 SOLO COMANDO PARA BIBI STORE AUTÓNOMO EN VPS
# IP: 64.227.15.171
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}==============================================================${NC}"
echo -e "${GREEN}      ACTIVANDO BIBI STORE AUTÓNOMO Y ACTUALIZADO EN VPS     ${NC}"
echo -e "${BLUE}==============================================================${NC}"

BASE_URL="https://raw.githubusercontent.com/monetizacionreymonfr2-max/Bibi-Store/main/public"
FALLBACK_URL="https://ais-pre-gblqqchksfkcg6b6rsqrxx-48346512190.us-east1.run.app"

# 1. Crear directorios
echo -e "${YELLOW}[1/5] Preparando directorios...${NC}"
mkdir -p /var/www/bibi-store/dist
mkdir -p /var/www/bibi-store/server
mkdir -p /var/www/bibi-store/data

# 2. Descargar última versión de la aplicación (con botón de migración directa)
echo -e "${YELLOW}[2/5] Actualizando interfaz de Bibi Store...${NC}"
if curl -fsSL "${BASE_URL}/bibi-store-dist.tar.gz" -o /tmp/bibi-store-dist.tar.gz; then
  tar -xzf /tmp/bibi-store-dist.tar.gz -C /var/www/bibi-store/dist
  rm -f /tmp/bibi-store-dist.tar.gz
  echo "✓ Interfaz actualizada correctamente."
elif curl -fsSL "${FALLBACK_URL}/bibi-store-dist.tar.gz" -o /tmp/bibi-store-dist.tar.gz; then
  tar -xzf /tmp/bibi-store-dist.tar.gz -C /var/www/bibi-store/dist
  rm -f /tmp/bibi-store-dist.tar.gz
  echo "✓ Interfaz actualizada desde servidor secundario."
else
  echo "No se pudo descargar el tarball, se mantendrá la versión existente."
fi

# 3. Asegurar Express en la VPS
echo -e "${YELLOW}[3/5] Verificando dependencias del servidor...${NC}"
cd /var/www/bibi-store
if [ ! -d "node_modules/express" ]; then
  npm install --omit=dev express || true
fi

# 4. Crear servidor autónomo vps_server.cjs
echo -e "${YELLOW}[4/5] Configurando motor backend local...${NC}"
cat << 'EOF' > /var/www/bibi-store/server/vps_server.cjs
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTOS_FILE = path.join(DATA_DIR, 'productos.json');
const VENTAS_FILE = path.join(DATA_DIR, 'ventas.json');
const FIADOS_FILE = path.join(DATA_DIR, 'fiados.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function readJSON(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || '[]');
  } catch (e) {
    return defaultValue;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

app.get('/api/vps/status', (req, res) => {
  const productos = readJSON(PRODUCTOS_FILE, []);
  res.json({
    status: 'online',
    mode: 'autonomous_vps',
    totalProductos: productos.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/vps/migracion-completa', (req, res) => {
  try {
    const { productos, config, fiados, ventas } = req.body;
    if (!productos || !Array.isArray(productos)) {
      return res.status(400).json({ error: 'Se esperaba un array de productos.' });
    }
    writeJSON(PRODUCTOS_FILE, productos);
    if (config) writeJSON(CONFIG_FILE, config);
    if (fiados && Array.isArray(fiados)) writeJSON(FIADOS_FILE, fiados);
    if (ventas && Array.isArray(ventas)) writeJSON(VENTAS_FILE, ventas);

    const backupName = path.join(DATA_DIR, `backup_${Date.now()}.json`);
    writeJSON(backupName, { productos, config, fiados, ventas, fecha: new Date().toISOString() });

    console.log(`[MIGRACIÓN EXITOSA] ${productos.length} productos guardados en VPS.`);
    return res.json({
      success: true,
      mensaje: 'Migración completada exitosamente en la VPS.',
      totalProductos: productos.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/productos', (req, res) => {
  res.json(readJSON(PRODUCTOS_FILE, []));
});

app.post('/api/vps/productos', (req, res) => {
  try {
    const nuevo = req.body;
    if (!nuevo.nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    const productos = readJSON(PRODUCTOS_FILE, []);
    const id = nuevo.id || `prod_${Date.now()}`;
    const item = { ...nuevo, id };
    const idx = productos.findIndex(p => p.id === id);
    if (idx >= 0) productos[idx] = item;
    else productos.unshift(item);
    writeJSON(PRODUCTOS_FILE, productos);
    res.json({ success: true, producto: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vps/productos/:id', (req, res) => {
  try {
    const { id } = req.params;
    let productos = readJSON(PRODUCTOS_FILE, []);
    productos = productos.filter(p => p.id !== id);
    writeJSON(PRODUCTOS_FILE, productos);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/ventas', (req, res) => {
  res.json(readJSON(VENTAS_FILE, []));
});

app.post('/api/vps/ventas', (req, res) => {
  try {
    const venta = req.body;
    const ventas = readJSON(VENTAS_FILE, []);
    const id = venta.id || `venta_${Date.now()}`;
    const nuevaVenta = { ...venta, id, fecha: venta.fecha || Date.now() };
    ventas.unshift(nuevaVenta);
    writeJSON(VENTAS_FILE, ventas);

    if (venta.items && Array.isArray(venta.items)) {
      const productos = readJSON(PRODUCTOS_FILE, []);
      venta.items.forEach(item => {
        const prod = productos.find(p => p.id === item.productoId);
        if (prod && typeof prod.stock === 'number') {
          prod.stock = Math.max(0, prod.stock - (Number(item.cantidad) || 0));
        }
      });
      writeJSON(PRODUCTOS_FILE, productos);
    }

    res.json({ success: true, venta: nuevaVenta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/fiados', (req, res) => {
  res.json(readJSON(FIADOS_FILE, []));
});

app.post('/api/vps/fiados', (req, res) => {
  try {
    const fiado = req.body;
    const fiados = readJSON(FIADOS_FILE, []);
    const id = fiado.id || `fiado_${Date.now()}`;
    const idx = fiados.findIndex(f => f.id === id);
    if (idx >= 0) fiados[idx] = { ...fiados[idx], ...fiado };
    else fiados.unshift({ ...fiado, id, fecha: fiado.fecha || Date.now() });
    writeJSON(FIADOS_FILE, fiados);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/config', (req, res) => {
  res.json(readJSON(CONFIG_FILE, { tasa_dolar: 50 }));
});

app.post('/api/vps/config', (req, res) => {
  try {
    writeJSON(CONFIG_FILE, req.body);
    res.json({ success: true, config: req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BIBI STORE VPS BACKEND] Corriendo en http://0.0.0.0:${PORT}`);
});
EOF

NODE_PATH=$(which node 2>/dev/null || echo "/usr/bin/node")

# Crear servicio systemd
cat << EOF > /etc/systemd/system/bibi-backend.service
[Unit]
Description=Bibi Store VPS Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/bibi-store
ExecStart=${NODE_PATH} /var/www/bibi-store/server/vps_server.cjs
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

# 5. Configurar Nginx con el proxy /api/ y soporte hasta 100MB de datos
echo -e "${YELLOW}[5/5] Configurando servidor web Nginx...${NC}"
cat << 'EOF' > /etc/nginx/sites-available/bibi-store
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name 64.227.15.171 _;

    root /var/www/bibi-store/dist;
    index index.html;

    client_max_body_size 100M;

    # Proxy hacia el Backend Autónomo de la VPS
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    # Soporte SPA: Redirigir cualquier ruta a index.html para React Router
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/*
ln -sf /etc/nginx/sites-available/bibi-store /etc/nginx/sites-enabled/bibi-store
nginx -t && systemctl restart nginx

# Permisos
chown -R www-data:www-data /var/www/bibi-store/dist
chmod -R 755 /var/www/bibi-store/dist

echo -e ""
echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}   ¡LISTO! TODO HA SIDO CONFIGURADO Y ACTIVADO EN TU VPS     ${NC}"
echo -e "${GREEN}==============================================================${NC}"
echo -e "✓ Servicio Backend: $(systemctl is-active bibi-backend)"
echo -e "✓ Servicio Web Nginx: $(systemctl is-active nginx)"
echo -e ""
echo -e "Ahora entra en tu navegador a:"
echo -e "👉 ${BLUE}http://64.227.15.171/ajustes${NC}"
echo -e "Y presiona el botón: ${YELLOW}'🚀 Migrar los 710 Productos a la VPS (1-Clic)'${NC}"
echo -e "${GREEN}==============================================================${NC}"
