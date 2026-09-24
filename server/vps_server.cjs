const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow large payloads (for 710+ products with base64 images)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Data directory
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PRODUCTOS_FILE = path.join(DATA_DIR, 'productos.json');
const VENTAS_FILE = path.join(DATA_DIR, 'ventas.json');
const FIADOS_FILE = path.join(DATA_DIR, 'fiados.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const CODES_FILE = path.join(DATA_DIR, 'codigos.json');

// Helper to read JSON safely
function readJSON(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || '[]');
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return defaultValue;
  }
}

// Helper to write JSON safely
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
    return false;
  }
}

// 1. Health / Status
app.get('/api/health', (req, res) => {
  const productos = readJSON(PRODUCTOS_FILE, []);
  res.json({
    status: 'online',
    server: 'Bibi Store VPS REST API',
    totalProductos: productos.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/vps/status', (req, res) => {
  const productos = readJSON(PRODUCTOS_FILE, []);
  res.json({
    status: 'online',
    mode: 'autonomous_vps',
    totalProductos: productos.length,
    timestamp: new Date().toISOString()
  });
});

// 2. Products CRUD (Endpoints oficiales)
// GET /api/products -> Obtener inventario de productos
app.get('/api/products', (req, res) => {
  const productos = readJSON(PRODUCTOS_FILE, []);
  res.json(productos);
});
app.get('/api/vps/productos', (req, res) => {
  const productos = readJSON(PRODUCTOS_FILE, []);
  res.json(productos);
});

// POST /api/products -> Crear nuevo producto
app.post('/api/products', (req, res) => {
  try {
    const nuevo = req.body;
    if (!nuevo.nombre) {
      return res.status(400).json({ error: 'Nombre es requerido' });
    }

    const productos = readJSON(PRODUCTOS_FILE, []);
    const id = nuevo.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const item = { ...nuevo, id };

    const idx = productos.findIndex(p => p.id === id);
    if (idx >= 0) {
      productos[idx] = item;
    } else {
      productos.unshift(item);
    }

    writeJSON(PRODUCTOS_FILE, productos);
    res.status(201).json({ success: true, producto: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/vps/productos', (req, res) => {
  try {
    const nuevo = req.body;
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

// PUT /api/products/:id -> Actualizar producto existente
app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const productos = readJSON(PRODUCTOS_FILE, []);

    const idx = productos.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    productos[idx] = { ...productos[idx], ...updateData, id };
    writeJSON(PRODUCTOS_FILE, productos);
    res.json({ success: true, producto: productos[idx] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id -> Eliminar producto
app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    let productos = readJSON(PRODUCTOS_FILE, []);
    const prevLen = productos.length;
    productos = productos.filter(p => p.id !== id);
    writeJSON(PRODUCTOS_FILE, productos);
    res.json({ success: true, deleted: prevLen - productos.length });
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

// Helper to normalize product structure from backups / external imports
function normalizeProduct(p, idx) {
  if (!p || typeof p !== 'object') return null;
  const nombre = p.nombre || p.name || p.title || p.descripcion || `Producto ${idx + 1}`;
  const precio_usd = Number(p.precio_usd !== undefined ? p.precio_usd : (p.precio !== undefined ? p.precio : (p.price !== undefined ? p.price : 0))) || 0;
  const costo_usd = Number(p.costo_usd !== undefined ? p.costo_usd : (p.costo !== undefined ? p.costo : (p.cost !== undefined ? p.cost : 0))) || 0;
  const stock = Number(p.stock !== undefined ? p.stock : (p.existencia !== undefined ? p.existencia : (p.cantidad !== undefined ? p.cantidad : 0))) || 0;
  const unidad_medida = (p.unidad_medida === 'kg' || p.unidad === 'kg' || p.medida === 'kg') ? 'kg' : 'unid';
  const categoria = p.categoria || p.category || p.departamento || 'Sin Categoría';
  const codigo_barras = String(p.codigo_barras || p.codigo || p.barcode || p.ref || `N/A_${idx}`);
  const imagen_url = String(p.imagen_url || p.imagen || p.image || p.photo || '');
  const id = String(p.id || p._id || `prod_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`);

  return {
    id,
    nombre,
    precio_usd,
    costo_usd,
    stock,
    unidad_medida,
    categoria,
    codigo_barras,
    imagen_url
  };
}

// POST /api/products/bulk -> Poblar masivamente el catálogo desde respaldo JSON (con soporte de chunks/append)
app.post('/api/products/bulk', (req, res) => {
  try {
    let prods = [];
    let append = false;
    const body = req.body;

    if (Array.isArray(body)) {
      prods = body;
    } else if (body && Array.isArray(body.products)) {
      prods = body.products;
      append = !!body.append;
    } else if (body && Array.isArray(body.productos)) {
      prods = body.productos;
      append = !!body.append;
    } else if (body && Array.isArray(body.data)) {
      prods = body.data;
      append = !!body.append;
    } else if (body && Array.isArray(body.items)) {
      prods = body.items;
      append = !!body.append;
    } else if (body && typeof body === 'object') {
      const possibleKey = Object.keys(body).find(k => Array.isArray(body[k]));
      if (possibleKey) {
        prods = body[possibleKey];
        append = !!body.append;
      } else {
        prods = [body];
      }
    } else {
      return res.status(400).json({ error: 'Se esperaba un array o formato válido de productos' });
    }

    const sanitized = prods
      .map((p, idx) => normalizeProduct(p, idx))
      .filter(Boolean);

    if (sanitized.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene productos válidos' });
    }

    let existing = [];
    if (append && fs.existsSync(PRODUCTOS_FILE)) {
      existing = readJSON(PRODUCTOS_FILE, []);
    }

    const productMap = new Map();
    if (append) {
      existing.forEach(p => productMap.set(p.id, p));
      sanitized.forEach(p => productMap.set(p.id, { ...(productMap.get(p.id) || {}), ...p }));
    } else {
      sanitized.forEach(p => productMap.set(p.id, p));
    }

    const finalProducts = Array.from(productMap.values());
    writeJSON(PRODUCTOS_FILE, finalProducts);

    // Save automatic backup with timestamp
    const backupName = path.join(DATA_DIR, `backup_bulk_${Date.now()}.json`);
    writeJSON(backupName, { count: finalProducts.length, date: new Date().toISOString() });

    console.log(`[BULK UPLOAD CHUNK] ${sanitized.length} productos procesados (Append: ${append}). Total en servidor: ${finalProducts.length}.`);
    res.json({
      success: true,
      totalProductos: finalProducts.length,
      message: `${finalProducts.length} productos sincronizados en el servidor`
    });
  } catch (err) {
    console.error('Error in bulk upload:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales -> Registrar nueva venta en caja
app.post('/api/sales', (req, res) => {
  try {
    const venta = req.body;
    const ventas = readJSON(VENTAS_FILE, []);
    const id = venta.id || `venta_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nuevaVenta = { ...venta, id, fecha: venta.fecha || Date.now() };

    ventas.unshift(nuevaVenta);
    writeJSON(VENTAS_FILE, ventas);

    // Decrement stock in productos.json
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

    res.status(201).json({ success: true, venta: nuevaVenta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales -> Consultar historial de ventas
app.get('/api/sales', (req, res) => {
  const ventas = readJSON(VENTAS_FILE, []);
  res.json(ventas);
});

// Backwards compatibility for /api/vps/ventas
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

// 3. Fiados Endpoints
app.get('/api/fiados', (req, res) => {
  res.json(readJSON(FIADOS_FILE, []));
});
app.get('/api/vps/fiados', (req, res) => {
  res.json(readJSON(FIADOS_FILE, []));
});
app.post('/api/fiados', (req, res) => {
  try {
    const fiado = req.body;
    const fiados = readJSON(FIADOS_FILE, []);
    const id = fiado.id || `fiado_${Date.now()}`;
    const idx = fiados.findIndex(f => f.id === id);

    if (idx >= 0) {
      fiados[idx] = { ...fiados[idx], ...fiado };
    } else {
      fiados.unshift({ ...fiado, id, fecha: fiado.fecha || Date.now() });
    }

    writeJSON(FIADOS_FILE, fiados);
    res.json({ success: true, fiado: fiados.find(f => f.id === id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/vps/fiados', (req, res) => {
  const fiado = req.body;
  const fiados = readJSON(FIADOS_FILE, []);
  const id = fiado.id || `fiado_${Date.now()}`;
  const idx = fiados.findIndex(f => f.id === id);
  if (idx >= 0) fiados[idx] = { ...fiados[idx], ...fiado };
  else fiados.unshift({ ...fiado, id, fecha: fiado.fecha || Date.now() });
  writeJSON(FIADOS_FILE, fiados);
  res.json({ success: true, id });
});

// 4. Config & Security Endpoints
app.get('/api/config', (req, res) => {
  const config = readJSON(CONFIG_FILE, { tasa_dolar: 865 });
  res.json(config);
});
app.get('/api/vps/config', (req, res) => {
  const config = readJSON(CONFIG_FILE, { tasa_dolar: 865 });
  res.json(config);
});
app.post('/api/config', (req, res) => {
  try {
    const config = req.body;
    writeJSON(CONFIG_FILE, config);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/vps/config', (req, res) => {
  const config = req.body;
  writeJSON(CONFIG_FILE, config);
  res.json({ success: true, config });
});

app.get('/api/security', (req, res) => {
  const sec = readJSON(SECURITY_FILE, {
    pinSuperadmin: '7799',
    pinAdmin: '2026',
    pinCajero: '1234'
  });
  res.json(sec);
});
app.post('/api/security', (req, res) => {
  try {
    const sec = req.body;
    writeJSON(SECURITY_FILE, sec);
    res.json({ success: true, security: sec });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Access codes / tokens
app.get('/api/access-codes', (req, res) => {
  res.json(readJSON(CODES_FILE, []));
});
app.post('/api/access-codes', (req, res) => {
  try {
    const item = req.body;
    const list = readJSON(CODES_FILE, []);
    const idx = list.findIndex(c => c.id === item.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...item };
    else list.unshift(item);
    writeJSON(CODES_FILE, list);
    res.json({ success: true, code: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/access-codes/:id', (req, res) => {
  try {
    let list = readJSON(CODES_FILE, []);
    list = list.filter(c => c.id !== req.params.id);
    writeJSON(CODES_FILE, list);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full migration endpoint (legacy/complete 1-clic)
app.post('/api/vps/migracion-completa', (req, res) => {
  try {
    const { productos, config, fiados, ventas } = req.body;
    if (productos && Array.isArray(productos)) writeJSON(PRODUCTOS_FILE, productos);
    if (config) writeJSON(CONFIG_FILE, config);
    if (fiados && Array.isArray(fiados)) writeJSON(FIADOS_FILE, fiados);
    if (ventas && Array.isArray(ventas)) writeJSON(VENTAS_FILE, ventas);
    res.json({
      success: true,
      mensaje: 'Migración completada exitosamente en la VPS',
      totalProductos: (productos || []).length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BIBI STORE VPS REST API] Corriendo en http://0.0.0.0:${PORT}`);
});
