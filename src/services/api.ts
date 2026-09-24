import { Producto, Venta, Fiado, Config } from '../types';

export const DEFAULT_API_URL = 'http://143.198.163.70:3000/api';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('bibi_store_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_API_URL;
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('bibi_store_api_url', url.trim());
    } else {
      localStorage.removeItem('bibi_store_api_url');
    }
  }
}

/**
 * Cliente HTTP unificado con soporte para timeout y fallback a almacenamiento local
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || errorBody.message || `Error HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    console.warn(`[API REST] Fallo en ${options.method || 'GET'} ${url}:`, err.message || err);
    throw err;
  }
}

interface OfflineAction {
  id: string;
  type: 'CREATE_PRODUCT' | 'UPDATE_PRODUCT' | 'DELETE_PRODUCT' | 'BULK_PRODUCTS';
  payload: any;
  timestamp: number;
}

function getOfflineQueue(): OfflineAction[] {
  try {
    const cached = localStorage.getItem('bibi_store_offline_queue');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveOfflineQueue(queue: OfflineAction[]) {
  try {
    localStorage.setItem('bibi_store_offline_queue', JSON.stringify(queue));
  } catch {}
}

function enqueueOfflineAction(type: OfflineAction['type'], payload: any) {
  const queue = getOfflineQueue();
  queue.push({
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type,
    payload,
    timestamp: Date.now()
  });
  saveOfflineQueue(queue);
}

export async function processOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const remaining: OfflineAction[] = [];
  for (const action of queue) {
    try {
      if (action.type === 'CREATE_PRODUCT') {
        await request('/products', {
          method: 'POST',
          body: JSON.stringify(action.payload),
        });
      } else if (action.type === 'UPDATE_PRODUCT') {
        await request(`/products/${encodeURIComponent(action.payload.id)}`, {
          method: 'PUT',
          body: JSON.stringify(action.payload.data),
        });
      } else if (action.type === 'DELETE_PRODUCT') {
        await request(`/products/${encodeURIComponent(action.payload.id)}`, {
          method: 'DELETE',
        });
      } else if (action.type === 'BULK_PRODUCTS') {
        await request('/products/bulk', {
          method: 'POST',
          body: JSON.stringify(action.payload),
        });
      }
    } catch (err) {
      remaining.push(action);
    }
  }

  saveOfflineQueue(remaining);
  if (remaining.length < queue.length) {
    console.log("[Sync] Cola offline sincronizada exitosamente con el servidor VPS.");
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processOfflineQueue();
  });
  setTimeout(() => {
    processOfflineQueue();
  }, 2000);
}

// --------------------------------------------------------
// PRODUCTOS ENDPOINTS
// --------------------------------------------------------

/**
 * GET /api/products -> Obtener inventario de productos
 */
export async function getProducts(): Promise<Producto[]> {
  try {
    const data = await request<any>('/products', { method: 'GET' });
    let prods: Producto[] = [];
    if (Array.isArray(data)) {
      prods = data;
    } else if (data && Array.isArray(data.products)) {
      prods = data.products;
    } else if (data && Array.isArray(data.productos)) {
      prods = data.productos;
    }

    if (prods.length > 0) {
      const sanitized = prods.map(p => ({
        ...p,
        precio_usd: Number(p.precio_usd) || 0,
        costo_usd: Number(p.costo_usd) || 0,
        stock: Number(p.stock) || 0,
      }));
      try {
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(sanitized));
      } catch {}
      return sanitized;
    }
  } catch (err) {
    console.warn('Usando cache local de productos por error en servidor:', err);
  }

  // Fallback a almacenamiento local en caso de desconexión
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => ({
          ...p,
          precio_usd: Number(p.precio_usd) || 0,
          costo_usd: Number(p.costo_usd) || 0,
          stock: Number(p.stock) || 0,
        }));
      }
    }
  } catch {}
  return [];
}

/**
 * POST /api/products -> Crear nuevo producto
 */
export async function createProduct(prod: Partial<Producto> & { costo_usd?: number }): Promise<Producto> {
  const created = {
    ...prod,
    id: prod.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  } as Producto;

  // 1. Guardar inmediatamente en localStorage (Memoria del navegador del celular)
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    let prods: Producto[] = [];
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) prods = parsed;
      } catch {}
    }
    const updated = [created, ...prods.filter(p => p && p.id !== created.id)];
    localStorage.setItem('bibi_store_cached_productos', JSON.stringify(updated));
  } catch {}

  // 2. Intentar guardar en servidor VPS. Si falla, encolar para sincronización automática
  try {
    const response = await request<{ success: boolean; producto: Producto }>('/products', {
      method: 'POST',
      body: JSON.stringify(created),
    });
    if (response && response.producto) {
      return response.producto;
    }
  } catch (err) {
    console.warn("Sin conexión con el servidor. Producto guardado localmente y encolado para sincronización automática:", err);
    enqueueOfflineAction('CREATE_PRODUCT', created);
  }

  return created;
}

