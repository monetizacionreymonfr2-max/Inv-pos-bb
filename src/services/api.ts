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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || errorBody.message || `Error HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[API REST] Fallo en ${options.method || 'GET'} ${url}:`, err.message || err);
    throw err;
  }
}

// --------------------------------------------------------
// PRODUCTOS ENDPOINTS
// --------------------------------------------------------

/**
 * GET /api/products -> Obtener inventario de productos
 */
export async function getProducts(): Promise<Producto[]> {
  try {
    const data = await request<Producto[]>('/products', { method: 'GET' });
    if (Array.isArray(data)) {
      try {
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Usando cache local de productos por error en servidor:', err);
  }

  // Fallback a almacenamiento local en caso de desconexión
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

/**
 * POST /api/products -> Crear nuevo producto
 */
export async function createProduct(prod: Partial<Producto> & { costo_usd?: number }): Promise<Producto> {
  const response = await request<{ success: boolean; producto: Producto }>('/products', {
    method: 'POST',
    body: JSON.stringify(prod),
  });

  const created = response.producto || (prod as Producto);

  // Actualizar cache local
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    const prods: Producto[] = cached ? JSON.parse(cached) : [];
    const updated = [created, ...prods.filter(p => p.id !== created.id)];
    localStorage.setItem('bibi_store_cached_productos', JSON.stringify(updated));
  } catch {}

  return created;
}

/**
 * PUT /api/products/:id -> Actualizar producto existente
 */
export async function updateProduct(id: string, prod: Partial<Producto> & { costo_usd?: number }): Promise<Producto> {
  const response = await request<{ success: boolean; producto: Producto }>(`/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(prod),
  });

  const updated = response.producto || ({ ...prod, id } as Producto);

  // Actualizar cache local
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    if (cached) {
      const prods: Producto[] = JSON.parse(cached);
      const idx = prods.findIndex(p => p.id === id);
      if (idx >= 0) prods[idx] = { ...prods[idx], ...updated };
      else prods.unshift(updated);
      localStorage.setItem('bibi_store_cached_productos', JSON.stringify(prods));
    }
  } catch {}

  return updated;
}

/**
 * DELETE /api/products/:id -> Eliminar producto
 */
export async function deleteProduct(id: string): Promise<boolean> {
  try {
    await request<{ success: boolean }>(`/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn("Aviso al eliminar producto en servidor:", err);
  }

  // Actualizar cache local
  try {
    const cached = localStorage.getItem('bibi_store_cached_productos');
    if (cached) {
      const prods: Producto[] = JSON.parse(cached);
      const filtered = prods.filter(p => p.id !== id);
      localStorage.setItem('bibi_store_cached_productos', JSON.stringify(filtered));
    }
  } catch {}

  return true;
}

/**
 * POST /api/products/bulk -> Poblar masivamente el catálogo desde JSON
 */
export async function bulkUploadProducts(productos: any[]): Promise<{
  success: boolean;
  totalProductos: number;
  message?: string;
}> {
  // Guardar inmediatamente en localStorage
  try {
    localStorage.setItem('bibi_store_cached_productos', JSON.stringify(productos));
  } catch (e) {
    console.warn("No se pudo cachear en localStorage por tamaño:", e);
  }

  return await request<{
    success: boolean;
    totalProductos: number;
    message?: string;
  }>('/products/bulk', {
    method: 'POST',
    body: JSON.stringify({ products: productos }),
  });
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
    const ventas: Venta[] = cached ? JSON.parse(cached) : [];
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
    if (cached) return JSON.parse(cached);
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
    if (cached) return JSON.parse(cached);
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
    const list: Fiado[] = cached ? JSON.parse(cached) : [];
    const targetId = fiado.id || `fiado_${Date.now()}`;
    const item = { ...fiado, id: targetId } as Fiado;
    const idx = list.findIndex(f => f.id === targetId);
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
    if (cached) return JSON.parse(cached);
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
    if (cached) return JSON.parse(cached);
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
