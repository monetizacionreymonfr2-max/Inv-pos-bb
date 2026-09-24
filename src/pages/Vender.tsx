import React, { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { formatUSD, formatBs, cn } from '../lib/utils';
import { Producto, VentaItem, CATEGORIAS_PRODUCTO } from '../types';
import { Search, Trash2, Scan, X, ShoppingCart, UploadCloud, Database } from 'lucide-react';
import Scanner from '../components/Scanner';
import toast from 'react-hot-toast';
import { getProducts, recordSale, bulkUploadProducts } from '../services/api';

export default function Vender() {
  const { tasaDolar } = useConfig();
  const { user } = useAuth();
  
  const [productos, setProductos] = useState<Producto[]>(() => {
    try {
      const saved = localStorage.getItem('bibi_store_cached_productos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [busqueda, setBusqueda] = useState('');
  
  const [carrito, setCarrito] = useState<VentaItem[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [scannerAbierto, setScannerAbierto] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Weight Modal State
  const [modalPesoOpen, setModalPesoOpen] = useState(false);
  const [pesoProducto, setPesoProducto] = useState<Producto | null>(null);
  const [gramos, setGramos] = useState('');
  const [kilos, setKilos] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);

  useEffect(() => {
    getProducts().then(prods => {
      if (prods && Array.isArray(prods) && prods.length > 0) {
        setProductos(prods);
      }
    }).catch(err => {
      console.warn("Aviso al cargar productos en venta:", err);
    });
  }, []);

  const handleSubirCopiaJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Leyendo archivo JSON de copia de seguridad...");
    try {
      const text = await file.text();
      let parsed = JSON.parse(text);
      let prods: any[] = [];
      if (Array.isArray(parsed)) {
        prods = parsed;
      } else if (parsed && Array.isArray(parsed.productos)) {
        prods = parsed.productos;
      } else if (parsed && Array.isArray(parsed.products)) {
        prods = parsed.products;
      } else {
        throw new Error("El archivo no contiene un formato de lista de productos válido.");
      }

      if (prods.length === 0) {
        throw new Error("El archivo JSON no contiene productos.");
      }

      // Guardar en memoria local
      setProductos(prods);
      try {
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(prods));
      } catch {}

      // Enviar al servidor en segundo plano
      bulkUploadProducts(prods).catch(err => console.warn("Sync en bulk aviso:", err));

      toast.success(`🎉 ¡Éxito! ${prods.length} productos cargados y listos para vender.`, { id: toastId, duration: 5000 });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al procesar el archivo JSON", { id: toastId });
    }
  };

  const prodFiltrados = (productos || []).filter(p => {
    if (!p) return false;
    const term = (busqueda || '').toLowerCase();
    const matchNombre = (p.nombre || '').toLowerCase().includes(term);
    const matchRef = p.codigo_barras && (p.codigo_barras || '').toLowerCase().includes(term);
    return matchNombre || matchRef;
  });

  const agregarAlCarrito = (prod: Producto, weight?: number, replace: boolean = false) => {
    if (prod.unidad_medida === 'kg' && !weight) {
      setPesoProducto(prod);
      setGramos('');
      setKilos('');
      setIsEditingWeight(false);
      setModalPesoOpen(true);
      return;
    }

    const cantidadAAgregar = weight || 1;

    setCarrito(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) {
        const nuevaCantidad = replace ? cantidadAAgregar : ex.cantidad + cantidadAAgregar;
        if (nuevaCantidad > prod.stock) {
          toast.error("No hay suficiente stock disponible");
          return prev;
        }
        return prev.map(i => i.productoId === prod.id ? { ...i, cantidad: nuevaCantidad, subtotal_usd: nuevaCantidad * i.precio_unitario_usd } : i);
      }
      return [...prev, { 
        productoId: prod.id, 
        nombre: prod.nombre, 
        cantidad: cantidadAAgregar, 
        precio_unitario_usd: prod.precio_usd, 
        subtotal_usd: cantidadAAgregar * prod.precio_usd,
        unidad_medida: prod.unidad_medida,
        categoria: prod.categoria || 'Sin Categoría'
      }];
    });
    setModalPesoOpen(false);
  };

  const modificarCantidad = (prodId: string, delta: number) => {
    setCarrito(prev => prev.map(i => {
      if (i.productoId !== prodId) return i;
      const nw = i.cantidad + delta;
      if (nw <= 0) return i;
      const stockMax = productos.find(p => p.id === prodId)?.stock || 0;
      if (nw > stockMax) return i;
      return { ...i, cantidad: nw, subtotal_usd: nw * i.precio_unitario_usd };
    }));
  };

  const quitarDelCarrito = (prodId: string) => {
    setCarrito(prev => prev.filter(i => i.productoId !== prodId));
  };

  const totalUSD = carrito.reduce((acc, curr) => acc + curr.subtotal_usd, 0);
  const totalVED = totalUSD * tasaDolar;

  // Registrar venta con el nuevo endpoint POST /api/sales
  const procesarVenta = async () => {
    if (carrito.length === 0 || procesando) return;
    setProcesando(true);
    const loadingToast = toast.loading("Procesando venta en caja...");
    try {
      const ventaData = {
        total_usd: totalUSD,
        total_ved: totalVED,
        fecha: Date.now(),
        vendedor_id: user?.displayName || user?.uid || 'cajero',
        items: carrito.map(i => ({
          productoId: i.productoId,
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio_unitario_usd: i.precio_unitario_usd,
          categoria: i.categoria || 'Sin Categoría'
        }))
      };

      // Llamada oficial POST /api/sales
      await recordSale(ventaData);

      // Descontar stock localmente en memoria
      setProductos(prev => {
        const copy = [...prev];
        carrito.forEach(item => {
          const p = copy.find(x => x.id === item.productoId);
          if (p) p.stock = Math.max(0, p.stock - item.cantidad);
        });
        try {
          localStorage.setItem('bibi_store_cached_productos', JSON.stringify(copy));
        } catch {}
        return copy;
      });

      setCarrito([]);
      setShowMobileCart(false);
      toast.success("🎉 ¡Venta registrada exitosamente!", { id: loadingToast, duration: 3500 });
    } catch (err: any) {
      console.error("Error al vender:", err);
      toast.error(err.message || "Error al procesar la venta en el servidor", { id: loadingToast });
    } finally {
      setProcesando(false);
    }
  };

  const handleScan = (code: string) => {
    const term = (code || '').toLowerCase();
    const match = (productos || []).find(p => p && (p.codigo_barras || '').toLowerCase() === term);

    if (match) {
      if (match.stock > 0) {
        agregarAlCarrito(match);
        toast.success(`Añadido: ${match.nombre}`);
      } else {
        toast.error(`El producto "${match.nombre}" está agotado.`);
      }
    } else {
      setBusqueda(code);
      toast.error("Producto no encontrado. Búsqueda manual activada.");
    }
  };

  const categoriasConProductos = [...CATEGORIAS_PRODUCTO, 'Sin Categoría'].filter(cat => 
    prodFiltrados.some(p => (p.categoria || 'Sin Categoría') === cat)
  );

  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
      {scannerAbierto && (
        <Scanner 
          onScan={handleScan} 
          onClose={() => setScannerAbierto(false)} 
          title="Venta: Escanear Producto" 
        />
      )}
      
      {/* Product Selection */}
      <section className="flex-1 p-4 md:p-6 flex flex-col space-y-6 overflow-hidden border-r border-gray-100 relative">
        <div className="flex space-x-4 items-center shrink-0">
          <div className="relative flex-1">
            <input 
              type="text" 
              placeholder="Buscar producto por nombre o código..." 
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-yellow-500 text-sm font-bold uppercase"
            />
            <div className="absolute left-3 top-3.5 text-gray-400">
              <Search size={18} />
            </div>
          </div>
          <button 
            onClick={() => setScannerAbierto(true)}
            className="bg-black text-white px-6 py-3 font-bold text-sm uppercase tracking-wider hover:bg-zinc-800 transition-colors flex items-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            <Scan size={18} />
            <span className="hidden sm:inline">Escanear</span>
          </button>
        </div>
        
        <div className="overflow-y-auto scroll-hide pb-20 md:pb-10 space-y-8 pr-2 flex-1">
          {categoriasConProductos.length === 0 && productos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-black bg-yellow-50 my-4">
              <ShoppingCart size={40} className="text-black mb-3" />
              <h3 className="font-black text-base uppercase tracking-wider text-black">Catálogo sin productos</h3>
              <p className="text-xs text-gray-600 max-w-sm mt-1 mb-4 font-medium">
                Carga el archivo de respaldo <b>bibi_store_productos_completos.json</b> para activar los productos de inmediato.
              </p>
              <label className="bg-yellow-400 text-black border-2 border-black px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-black hover:text-white transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                Cargar Archivo JSON
                <input type="file" accept=".json" className="hidden" onChange={handleSubirCopiaJSON} />
              </label>
            </div>
          ) : null}

          {categoriasConProductos.map(cat => {
            const prodsCat = prodFiltrados.filter(p => (p.categoria || 'Sin Categoría') === cat);
            return (
              <div key={cat}>
                <h2 className="text-sm font-black uppercase tracking-widest bg-yellow-400 inline-block px-3 py-1 mb-4 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  {cat}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {prodsCat.map(prod => (
                    <div 
                      key={prod.id} 
                      onClick={() => { if (prod.stock > 0) agregarAlCarrito(prod); }}
                      className={`border-2 border-black p-4 transition-all group flex flex-col justify-between bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${prod.stock === 0 ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:translate-x-0.5 hover:translate-y-0.5 cursor-pointer'}`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 font-bold uppercase tracking-tighter truncate max-w-[60%] border border-black">
                            {prod.categoria || 'Sin Categoría'}
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 border border-black ${prod.stock <= 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {prod.stock} {prod.unidad_medida || 'unid'}
                          </span>
                        </div>

                        {prod.imagen_url && (
                          <div className="h-24 w-full bg-gray-50 border border-black mb-2 overflow-hidden flex items-center justify-center">
                            <img src={prod.imagen_url} alt={prod.nombre} className="h-full w-full object-cover" />
                          </div>
                        )}

                        <h3 className="font-extrabold text-sm uppercase tracking-tight text-black line-clamp-2 mb-1">
                          {prod.nombre}
                        </h3>
                      </div>

                      <div className="pt-2 border-t border-gray-200 mt-2">
                        <span className="text-lg font-black text-black block leading-none">
                          {formatUSD(prod.precio_usd)}
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-500">
                          {formatBs(prod.precio_usd * tasaDolar)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cart / Register Panel */}
      <aside className={cn(
        "w-full md:w-96 bg-gray-50/70 p-4 md:p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-black shrink-0 transition-all",
        showMobileCart ? "fixed inset-0 z-40 bg-white" : "hidden md:flex"
      )}>
        <div className="flex justify-between items-center pb-3 border-b-2 border-black mb-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            <h2 className="text-base font-black uppercase tracking-widest text-black">Carrito de Venta</h2>
          </div>
          {showMobileCart && (
            <button onClick={() => setShowMobileCart(false)} className="md:hidden text-black p-1">
              <X size={24} />
            </button>
          )}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {carrito.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400">
              <ShoppingCart size={36} className="mb-2 opacity-50" />
              <p className="text-xs font-mono font-bold uppercase tracking-wider">El carrito está vacío</p>
              <p className="text-[10px] text-gray-500 mt-1">Selecciona o escanea productos</p>
            </div>
          ) : (
            carrito.map(item => (
              <div key={item.productoId} className="bg-white border-2 border-black p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex justify-between items-start">
                  <h4 className="font-black text-xs uppercase tracking-tight flex-1 mr-2">{item.nombre}</h4>
                  <button onClick={() => quitarDelCarrito(item.productoId)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1 border border-black bg-gray-50 px-1">
                    <button 
                      onClick={() => modificarCantidad(item.productoId, -1)}
                      className="px-2 py-0.5 text-xs font-black hover:bg-black hover:text-white"
                    >
                      -
                    </button>
                    <span className="font-mono text-xs font-bold px-2">{item.cantidad}</span>
                    <button 
                      onClick={() => modificarCantidad(item.productoId, 1)}
                      className="px-2 py-0.5 text-xs font-black hover:bg-black hover:text-white"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-sm block leading-none">{formatUSD(item.subtotal_usd)}</span>
                    <span className="font-mono text-[10px] text-gray-500">{formatBs(item.subtotal_usd * tasaDolar)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total & Checkout */}
        <div className="pt-4 border-t-2 border-black space-y-3 mt-4">
          <div className="bg-yellow-300 border-2 border-black p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-black uppercase tracking-wider">Total USD</span>
              <span className="text-2xl font-black">{formatUSD(totalUSD)}</span>
            </div>
            <div className="flex justify-between items-baseline border-t border-black/20 pt-1">
              <span className="text-[10px] font-mono uppercase text-gray-700">Tasa: {formatBs(tasaDolar)}</span>
              <span className="text-sm font-mono font-black">{formatBs(totalVED)}</span>
            </div>
          </div>

          <button
            onClick={procesarVenta}
            disabled={carrito.length === 0 || procesando}
            className="w-full py-4 bg-black text-white font-black text-sm uppercase tracking-widest hover:bg-yellow-400 hover:text-black border-2 border-black transition-all cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5"
          >
            {procesando ? "PROCESANDO..." : "COBRAR VENTA"}
          </button>
        </div>
      </aside>

      {/* Floating Mobile Cart Button */}
      {carrito.length > 0 && !showMobileCart && (
        <button
          onClick={() => setShowMobileCart(true)}
          className="md:hidden fixed bottom-20 right-4 bg-yellow-400 border-2 border-black p-3.5 rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-30 flex items-center gap-2 font-black"
        >
          <ShoppingCart size={20} />
          <span>{carrito.length}</span>
          <span className="border-l border-black pl-2">{formatUSD(totalUSD)}</span>
        </button>
      )}

      {/* Weight Modal */}
      {modalPesoOpen && pesoProducto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black p-6 w-full max-w-sm shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <h3 className="font-black text-sm uppercase tracking-wider mb-2">Ingresar Peso: {pesoProducto.nombre}</h3>
            <p className="text-xs text-gray-600 mb-4 font-mono">Precio por Kg: {formatUSD(pesoProducto.precio_usd)}</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Kilos</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={kilos}
                  onChange={e => {
                    setKilos(e.target.value);
                    const k = parseFloat(e.target.value) || 0;
                    setGramos((k * 1000).toString());
                  }}
                  className="w-full p-2 border-2 border-black font-mono font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Gramos</label>
                <input
                  type="number"
                  step="1"
                  placeholder="0"
                  value={gramos}
                  onChange={e => {
                    setGramos(e.target.value);
                    const g = parseFloat(e.target.value) || 0;
                    setKilos((g / 1000).toString());
                  }}
                  className="w-full p-2 border-2 border-black font-mono font-bold text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setModalPesoOpen(false)}
                className="flex-1 py-2 border-2 border-black font-bold uppercase text-xs hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const w = parseFloat(kilos) || (parseFloat(gramos) / 1000) || 0;
                  if (w > 0) {
                    agregarAlCarrito(pesoProducto, w, isEditingWeight);
                  } else {
                    toast.error("Ingrese un peso válido");
                  }
                }}
                className="flex-1 py-2 bg-yellow-400 border-2 border-black font-black uppercase text-xs hover:bg-black hover:text-white"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
