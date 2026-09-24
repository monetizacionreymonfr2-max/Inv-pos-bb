const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow large payloads (for products with base64 images)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Ensure uploads directory exists for image decoupling pipeline
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'productos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Pipeline for Base64 image decoupling
function processBase64Image(item, productId) {
  let imgUrl = item.imagen_url || item.image || item.imagen || '';
  if (imgUrl.startsWith('data:image/')) {
    try {
      const matches = imgUrl.match(/^data:image\/([a-zA-Z0-9+-]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1].toLowerCase() === 'jpeg' ? 'jpg' : matches[1].toLowerCase();
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${productId}.${ext}`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, buffer);
        imgUrl = `/uploads/productos/${filename}`;
      }
    } catch (err) {
      console.error(`Error decoupling base64 image for product ${productId}:`, err);
    }
  }
  return imgUrl;
}

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

let db;
const possiblePaths = [
  path.join(__dirname, 'bibi_store_productos_completos.json'),
  path.join('/root/Inv-pos-bb', 'bibi_store_productos_completos.json'),
  path.join('/root', 'bibi_store_productos_completos.json')
];
const PRODUCTS_JSON_FILE = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];

// Helper to normalize product format
function normalizeProductForClient(p) {
  return {
    id: String(p.id || p._id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
    nombre: String(p.nombre || p.name || 'Sin Nombre'),
    codigo_barras: String(p.codigo_barras || p.barcode || ''),
    precio_usd: Number(p.precio_usd !== undefined ? p.precio_usd : (p.price !== undefined ? p.price : 0)) || 0,
    costo_usd: Number(p.costo_usd !== undefined ? p.costo_usd : (p.cost !== undefined ? p.cost : 0)) || 0,
    stock: Number(p.stock !== undefined ? p.stock : 0) || 0,
    categoria: String(p.categoria || p.category || 'Sin Categoría'),
    unidad_medida: String(p.unidad_medida || 'unid'),
    imagen_url: String(p.imagen_url || p.image || '')
  };
}

// Get stored products prioritizing bibi_store_productos_completos.json on VPS
async function getStoredProducts() {
  try {
    if (fs.existsSync(PRODUCTS_JSON_FILE)) {
      const content = fs.readFileSync(PRODUCTS_JSON_FILE, 'utf8');
      const parsed = JSON.parse(content);
      let prods = [];
      if (Array.isArray(parsed)) {
        prods = parsed;
      } else if (parsed && Array.isArray(parsed.productos)) {
        prods = parsed.productos;
      } else if (parsed && Array.isArray(parsed.products)) {
        prods = parsed.products;
      }
      if (prods.length > 0) {
        return prods.map(p => normalizeProductForClient(p)).sort((a, b) => a.nombre.localeCompare(b.nombre));
      }
    }
  } catch (e) {
    console.error('CRITICAL Error reading/parsing bibi_store_productos_completos.json:', e.message, e.stack);
  }

  // Fallback to SQLite
  try {
    if (db) {
      const rows = await db.all('SELECT * FROM products ORDER BY name ASC');
      return rows.map(r => ({
        id: r.id,
        nombre: r.name || '',
        codigo_barras: r.barcode || '',
        precio_usd: Number(r.price) || 0,
        costo_usd: Number(r.cost) || 0,
        stock: Number(r.stock) || 0,
        categoria: r.category || 'Sin Categoría',
        unidad_medida: r.unidad_medida || 'unid',
        imagen_url: r.imagen_url || ''
      }));
    }
  } catch (e) {
    console.error('Error reading from SQLite:', e);
  }

  return [];
}

async function saveStoredProducts(products) {
  try {
    const normalized = products.map(p => normalizeProductForClient(p));
    fs.writeFileSync(PRODUCTS_JSON_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing bibi_store_productos_completos.json:', e);
  }
}

async function initDb() {
  try {
    db = await open({
      filename: path.join(__dirname, 'database.sqlite'),
      driver: sqlite3.Database
    });

    await db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS categorias (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        barcode TEXT,
        price REAL NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        stock REAL NOT NULL DEFAULT 0,
        category TEXT,
        unidad_medida TEXT DEFAULT 'unid',
        imagen_url TEXT
      );

      CREATE TABLE IF NOT EXISTS costos_productos (
        id TEXT PRIMARY KEY,
        producto_id TEXT NOT NULL,
        costo_usd REAL NOT NULL DEFAULT 0,
        fecha_actualizacion INTEGER
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        data TEXT,
        fecha INTEGER
      );
      CREATE TABLE IF NOT EXISTS fiados (
        id TEXT PRIMARY KEY,
        data TEXT,
        fecha INTEGER
      );
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS security (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS access_codes (
        id TEXT PRIMARY KEY,
        data TEXT
      );
    `);

    try { await db.exec(`ALTER TABLE products ADD COLUMN unidad_medida TEXT;`); } catch {}
    try { await db.exec(`ALTER TABLE products ADD COLUMN imagen_url TEXT;`); } catch {}
    try { await db.exec(`ALTER TABLE products ADD COLUMN cost REAL;`); } catch {}

    // Sync SQLite with bibi_store_productos_completos.json if json exists
    const currentProds = await getStoredProducts();
    if (currentProds.length > 0) {
      await db.run('BEGIN TRANSACTION');
      for (const p of currentProds) {
        await db.run(
          `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
           ON CONFLICT(id) DO UPDATE SET 
             name=excluded.name, 
             barcode=excluded.barcode, 
             price=excluded.price, 
             cost=excluded.cost, 
             stock=excluded.stock, 
             category=excluded.category,
             unidad_medida=excluded.unidad_medida,
             imagen_url=excluded.imagen_url`,
          [p.id, p.nombre, p.codigo_barras, p.precio_usd, p.costo_usd, p.stock, p.categoria, p.unidad_medida, p.imagen_url]
        );
      }
      await db.run('COMMIT');
      console.log(`[SQLite] Sincronizados ${currentProds.length} productos desde bibi_store_productos_completos.json`);
    }

    console.log('[SQLite] Base de datos conectada en:', path.join(__dirname, 'database.sqlite'));
  } catch (err) {
    console.error('[SQLite] Error inicializando base de datos:', err);
  }
}

initDb();

// 1. Health / Status
app.get('/api/health', async (req, res) => {
  try {
    const products = await getStoredProducts();
    res.json({
      status: 'online',
      server: 'Bibi Store VPS SQLite + JSON REST API',
      totalProductos: products.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/status', async (req, res) => {
  try {
    const products = await getStoredProducts();
    res.json({
      status: 'online',
      mode: 'autonomous_vps_sqlite_json',
      totalProductos: products.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Products CRUD (GET /api/products, GET /api/productos, etc.)
app.get('/api/products', async (req, res) => {
  try {
    const products = await getStoredProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/productos', async (req, res) => {
  try {
    const products = await getStoredProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/productos', async (req, res) => {
  try {
    const products = await getStoredProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const p = req.body;
    const name = String(p.name !== undefined && p.name !== null && p.name !== '' ? p.name : (p.nombre !== undefined && p.nombre !== null && p.nombre !== '' ? p.nombre : '')) || '';
    if (!name) {
      return res.status(400).json({ error: 'Nombre es requerido' });
    }

    const normalized = normalizeProductForClient(p);

    await db.run(
      `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
       ON CONFLICT(id) DO UPDATE SET 
         name=excluded.name, 
         barcode=excluded.barcode, 
         price=excluded.price, 
         cost=excluded.cost, 
         stock=excluded.stock, 
         category=excluded.category,
         unidad_medida=excluded.unidad_medida,
         imagen_url=excluded.imagen_url`,
      [normalized.id, normalized.nombre, normalized.codigo_barras, normalized.precio_usd, normalized.costo_usd, normalized.stock, normalized.categoria, normalized.unidad_medida, normalized.imagen_url]
    );

    const allProducts = await getStoredProducts();
    const existingIdx = allProducts.findIndex(item => item.id === normalized.id);
    if (existingIdx >= 0) {
      allProducts[existingIdx] = normalized;
    } else {
      allProducts.unshift(normalized);
    }
    await saveStoredProducts(allProducts);

    res.status(201).json({ success: true, producto: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const p = req.body;
    const normalized = normalizeProductForClient(p);

    await db.run(
      `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
       ON CONFLICT(id) DO UPDATE SET 
         name=excluded.name, 
         barcode=excluded.barcode, 
         price=excluded.price, 
         cost=excluded.cost, 
         stock=excluded.stock, 
         category=excluded.category,
         unidad_medida=excluded.unidad_medida,
         imagen_url=excluded.imagen_url`,
      [normalized.id, normalized.nombre, normalized.codigo_barras, normalized.precio_usd, normalized.costo_usd, normalized.stock, normalized.categoria, normalized.unidad_medida, normalized.imagen_url]
    );

    const allProducts = await getStoredProducts();
    await saveStoredProducts(allProducts);

    res.json({ success: true, producto: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vps/productos', async (req, res) => {
  try {
    const p = req.body;
    const normalized = normalizeProductForClient(p);

    await db.run(
      `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
       ON CONFLICT(id) DO UPDATE SET 
         name=excluded.name, 
         barcode=excluded.barcode, 
         price=excluded.price, 
         cost=excluded.cost, 
         stock=excluded.stock, 
         category=excluded.category,
         unidad_medida=excluded.unidad_medida,
         imagen_url=excluded.imagen_url`,
      [normalized.id, normalized.nombre, normalized.codigo_barras, normalized.precio_usd, normalized.costo_usd, normalized.stock, normalized.categoria, normalized.unidad_medida, normalized.imagen_url]
    );

    const allProducts = await getStoredProducts();
    await saveStoredProducts(allProducts);

    res.json({ success: true, producto: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body;

    const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const normalized = normalizeProductForClient({ ...existing, ...p, id });

    await db.run(
      `UPDATE products SET name = ?, barcode = ?, price = ?, cost = ?, stock = ?, category = ?, unidad_medida = ?, imagen_url = ? WHERE id = ?`,
      [normalized.nombre, normalized.codigo_barras, normalized.precio_usd, normalized.costo_usd, normalized.stock, normalized.categoria, normalized.unidad_medida, normalized.imagen_url, id]
    );

    const allProducts = await getStoredProducts();
    await saveStoredProducts(allProducts);

    res.json({ success: true, producto: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    const allProducts = (await getStoredProducts()).filter(p => p.id !== id);
    await saveStoredProducts(allProducts);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vps/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    const allProducts = (await getStoredProducts()).filter(p => p.id !== id);
    await saveStoredProducts(allProducts);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/bulk -> Bulk synchronization with BEGIN TRANSACTION, COMMIT, ROLLBACK, ON CONFLICT, and bibi_store_productos_completos.json persistence
app.post('/api/products/bulk', async (req, res) => {
  try {
    let prods = [];
    const body = req.body;

    if (Array.isArray(body)) {
      prods = body;
    } else if (body && Array.isArray(body.products)) {
      prods = body.products;
    } else if (body && Array.isArray(body.productos)) {
      prods = body.productos;
    } else if (body && Array.isArray(body.data)) {
      prods = body.data;
    } else if (body && Array.isArray(body.items)) {
      prods = body.items;
    } else if (body && typeof body === 'object') {
      const possibleKey = Object.keys(body).find(k => Array.isArray(body[k]));
      if (possibleKey) {
        prods = body[possibleKey];
      } else {
        prods = [body];
      }
    } else {
      return res.status(400).json({ error: 'Se esperaba un array o formato válido de productos' });
    }

    const sanitized = prods.map((p, idx) => normalizeProductForClient(p, idx));

    await db.run('BEGIN TRANSACTION');

    try {
      for (const p of sanitized) {
        await db.run(
          `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
           ON CONFLICT(id) DO UPDATE SET 
             name=excluded.name, 
             barcode=excluded.barcode, 
             price=excluded.price, 
             cost=excluded.cost, 
             stock=excluded.stock, 
             category=excluded.category,
             unidad_medida=excluded.unidad_medida,
             imagen_url=excluded.imagen_url`,
          [p.id, p.nombre, p.codigo_barras, p.precio_usd, p.costo_usd, p.stock, p.categoria, p.unidad_medida, p.imagen_url]
        );
      }

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    // Persist to bibi_store_productos_completos.json
    const finalProducts = await getStoredProducts();
    await saveStoredProducts(finalProducts);

    console.log(`[BULK UPLOAD] ${sanitized.length} productos sincronizados. Total en JSON/DB: ${finalProducts.length}`);
    res.json({
      success: true,
      totalProductos: finalProducts.length,
      message: `${finalProducts.length} productos sincronizados en el servidor y guardados en bibi_store_productos_completos.json`
    });
  } catch (err) {
    console.error('Error in bulk upload:', err);
    res.status(500).json({ error: err.message });
  }
});

// Sales Endpoints
app.post('/api/sales', async (req, res) => {
  try {
    const venta = req.body;
    const id = venta.id || `venta_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fecha = venta.fecha || Date.now();

    await db.run(
      `INSERT INTO sales (id, data, fecha) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fecha=excluded.fecha`,
      [id, JSON.stringify(venta), fecha]
    );

    if (venta.items && Array.isArray(venta.items)) {
      for (const item of venta.items) {
        if (item.productoId && typeof item.cantidad === 'number') {
          await db.run(
            `UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?`,
            [item.cantidad, item.productoId]
          );
        }
      }
    }

    res.status(201).json({ success: true, venta: { ...venta, id, fecha } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales', async (req, res) => {
  try {
    const rows = await db.all('SELECT data FROM sales ORDER BY fecha DESC');
    const sales = rows.map(r => JSON.parse(r.data));
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/ventas', async (req, res) => {
  try {
    const rows = await db.all('SELECT data FROM sales ORDER BY fecha DESC');
    const sales = rows.map(r => JSON.parse(r.data));
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vps/ventas', async (req, res) => {
  try {
    const venta = req.body;
    const id = venta.id || `venta_${Date.now()}`;
    const fecha = venta.fecha || Date.now();

    await db.run(
      `INSERT INTO sales (id, data, fecha) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fecha=excluded.fecha`,
      [id, JSON.stringify(venta), fecha]
    );

    if (venta.items && Array.isArray(venta.items)) {
      for (const item of venta.items) {
        if (item.productoId && typeof item.cantidad === 'number') {
          await db.run(
            `UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?`,
            [item.cantidad, item.productoId]
          );
        }
      }
    }

    res.json({ success: true, venta: { ...venta, id, fecha } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fiados Endpoints
app.get('/api/fiados', async (req, res) => {
  try {
    const rows = await db.all('SELECT data FROM fiados ORDER BY fecha DESC');
    const fiados = rows.map(r => JSON.parse(r.data));
    res.json(fiados);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/fiados', async (req, res) => {
  try {
    const rows = await db.all('SELECT data FROM fiados ORDER BY fecha DESC');
    const fiados = rows.map(r => JSON.parse(r.data));
    res.json(fiados);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiados', async (req, res) => {
  try {
    const fiado = req.body;
    const id = fiado.id || `fiado_${Date.now()}`;
    const fecha = fiado.fecha || Date.now();
    const item = { ...fiado, id, fecha };

    await db.run(
      `INSERT INTO fiados (id, data, fecha) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fecha=excluded.fecha`,
      [id, JSON.stringify(item), fecha]
    );

    res.json({ success: true, fiado: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vps/fiados', async (req, res) => {
  try {
    const fiado = req.body;
    const id = fiado.id || `fiado_${Date.now()}`;
    const fecha = fiado.fecha || Date.now();
    const item = { ...fiado, id, fecha };

    await db.run(
      `INSERT INTO fiados (id, data, fecha) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fecha=excluded.fecha`,
      [id, JSON.stringify(item), fecha]
    );

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Config Endpoints
app.get('/api/config', async (req, res) => {
  try {
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['app_config']);
    const config = row ? JSON.parse(row.value) : { tasa_dolar: 865 };
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/config', async (req, res) => {
  try {
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['app_config']);
    const config = row ? JSON.parse(row.value) : { tasa_dolar: 865 };
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const config = req.body;
    await db.run(
      `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ['app_config', JSON.stringify(config)]
    );
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vps/config', async (req, res) => {
  try {
    const config = req.body;
    await db.run(
      `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ['app_config', JSON.stringify(config)]
    );
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Security Endpoints
app.get('/api/security', async (req, res) => {
  try {
    const row = await db.get('SELECT value FROM security WHERE key = ?', ['pins']);
    const sec = row ? JSON.parse(row.value) : { pinSuperadmin: '7799', pinAdmin: '2026', pinCajero: '1234' };
    res.json(sec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/security', async (req, res) => {
  try {
    const sec = req.body;
    await db.run(
      `INSERT INTO security (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ['pins', JSON.stringify(sec)]
    );
    res.json({ success: true, security: sec });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Access Codes Endpoints
app.get('/api/access-codes', async (req, res) => {
  try {
    const rows = await db.all('SELECT data FROM access_codes');
    const codes = rows.map(r => JSON.parse(r.data));
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/access-codes', async (req, res) => {
  try {
    const item = req.body;
    const id = item.id || `code_${Date.now()}`;
    const codeObj = { ...item, id };
    await db.run(
      `INSERT INTO access_codes (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      [id, JSON.stringify(codeObj)]
    );
    res.json({ success: true, code: codeObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/access-codes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM access_codes WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vps/restore-backup -> Chunked batch restore with image decoupling & WAL transaction upsert
app.post('/api/vps/restore-backup', async (req, res) => {
  try {
    const { productos, batchIndex, totalBatches } = req.body;
    if (!productos || !Array.isArray(productos)) {
      return res.status(400).json({ error: 'Se requiere un array de productos válido' });
    }

    await db.run('BEGIN TRANSACTION');
    let processedCount = 0;

    try {
      for (let i = 0; i < productos.length; i++) {
        const p = productos[i];
        const id = String(p.id || p._id || `prod_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`);
        const name = String(p.nombre || p.name || p.title || 'Sin Nombre');
        const barcode = String(p.codigo_barras || p.barcode || p.codigo || 'N/A');
        const price = Number(p.precio_usd !== undefined ? p.precio_usd : (p.precio !== undefined ? p.precio : (p.price !== undefined ? p.price : 0))) || 0;
        const cost = Number(p.costo_usd !== undefined ? p.costo_usd : (p.costo !== undefined ? p.costo : (p.cost !== undefined ? p.cost : 0))) || 0;
        const stock = Number(p.stock !== undefined ? p.stock : (p.existencia !== undefined ? p.existencia : (p.cantidad !== undefined ? p.cantidad : 0))) || 0;
        const category = String(p.categoria || p.category || 'Sin Categoría');
        const unidad_medida = (p.unidad_medida === 'kg' || p.unidad === 'kg') ? 'kg' : 'unid';
        
        // Decouple image if Base64
        const imagen_url = processBase64Image(p, id);

        // Upsert into products
        await db.run(
          `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             barcode = excluded.barcode,
             price = excluded.price,
             cost = excluded.cost,
             stock = excluded.stock,
             category = excluded.category,
             unidad_medida = excluded.unidad_medida,
             imagen_url = excluded.imagen_url`,
          [id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url]
        );

        // Upsert into costos_productos
        await db.run(
          `INSERT INTO costos_productos (id, producto_id, costo_usd, fecha_actualizacion)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             costo_usd = excluded.costo_usd,
             fecha_actualizacion = excluded.fecha_actualizacion`,
          [`cost_${id}`, id, cost, Date.now()]
        );

        processedCount++;
      }

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    // Sync bibi_store_productos_completos.json
    const allProducts = await getStoredProducts();
    await saveStoredProducts(allProducts);

    console.log(`[RESTORE BACKUP] Lote ${batchIndex !== undefined ? batchIndex + 1 : 1} de ${totalBatches || 1} procesado. (${processedCount} ítems)`);
    res.json({
      success: true,
      procesados: processedCount,
      totalProductosDB: allProducts.length,
      mensaje: `Lote procesado correctamente`
    });
  } catch (err) {
    console.error('Error in restore-backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// Migration endpoint
app.post('/api/vps/migracion-completa', async (req, res) => {
  try {
    const { productos, config, fiados, ventas } = req.body;
    
    await db.run('BEGIN TRANSACTION');
    try {
      if (productos && Array.isArray(productos)) {
        for (let i = 0; i < productos.length; i++) {
          const p = productos[i];
          const normalized = normalizeProductForClient(p, i);
          await db.run(
            `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, barcode=excluded.barcode, price=excluded.price, cost=excluded.cost, stock=excluded.stock, category=excluded.category, unidad_medida=excluded.unidad_medida, imagen_url=excluded.imagen_url`,
            [normalized.id, normalized.nombre, normalized.codigo_barras, normalized.precio_usd, normalized.costo_usd, normalized.stock, normalized.categoria, normalized.unidad_medida, normalized.imagen_url]
          );
        }
      }

      if (config) {
        await db.run(
          `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          ['app_config', JSON.stringify(config)]
        );
      }

      if (fiados && Array.isArray(fiados)) {
        for (const f of fiados) {
          const fid = f.id || `fiado_${Date.now()}`;
          await db.run(
            `INSERT INTO fiados (id, data, fecha) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fecha=excluded.fecha`,
            [fid, JSON.stringify(f), f.fecha || Date.now()]
          );
        }
      }

      if (ventas && Array.isArray(ventas)) {
        for (const v of ventas) {
          const vid = v.id || `venta_${Date.now()}`;
          await db.run(
            `INSERT INTO sales (id, data, fecha) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fecha=excluded.fecha`,
            [vid, JSON.stringify(v), v.fecha || Date.now()]
          );
        }
      }

      await db.run('COMMIT');
    } catch (migErr) {
      await db.run('ROLLBACK');
      throw migErr;
    }

    const allProducts = await getStoredProducts();
    await saveStoredProducts(allProducts);

    res.json({
      success: true,
      mensaje: 'Migración completada exitosamente en la VPS con SQLite y bibi_store_productos_completos.json',
      totalProductos: allProducts.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BIBI STORE VPS SQLite+JSON API] Corriendo en http://0.0.0.0:${PORT}`);
});
