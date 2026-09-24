import { getProducts } from '../services/api';

export interface ProductoExportJSON {
  id: string;
  nombre: string;
  precio_usd: number;
  costo_usd: number;
  stock: number;
  unidad_medida: 'unid' | 'kg';
  categoria?: string;
  codigo_barras?: string;
  imagen_url: string;
}

/**
 * Obtiene todos los productos con datos completos (nombre, precios, costos, stock, códigos e imágenes).
 * Si se pasan productos en memoria/localStorage, los usa directamente. De lo contrario consulta la API REST.
 */
export async function exportarProductosJSON(productosMemoria?: any[]): Promise<ProductoExportJSON[]> {
  let source = productosMemoria;

  if (!source || source.length === 0) {
    try {
      const cached = localStorage.getItem('bibi_store_cached_productos');
      if (cached) source = JSON.parse(cached);
    } catch {}
  }

  if (!source || source.length === 0) {
    try {
      source = await getProducts();
    } catch (err) {
      console.warn("No se pudieron cargar productos de la API para exportar:", err);
    }
  }

  if (!source || source.length === 0) {
    return [];
  }

  return source.map((p) => ({
    id: String(p.id || ''),
    nombre: String(p.nombre || ''),
    precio_usd: typeof p.precio_usd === 'number' ? p.precio_usd : (Number(p.precio_usd) || 0),
    costo_usd: typeof p.costo_usd === 'number' ? p.costo_usd : (Number(p.costo_usd) || 0),
    stock: typeof p.stock === 'number' ? p.stock : (Number(p.stock) || 0),
    unidad_medida: p.unidad_medida === 'kg' ? 'kg' : 'unid',
    categoria: p.categoria || 'Sin Categoría',
    codigo_barras: p.codigo_barras || '',
    imagen_url: String(p.imagen_url || p.imagen || '')
  }));
}

export function descargarJSON(data: any, filename: string = 'productos.json') {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
