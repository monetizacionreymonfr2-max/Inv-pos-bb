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

export async function migrarTodoAVPS(payload: {
  productos: any[];
  config?: any;
  fiados?: any[];
  ventas?: any[];
}): Promise<{ success: boolean; totalProductos: number; mensaje: string }> {
  const res = await api.bulkUploadProducts(payload.productos);
  if (payload.config) {
    await api.saveConfig(payload.config);
  }
  return {
    success: true,
    totalProductos: res.totalProductos || payload.productos.length,
    mensaje: res.message || 'Productos sincronizados con éxito en el servidor',
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
