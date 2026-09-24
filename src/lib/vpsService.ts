import * as api from '../services/api';

export interface VPSStatus {
  online: boolean;
  totalProductos?: number;
  mode?: string;
  error?: string;
}

export function isVpsHost(): boolean {
  return true;
}

export async function checkVPSOnline(): Promise<VPSStatus> {
  const health = await api.checkServerHealth();
  return {
    online: health.online,
    totalProductos: health.totalProductos,
    mode: 'autonomous_rest_vps',
    error: health.error,
  };
}

export async function migrarTodoAVPS(
  payload: {
    productos: any[];
    config?: any;
    fiados?: any[];
    ventas?: any[];
  },
  onProgress?: (mensaje: string) => void
): Promise<{ success: boolean; totalProductos: number; mensaje: string }> {
  const productos = payload.productos || [];
  const CHUNK_SIZE = 50;
  const total = productos.length;
  const totalChunks = Math.ceil(total / CHUNK_SIZE) || 1;

  // Cachear todos los productos en localStorage al iniciar
  try {
    localStorage.setItem('bibi_store_cached_productos', JSON.stringify(productos));
  } catch (e) {
    console.warn("No se pudo cachear en localStorage:", e);
  }

  let lastRes: any = { totalProductos: total };

  for (let i = 0; i < totalChunks; i++) {
    const chunk = productos.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const countEnviados = Math.min((i + 1) * CHUNK_SIZE, total);
    const mensajeProgreso = `Sincronizando lote ${i + 1} de ${totalChunks} (${countEnviados}/${total} productos enviados)...`;
    
    if (onProgress) {
      onProgress(mensajeProgreso);
    }

    const res = await api.bulkUploadProducts(chunk, i > 0);
    if (res) {
      lastRes = res;
    }
  }

  if (payload.config) {
    if (onProgress) {
      onProgress("Guardando configuración...");
    }
    await api.saveConfig(payload.config);
  }

  return {
    success: true,
    totalProductos: lastRes.totalProductos || total,
    mensaje: lastRes.message || 'Productos sincronizados con éxito en el servidor',
  };
}

// Configuración
export async function getVPSConfig(): Promise<{ tasa_dolar?: number } | null> {
  return await api.getConfig();
}

export async function saveVPSConfig(config: { tasa_dolar: number; [key: string]: any }): Promise<boolean> {
  return await api.saveConfig(config);
}

// Productos (CRUD)
export async function getVPSProductos(): Promise<any[]> {
  return await api.getProducts();
}

export async function saveVPSProducto(producto: any): Promise<boolean> {
  if (producto.id) {
    await api.updateProduct(producto.id, producto);
  } else {
    await api.createProduct(producto);
  }
  return true;
}

export async function deleteVPSProducto(id: string): Promise<boolean> {
  return await api.deleteProduct(id);
}

// Ventas
export async function getVPSVentas(): Promise<any[]> {
  return await api.getSales();
}

export async function saveVPSVenta(venta: any): Promise<boolean> {
  await api.recordSale(venta);
  return true;
}

// Fiados
export async function getVPSFiados(): Promise<any[]> {
  return await api.getFiados();
}

export async function saveVPSFiado(fiado: any): Promise<boolean> {
  return await api.saveFiado(fiado);
}