/**
 * PUT /api/products/:id -> Actualizar producto existente
 */
export async function updateProduct(id: string, prod: Partial<Producto> & { costo_usd?: number }): Promise<Producto> {
  const updatedData = { ...prod, id } as Producto;

  // 1. Actualizar caché local inmediatamente
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const prods: Producto[] = Array.isArray(parsed) ? parsed : [];
        const idx = prods.findIndex(p => p && p.id === id);
        if (idx >= 0) prods[idx] = { ...prods[idx], ...updatedData };
        else prods.unshift(updatedData);
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(prods));
      } catch {}
    } else {
      localStorage.setItem('bibi_store_cached_productos', JSON.stringify([updatedData]));
    }
  } catch {}

  // 2. Intentar actualizar en servidor
  try {
    const response = await request<{ success: boolean; producto: Producto }>(`/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(prod),
    });
    if (response && response.producto) {
      return response.producto;
    }
  } catch (err) {
    console.warn("Sin conexión con el servidor. Actualización guardada localmente y encolada:", err);
    enqueueOfflineAction('UPDATE_PRODUCT', { id, data: prod });
  }

  return updatedData;
}

/**
 * DELETE /api/products/:id -> Eliminar producto
 */
export async function deleteProduct(id: string): Promise<boolean> {
  // 1. Actualizar caché local inmediatamente
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const prods: Producto[] = Array.isArray(parsed) ? parsed : [];
        const filtered = prods.filter(p => p && p.id !== id);
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(filtered));
      } catch {}
    }
  } catch {}

  // 2. Intentar eliminar en servidor
  try {
    await request<{ success: boolean }>(`/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn("Sin conexión con el servidor. Eliminación encolada para sincronización:", err);
    enqueueOfflineAction('DELETE_PRODUCT', { id });
  }

  return true;
}

/**
 * POST /api/products/bulk -> Poblar masivamente el catálogo desde JSON (con soporte de lotes/append)
 */
export async function bulkUploadProducts(productos: any[], append: boolean = false): Promise<{
  success: boolean;
  totalProductos: number;
  message?: string;
}> {
  // 1. Guardar inmediatamente en localStorage
  try {
    let prodsToSave = productos;
    if (append) {
      const cached = localStorage.getItem('bibi_store_cached_productos');
      let existing: Producto[] = [];
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) existing = parsed;
        } catch {}
      }
      const map = new Map();
      existing.forEach(p => map.set(p.id, p));
      productos.forEach(p => map.set(p.id, { ...(map.get(p.id) || {}), ...p }));
      prodsToSave = Array.from(map.values());
    }
    localStorage.setItem('bibi_store_cached_productos', JSON.stringify(prodsToSave));
  } catch (e) {
    console.warn("No se pudo cachear en localStorage por tamaño:", e);
  }

  // 2. Intentar enviar al servidor VPS
  try {
    return await request<{
      success: boolean;
      totalProductos: number;
      message?: string;
    }>('/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ products: productos, append }),
    });
  } catch (err) {
    console.warn("Sin conexión con el servidor. Carga masiva guardada en navegador y encolada:", err);
    enqueueOfflineAction('BULK_PRODUCTS', { products: productos, append });
    return {
      success: true,
      totalProductos: productos.length,
      message: "Guardado en la memoria del navegador. Se sincronizará con el servidor al conectar a internet."
    };
  }
}

// --------------------------------------------------------
// VENTAS ENDPOINTS
// --------------------------------------------------------

/**
 * POST /api/sales -> Registrar nueva venta en caja
 */
export async function recordSale(venta: Partial<Venta>): Promise<Venta> {
  const result = await request<{ success: boolean; venta: Venta }>('/sales', {
    method: 'POST',
    body: JSON.stringify(venta),
  });

  const savedSale = result.venta || (venta as Venta);

  // Cachear en historial local
  try {
    const cached = localStorage.getItem('bibi_store_cached_ventas');
    let ventas: Venta[] = [];
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) ventas = parsed;
      } catch {}
    }
    ventas.unshift(savedSale);
    localStorage.setItem('bibi_store_cached_ventas', JSON.stringify(ventas));
  } catch {}

  return savedSale;
}

/**
 * GET /api/sales -> Consultar historial de ventas
 */
