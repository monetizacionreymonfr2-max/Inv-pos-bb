const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow large payloads (for products with base64 images)
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

let db;

async function initDb() {
  try {
    db = await open({
      filename: path.join(__dirname, 'database.sqlite'),
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        barcode TEXT,
        price REAL,
        cost REAL,
        stock INTEGER,
        category TEXT,
        unidad_medida TEXT,
        imagen_url TEXT
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
    console.log('[SQLite] Base de datos conectada en:', path.join(__dirname, 'database.sqlite'));
  } catch (err) {
    console.error('[SQLite] Error inicializando base de datos:', err);
  }
}

initDb();

// 1. Health / Status
app.get('/api/health', async (req, res) => {
  try {
    const countRow = await db.get('SELECT COUNT(*) as count FROM products');
    res.json({
      status: 'online',
      server: 'Bibi Store VPS SQLite REST API',
      totalProductos: countRow ? countRow.count : 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/status', async (req, res) => {
  try {
    const countRow = await db.get('SELECT COUNT(*) as count FROM products');
    res.json({
      status: 'online',
      mode: 'autonomous_vps_sqlite',
      totalProductos: countRow ? countRow.count : 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Products CRUD (Ordered by name ASC)
app.get('/api/products', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM products ORDER BY name ASC');
    const products = rows.map(r => ({
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
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vps/productos', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM products ORDER BY name ASC');
    const products = rows.map(r => ({
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

    const id = String(p.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const barcode = String(p.barcode !== undefined && p.barcode !== null ? p.barcode : (p.codigo_barras !== undefined && p.codigo_barras !== null ? p.codigo_barras : '')) || '';
    const price = Number(p.price !== undefined ? p.price : (p.precio_usd !== undefined ? p.precio_usd : 0)) || 0;
    const cost = Number(p.cost !== undefined ? p.cost : (p.costo_usd !== undefined ? p.costo_usd : 0)) || 0;
    const stock = Number(p.stock !== undefined ? p.stock : 0) || 0;
    const category = String(p.category !== undefined && p.category !== null && p.category !== '' ? p.category : (p.categoria !== undefined && p.categoria !== null && p.categoria !== '' ? p.categoria : 'Sin Categoría')) || 'Sin Categoría';
    const unidad_medida = String(p.unidad_medida || 'unid');
    const imagen_url = String(p.imagen_url || '');

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
      [id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url]
    );

    const producto = {
      id,
      nombre: name,
      codigo_barras: barcode,
      precio_usd: price,
      costo_usd: cost,
      stock,
      categoria: category,
      unidad_medida,
      imagen_url
    };

    res.status(201).json({ success: true, producto });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vps/productos', async (req, res) => {
  try {
    const p = req.body;
    const id = String(p.id || `prod_${Date.now()}`);
    const name = String(p.name !== undefined && p.name !== null && p.name !== '' ? p.name : (p.nombre !== undefined && p.nombre !== null && p.nombre !== '' ? p.nombre : 'Producto'));
    const barcode = String(p.barcode !== undefined && p.barcode !== null ? p.barcode : (p.codigo_barras !== undefined && p.codigo_barras !== null ? p.codigo_barras : ''));
    const price = Number(p.price !== undefined ? p.price : (p.precio_usd !== undefined ? p.precio_usd : 0));
    const cost = Number(p.cost !== undefined ? p.cost : (p.costo_usd !== undefined ? p.costo_usd : 0));
    const stock = Number(p.stock !== undefined ? p.stock : 0);
    const category = String(p.category !== undefined && p.category !== null && p.category !== '' ? p.category : (p.categoria !== undefined && p.categoria !== null && p.categoria !== '' ? p.categoria : 'Sin Categoría'));
    const unidad_medida = String(p.unidad_medida || 'unid');
    const imagen_url = String(p.imagen_url || '');

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
      [id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url]
    );

    res.json({ success: true, producto: { id, nombre: name, codigo_barras: barcode, precio_usd: price, costo_usd: cost, stock, categoria: category, unidad_medida, imagen_url } });
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

    const name = String(p.name !== undefined && p.name !== null && p.name !== '' ? p.name : (p.nombre !== undefined && p.nombre !== null && p.nombre !== '' ? p.nombre : existing.name));
    const barcode = String(p.barcode !== undefined && p.barcode !== null ? p.barcode : (p.codigo_barras !== undefined && p.codigo_barras !== null ? p.codigo_barras : existing.barcode));
    const price = Number(p.price !== undefined ? p.price : (p.precio_usd !== undefined ? p.precio_usd : existing.price));
    const cost = Number(p.cost !== undefined ? p.cost : (p.costo_usd !== undefined ? p.costo_usd : existing.cost));
    const stock = Number(p.stock !== undefined ? p.stock : existing.stock);
    const category = String(p.category !== undefined && p.category !== null && p.category !== '' ? p.category : (p.categoria !== undefined && p.categoria !== null && p.categoria !== '' ? p.categoria : existing.category));
    const unidad_medida = String(p.unidad_medida || existing.unidad_medida || 'unid');
    const imagen_url = String(p.imagen_url !== undefined && p.imagen_url !== null ? p.imagen_url : (existing.imagen_url || ''));

    await db.run(
      `UPDATE products SET name = ?, barcode = ?, price = ?, cost = ?, stock = ?, category = ?, unidad_medida = ?, imagen_url = ? WHERE id = ?`,
      [name, barcode, price, cost, stock, category, unidad_medida, imagen_url, id]
    );

    res.json({
      success: true,
      producto: { id, nombre: name, codigo_barras: barcode, precio_usd: price, costo_usd: cost, stock, categoria: category, unidad_medida, imagen_url }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true, deleted: result.changes || 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vps/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/bulk -> Bulk synchronization with BEGIN TRANSACTION, COMMIT, ROLLBACK, ON CONFLICT, and default values
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

    await db.run('BEGIN TRANSACTION');

    try {
      for (let i = 0; i < prods.length; i++) {
        const p = prods[i];
        if (!p || typeof p !== 'object') continue;

        const id = String(p.id || p._id || `prod_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`);
        const name = String(p.name !== undefined && p.name !== null && p.name !== '' ? p.name : (p.nombre !== undefined && p.nombre !== null && p.nombre !== '' ? p.nombre : `Producto ${i + 1}`));
        const barcode = String(p.barcode !== undefined && p.barcode !== null ? p.barcode : (p.codigo_barras !== undefined && p.codigo_barras !== null ? p.codigo_barras : ''));
        const price = Number(p.price !== undefined ? p.price : (p.precio_usd !== undefined ? p.precio_usd : (p.precio !== undefined ? p.precio : 0))) || 0;
        const cost = Number(p.cost !== undefined ? p.cost : (p.costo_usd !== undefined ? p.costo_usd : (p.costo !== undefined ? p.costo : 0))) || 0;
        const stock = Number(p.stock !== undefined ? p.stock : (p.existencia !== undefined ? p.existencia : (p.cantidad !== undefined ? p.cantidad : 0))) || 0;
        const category = String(p.category !== undefined && p.category !== null && p.category !== '' ? p.category : (p.categoria !== undefined && p.categoria !== null && p.categoria !== '' ? p.categoria : 'Sin Categoría'));
        const unidad_medida = String(p.unidad_medida || p.unidad || 'unid');
        const imagen_url = String(p.imagen_url || p.image || p.imagen || '');

        await db.run(
          `INSERT INTO products (id, name, barcode, price, cost, stock, category, unidad_medida, imagen_url) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, barcode=excluded.barcode, price=excluded.price, cost=excluded.cost, stock=excluded.stock, category=excluded.category`,
          [id, name, barcode, price, cost, stock, category]
        );
      }

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    const countRow = await db.get('SELECT COUNT(*) as count FROM products');
    const totalProductos = countRow ? countRow.count : prods.length;

    console.log(`[BULK UPLOAD] ${prods.length} productos sincronizados. Total en BD: ${totalProductos}`);
    res.json({
      success: true,
      totalProductos,
      message: `${totalProductos} productos sincronizados en el servidor`
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

// Migration endpoint
app.post('/api/vps/migracion-completa', async (req, res) => {
  try {
    const { productos, config, fiados, ventas } = req.body;
    
    await db.run('BEGIN TRANSACTION');
    try {
      if (productos && Array.isArray(productos)) {
        for (let i = 0; i < productos.length; i++) {
          const p = productos[i];
          const id = String(p.id || `prod_${Date.now()}_${i}`);
          const name = String(p.name || p.nombre || `Producto ${i + 1}`);
          const barcode = String(p.barcode || p.codigo_barras || '');
          const price = Number(p.price !== undefined ? p.price : (p.precio_usd || 0));
          const cost = Number(p.cost !== undefined ? p.cost : (p.costo_usd || 0));
          const stock = Number(p.stock !== undefined ? p.stock : 0);
          const category = String(p.category || p.categoria || 'Sin Categoría');
          const unidad_medida = String(p.unidad_medida || 'unid');
          const imagen_url = String(p.imagen_url || '');

          await db.run(
            `INSERT INTO products (id, name, barcode, price, cost, stock, category) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, barcode=excluded.barcode, price=excluded.price, cost=excluded.cost, stock=excluded.stock, category=excluded.category`,
            [id, name, barcode, price, cost, stock, category]
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

    const countRow = await db.get('SELECT COUNT(*) as count FROM products');
    res.json({
      success: true,
      mensaje: 'Migración completada exitosamente en la VPS con SQLite',
      totalProductos: countRow ? countRow.count : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BIBI STORE VPS SQLite API] Corriendo en http://0.0.0.0:${PORT}`);
});
