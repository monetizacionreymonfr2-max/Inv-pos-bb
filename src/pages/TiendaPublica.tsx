import React, { useEffect, useState } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { Producto, VentaItem, CATEGORIAS_PRODUCTO } from '../types';
import { formatUSD, formatBs, cn } from '../lib/utils';
import BibiStoreLogo from '../components/BibiStoreLogo';
import { ShoppingCart, Search, X, Trash2, Phone, MessageCircle } from 'lucide-react';
import { getProducts } from '../services/api';

export default function TiendaPublica() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<VentaItem[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('Todas');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { tasaDolar } = useConfig();

  // Modal para peso variable
  const [modalPesoOpen, setModalPesoOpen] = useState(false);
  const [pesoProducto, setPesoProducto] = useState<Producto | null>(null);
  const [kilos, setKilos] = useState('');
  const [gramos, setGramos] = useState('');

  useEffect(() => {
    getProducts().then(allProds => {
      if (Array.isArray(allProds)) {
        const disponibles = allProds.filter(p => p.stock > 0);
        disponibles.sort((a, b) => a.nombre.localeCompare(b.nombre));
        setProductos(disponibles);
      }
    }).catch(err => {
      console.warn("Aviso al obtener productos de tienda pública:", err);
    });
  }, []);

  const prodFiltrados = productos.filter(p => {
    const matchCat = categoriaSel === 'Todas' || (p.categoria || 'Sin Categoría') === categoriaSel;
    const matchBus = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
                     (p.codigo_barras && p.codigo_barras.includes(busqueda));
    return matchCat && matchBus;
  });

  const agregarAlCarrito = (prod: Producto, weight?: number) => {
    if (prod.unidad_medida === 'kg' && !weight) {
      setPesoProducto(prod);
      setKilos('');
      setGramos('');
      setModalPesoOpen(true);
      return;
    }

    const cantidadAAgregar = weight || 1;

    setCarrito(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) {
        const nuevaCantidad = ex.cantidad + cantidadAAgregar;
        if (nuevaCantidad > prod.stock) {
          alert("No hay suficiente stock");
          return prev;
        }
        return prev.map(i => i.productoId === prod.id ? { ...i, cantidad: nuevaCantidad, subtotal_usd: nuevaCantidad * i.precio_unitario_usd } : i);
      } else {
        if (cantidadAAgregar > prod.stock) {
          alert("No hay suficiente stock");
          return prev;
        }
        return [...prev, {
          productoId: prod.id,
          nombre: prod.nombre,
          cantidad: cantidadAAgregar,
          precio_unitario_usd: prod.precio_usd,
          subtotal_usd: prod.precio_usd * cantidadAAgregar,
          unidad_medida: prod.unidad_medida,
          costo_unitario_usd: 0
        }];
      }
    });

    setIsCartOpen(true);
  };

  const removerDelCarrito = (id: string) => {
    setCarrito(prev => prev.filter(i => i.productoId !== id));
  };

  const modificarCantidad = (id: string, delta: number) => {
    setCarrito(prev => prev.map(i => {
      if (i.productoId === id) {
        const prodData = productos.find(p => p.id === id);
        let nuevaCant = i.cantidad + delta;
        if (nuevaCant <= 0) return i;
        if (prodData && nuevaCant > prodData.stock) {
          alert("No hay suficiente stock");
          return i;
        }
        return { ...i, cantidad: nuevaCant, subtotal_usd: nuevaCant * i.precio_unitario_usd };
      }
      return i;
    }));
  };

  const totalUSD = carrito.reduce((acc, curr) => acc + curr.subtotal_usd, 0);
  const totalVED = totalUSD * tasaDolar;

  const enviarPedidoWhatsApp = () => {
    if (carrito.length === 0) return;

    let mensaje = `*¡Hola Bibi Store! Deseo realizar este pedido:*\n\n`;
    carrito.forEach(i => {
      const unidad = i.unidad_medida === 'kg' ? 'kg' : 'unid';
      mensaje += `▪ ${i.cantidad} ${unidad} de *${i.nombre}* - ${formatUSD(i.subtotal_usd)} (${formatBs(i.subtotal_usd * tasaDolar)})\n`;
    });

    mensaje += `\n*Total Estimado:* ${formatUSD(totalUSD)} / *${formatBs(totalVED)}*`;
    mensaje += `\n*(Tasa: ${formatBs(tasaDolar)})*`;

    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header Público */}
      <header className="bg-black text-white p-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded p-1">
              <BibiStoreLogo className="h-10 w-10" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none text-white">BIBI STORE</h1>
              <p className="text-[10px] text-yellow-400 font-mono font-bold uppercase tracking-wider mt-0.5">Catálogo Virtual</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <span className="text-[10px] text-gray-400 uppercase font-mono block">Tasa del Día</span>
              <span className="text-sm font-bold text-yellow-400 font-mono">1 USD = {formatBs(tasaDolar)}</span>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="bg-yellow-400 text-black p-2.5 border-2 border-white hover:bg-white transition-colors relative cursor-pointer shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
            >
              <ShoppingCart size={20} />
              {carrito.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white font-mono text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                  {carrito.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero / Banner */}
      <div className="bg-yellow-400 border-b-2 border-black p-4 text-center">
        <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-black">
          🛒 Haz tu pedido en línea y recíbelo o retíralo en tienda física
        </p>
      </div>

      {/* Contenido Principal */}
      <div className="max-w-6xl mx-auto w-full p-4 md:p-6 flex-1">
        {/* Buscador & Filtros */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar productos por nombre o referencia..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-black font-mono text-xs uppercase focus:outline-none focus:bg-yellow-50 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scroll-hide">
            <button
              onClick={() => setCategoriaSel('Todas')}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-black whitespace-nowrap cursor-pointer transition-all ${categoriaSel === 'Todas' ? 'bg-black text-white' : 'bg-white text-black hover:bg-yellow-200'}`}
            >
              Todas
            </button>
            {CATEGORIAS_PRODUCTO.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaSel(cat)}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-black whitespace-nowrap cursor-pointer transition-all ${categoriaSel === cat ? 'bg-black text-white' : 'bg-white text-black hover:bg-yellow-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Listado de Productos */}
        {prodFiltrados.length === 0 ? (
          <div className="py-20 text-center text-gray-400 font-mono text-sm">
            No se encontraron productos disponibles en este momento.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {prodFiltrados.map(prod => (
              <div
                key={prod.id}
                className="bg-white border-2 border-black p-3 flex flex-col justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                <div>
                  <div className="h-28 sm:h-36 w-full bg-gray-50 border border-black mb-2 overflow-hidden flex items-center justify-center">
                    {prod.imagen_url ? (
                      <img src={prod.imagen_url} alt={prod.nombre} className="h-full w-full object-cover" />
                    ) : (
                      <BibiStoreLogo className="h-16 w-16 opacity-30" />
                    )}
                  </div>

                  <span className="text-[9px] font-bold uppercase bg-gray-100 border border-black px-1.5 py-0.5 inline-block mb-1">
                    {prod.categoria || 'Varios'}
                  </span>

                  <h3 className="font-black text-xs uppercase tracking-tight text-black line-clamp-2 mb-2">
                    {prod.nombre}
                  </h3>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="mb-2">
                    <span className="text-base font-black text-black leading-none block">
                      {formatUSD(prod.precio_usd)}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-gray-500">
                      {formatBs(prod.precio_usd * tasaDolar)}
                    </span>
                  </div>

                  <button
                    onClick={() => agregarAlCarrito(prod)}
                    className="w-full py-2 bg-yellow-400 border-2 border-black text-black font-black uppercase text-[10px] tracking-wider hover:bg-black hover:text-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Agregar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Carrito Lateral (Drawer) */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsCartOpen(false)}></div>
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white border-l-4 border-black p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center pb-4 border-b-2 border-black mb-4">
                  <div className="flex items-center gap-2">
                    <ShoppingCart size={20} />
                    <h2 className="font-black text-base uppercase tracking-wider">Tu Pedido</h2>
                  </div>
                  <button onClick={() => setIsCartOpen(false)} className="cursor-pointer hover:text-red-500">
                    <X size={22} />
                  </button>
                </div>

                <div className="overflow-y-auto max-h-[60vh] space-y-3 pr-1">
                  {carrito.length === 0 ? (
                    <p className="text-center text-gray-400 font-mono text-xs py-10">Tu carrito está vacío.</p>
                  ) : (
                    carrito.map(item => (
                      <div key={item.productoId} className="border-2 border-black p-3 bg-gray-50 flex justify-between items-center">
                        <div className="flex-1 pr-2">
                          <h4 className="font-black text-xs uppercase">{item.nombre}</h4>
                          <span className="text-[10px] font-mono text-gray-600 block">
                            {formatUSD(item.precio_unitario_usd)} c/u
                          </span>
                          <div className="flex items-center gap-1 mt-1">
                            <button onClick={() => modificarCantidad(item.productoId, -1)} className="px-2 py-0.5 border border-black bg-white font-bold text-xs">-</button>
                            <span className="px-2 font-mono text-xs font-bold">{item.cantidad}</span>
                            <button onClick={() => modificarCantidad(item.productoId, 1)} className="px-2 py-0.5 border border-black bg-white font-bold text-xs">+</button>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <button onClick={() => removerDelCarrito(item.productoId)} className="text-red-500 hover:text-red-700 mb-1">
                            <Trash2 size={14} />
                          </button>
                          <span className="font-black text-sm">{formatUSD(item.subtotal_usd)}</span>
                          <span className="text-[10px] font-mono text-gray-500">{formatBs(item.subtotal_usd * tasaDolar)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Resumen & Botón Pedir */}
              <div className="pt-4 border-t-2 border-black space-y-3">
                <div className="bg-yellow-100 border-2 border-black p-3">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-black uppercase">Total Estimado</span>
                    <span className="text-xl font-black">{formatUSD(totalUSD)}</span>
                  </div>
                  <div className="flex justify-between items-baseline border-t border-black/20 pt-1">
                    <span className="text-[10px] font-mono text-gray-600">En Bolívares</span>
                    <span className="text-sm font-mono font-black">{formatBs(totalVED)}</span>
                  </div>
                </div>

                <button
                  onClick={enviarPedidoWhatsApp}
                  disabled={carrito.length === 0}
                  className="w-full py-3.5 bg-emerald-600 text-white font-black uppercase tracking-wider text-xs border-2 border-black flex items-center justify-center gap-2 hover:bg-black transition-colors cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
                >
                  <MessageCircle size={16} />
                  <span>Enviar Pedido por WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Peso */}
      {modalPesoOpen && pesoProducto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black p-6 w-full max-w-xs shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <h3 className="font-black text-sm uppercase mb-2">Ingresar Peso: {pesoProducto.nombre}</h3>
            <p className="text-xs font-mono text-gray-600 mb-3">Precio/Kg: {formatUSD(pesoProducto.precio_usd)}</p>

            <div className="space-y-2 mb-4">
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Kilos</label>
                <input
                  type="number"
                  step="0.01"
                  value={kilos}
                  onChange={e => {
                    setKilos(e.target.value);
                    const k = parseFloat(e.target.value) || 0;
                    setGramos((k * 1000).toString());
                  }}
                  className="w-full p-2 border-2 border-black font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setModalPesoOpen(false)} className="flex-1 py-2 border-2 border-black text-xs font-bold uppercase">Cancelar</button>
              <button
                onClick={() => {
                  const w = parseFloat(kilos) || (parseFloat(gramos) / 1000) || 0;
                  if (w > 0) {
                    agregarAlCarrito(pesoProducto, w);
                    setModalPesoOpen(false);
                  }
                }}
                className="flex-1 py-2 bg-yellow-400 border-2 border-black text-xs font-black uppercase hover:bg-black hover:text-white"
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