export async function getSales(): Promise<Venta[]> {
  try {
    const data = await request<Venta[]>('/sales', { method: 'GET' });
    if (Array.isArray(data)) {
      try {
        localStorage.setItem('bibi_store_cached_ventas', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Usando cache local de ventas por error en servidor:', err);
  }

  try {
    const cached = localStorage.getItem('bibi_store_cached_ventas');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

// --------------------------------------------------------
// FIADOS ENDPOINTS
// --------------------------------------------------------

export async function getFiados(): Promise<Fiado[]> {
  try {
    const data = await request<Fiado[]>('/fiados', { method: 'GET' });
    if (Array.isArray(data)) {
      try {
        localStorage.setItem('bibi_store_cached_fiados', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Usando cache local de fiados:', err);
  }

  try {
    const cached = localStorage.getItem('bibi_store_cached_fiados');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export async function saveFiado(fiado: Partial<Fiado>): Promise<boolean> {
  try {
    await request('/fiados', {
      method: 'POST',
      body: JSON.stringify(fiado),
    });
  } catch (err) {
    console.warn('Aviso guardando fiado en servidor:', err);
  }

  try {
    const cached = localStorage.getItem('bibi_store_cached_fiados');
    let list: Fiado[] = [];
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) list = parsed;
      } catch {}
    }
    const targetId = fiado.id || `fiado_${Date.now()}`;
    const item = { ...fiado, id: targetId } as Fiado;
    const idx = list.findIndex(f => f && f.id === targetId);
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    localStorage.setItem('bibi_store_cached_fiados', JSON.stringify(list));
  } catch {}

  return true;
}

// --------------------------------------------------------
// CONFIGURACIÓN (TASA DÓLAR)
// --------------------------------------------------------

export async function getConfig(): Promise<{ tasa_dolar: number }> {
  try {
    const data = await request<{ tasa_dolar: number }>('/config', { method: 'GET' });
    if (data && typeof data.tasa_dolar === 'number') {
      try {
        localStorage.setItem('bibi_store_tasa_dolar', String(data.tasa_dolar));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Usando tasa local:', err);
  }

  try {
    const val = localStorage.getItem('bibi_store_tasa_dolar');
    if (val && Number(val) > 0) return { tasa_dolar: Number(val) };
  } catch {}
  return { tasa_dolar: 865 };
}

export async function saveConfig(config: { tasa_dolar: number }): Promise<boolean> {
  try {
    localStorage.setItem('bibi_store_tasa_dolar', String(config.tasa_dolar));
  } catch {}

  try {
    await request('/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
    return true;
  } catch (err) {
    console.warn('Aviso guardando config en servidor:', err);
    return false;
  }
}

// --------------------------------------------------------
// SEGURIDAD & PINES
// --------------------------------------------------------

export interface SecurityConfig {
  pinSuperadmin: string;
  pinAdmin: string;
  pinCajero: string;
}

export async function getSecurityConfig(): Promise<SecurityConfig> {
  try {
    const data = await request<SecurityConfig>('/security', { method: 'GET' });
    if (data && data.pinSuperadmin) {
      try {
        localStorage.setItem('bibi_store_security_pins', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Usando configuración local de PINs:', err);
  }

  try {
    const cached = localStorage.getItem('bibi_store_security_pins');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}

  return {
    pinSuperadmin: '7799',
    pinAdmin: '2026',
    pinCajero: '1234',
  };
}

export async function saveSecurityConfig(pines: Partial<SecurityConfig>): Promise<boolean> {
  try {
    const current = await getSecurityConfig();
    const updated = { ...current, ...pines };
    localStorage.setItem('bibi_store_security_pins', JSON.stringify(updated));

    await request('/security', {
      method: 'POST',
      body: JSON.stringify(updated),
    });
    return true;
  } catch (err) {
    console.warn('Aviso guardando PINs en servidor:', err);
    return true; // Conservado en localStorage
  }
}

// --------------------------------------------------------
// CÓDIGOS DE ACCESO / TOKENS
// --------------------------------------------------------

export async function getAccessCodes(): Promise<any[]> {
  try {
    const data = await request<any[]>('/access-codes', { method: 'GET' });
    if (Array.isArray(data)) {
      try {
        localStorage.setItem('bibi_store_cached_codes', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch {}

  try {
    const cached = localStorage.getItem('bibi_store_cached_codes');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export async function saveAccessCode(code: any): Promise<boolean> {
  try {
    await request('/access-codes', {
      method: 'POST',
      body: JSON.stringify(code),
    });
  } catch {}

  try {
    const cached = localStorage.getItem('bibi_store_cached_codes');
    const list: any[] = cached ? JSON.parse(cached) : [];
    const idx = list.findIndex(c => c.id === code.id);
    if (idx >= 0) list[idx] = code;
    else list.unshift(code);
    localStorage.setItem('bibi_store_cached_codes', JSON.stringify(list));
  } catch {}

  return true;
}

export async function deleteAccessCode(id: string): Promise<boolean> {
  try {
    await request(`/access-codes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {}

  try {
    const cached = localStorage.getItem('bibi_store_cached_codes');
    if (cached) {
      const list: any[] = JSON.parse(cached);
      localStorage.setItem('bibi_store_cached_codes', JSON.stringify(list.filter(c => c.id !== id)));
    }
  } catch {}

  return true;
}

// --------------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------------

export async function checkServerHealth(): Promise<{ online: boolean; totalProductos?: number; error?: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    }).catch(async () => {
      return await fetch(`${baseUrl}/vps/status`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
    });

    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json();
      return {
        online: true,
        totalProductos: data.totalProductos,
      };
    }
    return { online: false };
  } catch (err: any) {
    return { online: false, error: err.message };
  }
}
