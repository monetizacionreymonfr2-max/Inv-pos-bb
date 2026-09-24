import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { Producto, CATEGORIAS_PRODUCTO } from '../types';
import { formatUSD, formatBs, cn } from '../lib/utils';
import { Plus, Edit2, Trash2, Search, X, Scan, Filter, FileDown, FileCode, Package, UploadCloud, RefreshCw, Server } from 'lucide-react';
import Scanner from '../components/Scanner';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportarProductosJSON, descargarJSON } from '../lib/exportProductos';
import { getProducts, createProduct, updateProduct, deleteProduct, bulkUploadProducts } from '../services/api';
import { migrarTodoAVPS } from '../lib/vpsService';

export default function Inventario() {
  const { role } = useAuth();
  const { tasaDolar } = useConfig();
  const [productos, setProductos] = useState<(Producto & { costo_usd?: number })[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [scannerAbierto, setScannerAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  
  // Form state
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [margen, setMargen] = useState('');
  const [stock, setStock] = useState('');
  const [unidadMedida, setUnidadMedida] = useState<'unid' | 'kg'>('unid');
  const [categoria, setCategoria] = useState('');
  const [codigo, setCodigo] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [imagenArchivo, setImagenArchivo] = useState<File | null>(null);

  const isAdmin = role === 'admin' || role === 'superadmin';

  const handleCostoChange = (val: string) => {
    setCosto(val);
    const c = parseFloat(val);
    const m = parseFloat(margen);
    if (!isNaN(c) && !isNaN(m)) {
      setPrecio((c + (c * m / 100)).toFixed(2));
    }
  };

  const handleMargenChange = (val: string) => {
    setMargen(val);
    const m = parseFloat(val);
    const c = parseFloat(costo);
    if (!isNaN(m) && !isNaN(c)) {
      setPrecio((c + (c * m / 100)).toFixed(2));
    }
  };

  const handlePrecioChange = (val: string) => {
    setPrecio(val);
    const p = parseFloat(val);
    const c = parseFloat(costo);
    if (!isNaN(p) && !isNaN(c) && c > 0) {
      setMargen((((p - c) / c) * 100).toFixed(2));
    } else {
      setMargen('');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
            setImagenArchivo(compressedFile);
            setImagenUrl(canvas.toDataURL('image/jpeg', 0.8));
          }
        }, 'image/jpeg', 0.8);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Cargar productos desde la API REST
  const recargarProductos = async () => {
    try {
      const prods = await getProducts();
      if (prods && Array.isArray(prods) && prods.length > 0) {
        setProductos(prods);
      }
    } catch (err) {
      console.warn("Aviso al cargar productos desde la API:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    recargarProductos();
  }, []);

  // Cargar archivo JSON local
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
        throw new Error("El archivo no contiene productos.");
      }

      setProductos(prods);
      try {
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(prods));
      } catch {}

      toast.success(`🎉 ¡Cargados ${prods.length} productos en memoria! Haz clic en "Sincronizar con Servidor" para enviarlos a la VPS.`, { id: toastId, duration: 6000 });
      setCargando(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al procesar el archivo JSON", { id: toastId });
    }
  };

  // Sincronizar catálogo masivamente con el nuevo servidor VPS por lotes
  const handleSincronizarConServidor = async () => {
    if (productos.length === 0) {
      toast.error("No hay productos cargados en memoria para sincronizar.");
      return;
    }

    setSincronizando(true);
    const toastId = toast.loading(`Preparando sincronización por lotes con el servidor VPS...`);
    try {
      const res = await migrarTodoAVPS(
        {
          productos: productos,
          config: { tasa_dolar: tasaDolar || 50 }
        },
        (msg) => {
          toast.loading(msg, { id: toastId });
        }
      );
      toast.success(`🚀 ¡Sincronización perfecta! ${res.totalProductos || productos.length} productos guardados en la VPS de DigitalOcean.`, {
        id: toastId,
        duration: 6000
      });
    } catch (err: any) {
      console.error("Error sincronizando catálogo:", err);
      toast.error(err.message || "Error al sincronizar con el servidor. Verifica que el backend esté activo.", {
        id: toastId,
        duration: 6000
      });
    } finally {
      setSincronizando(false);
    }
  };

  const prodFiltrados = (productos || []).filter(p => {
    if (!p) return false;
    const term = (busqueda || '').toLowerCase();
    const matchNombre = (p.nombre || '').toLowerCase().includes(term);
    const matchRef = p.codigo_barras && (p.codigo_barras || '').toLowerCase().includes(term);
    return matchNombre || matchRef;
  });

  const abrirModal = (prod?: Producto & { costo_usd?: number }) => {
    setImagenArchivo(null);
    if (prod) {
      setEditandoId(prod.id);
      setNombre(prod.nombre);
      setPrecio(prod.precio_usd.toString());
      setCosto(prod.costo_usd?.toString() || '');
      setStock(prod.stock.toString());
      setUnidadMedida(prod.unidad_medida || 'unid');
      setCategoria(prod.categoria || '');
      setCodigo(prod.codigo_barras);
      setImagenUrl(prod.imagen_url || '');

      if (prod.costo_usd && prod.costo_usd > 0) {
        setMargen((((prod.precio_usd - prod.costo_usd) / prod.costo_usd) * 100).toFixed(2));
      } else {
        setMargen('');
      }
    } else {
      setEditandoId(null);
      setNombre('');
      setPrecio('');
      setCosto('');
      setStock('');
      setUnidadMedida('unid');
      setCategoria('');
      setCodigo('');
      setImagenUrl('');
      setMargen('');
    }
    setModalAbierto(true);
  };

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading("Guardando producto en el servidor...");
    setGuardando(true);
    
    try {
      const prodData = {
        nombre: nombre.trim(),
        precio_usd: Number(precio) || 0,
        costo_usd: Number(costo) || 0,
        stock: Number(stock) || 0,
        unidad_medida: unidadMedida,
        categoria: categoria || 'Sin Categoría',
        codigo_barras: (codigo || "N/A").trim(),
        imagen_url: imagenUrl || ""
      };

      let prodGuardado: Producto & { costo_usd?: number };

      if (editandoId) {
        // PUT /api/products/:id
        prodGuardado = await updateProduct(editandoId, prodData);
        setProductos(prev => prev.map(p => p.id === editandoId ? { ...p, ...prodGuardado } : p));
        toast.success("Producto actualizado correctamente", { id: loadingToast });
      } else {
        // POST /api/products
        prodGuardado = await createProduct(prodData);
        setProductos(prev => [prodGuardado, ...prev]);
        toast.success("Producto añadido con éxito al catálogo", { id: loadingToast });
      }
      
      setModalAbierto(false);
    } catch (err: any) {
      console.error("Error al guardar producto:", err);
      toast.error(err.message || "Error al guardar producto en el servidor.", { id: loadingToast });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarProducto = async (id: string) => {
    if (!confirm("¿Seguro que desea eliminar este producto?")) return;
    try {
      // DELETE /api/products/:id
      await deleteProduct(id);
      setProductos(prev => prev.filter(p => p.id !== id));
      toast.success("Producto eliminado del inventario");
    } catch (err) {
      toast.error("Error al eliminar producto del servidor");
    }
  };

  const descargarCatalogo = async () => {
    const loadingToast = toast.loading("Generando catálogo...");
    try {
      let allProductos = productos;
      if (!allProductos || allProductos.length === 0) {
        allProductos = await getProducts();
      }

      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text('LISTAS DE PRECIOS', 105, 15, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generado el: ${new Date().toLocaleDateString()}  -  Tasa: ${formatBs(tasaDolar)}`, 105, 20, { align: 'center' });

      const categorias = Array.from(new Set(allProductos.map(p => p.categoria || 'Sin Categoría'))).sort();
      
      const elements: any[] = [];
      categorias.forEach(cat => {
        const prodsCat = allProductos.filter(p => (p.categoria || 'Sin Categoría') === cat).sort((a,b) => a.nombre.localeCompare(b.nombre));
        if (prodsCat.length === 0) return;
        
        elements.push({ isCategory: true, text: cat });
        prodsCat.forEach(p => {
          elements.push({ 
            isCategory: false, 
            name: p.nombre, 
            price: `${formatUSD(p.precio_usd)} / ${formatBs(p.precio_usd * tasaDolar)}`.replace('Bs. ', 'Bs ')
          });
        });
      });

      const half = Math.ceil(elements.length / 2);
      const leftElements = elements.slice(0, half);
      const rightElements = elements.slice(half);

      const body = [];
      const maxLen = Math.max(leftElements.length, rightElements.length);

      for (let i = 0; i < maxLen; i++) {
        const l = leftElements[i];
        const r = rightElements[i];
        const row = [];
        
        if (l) {
          if (l.isCategory) {
            row.push({ 
              content: l.text, 
              colSpan: 2, 
              styles: { fontStyle: 'italic', textColor: [0,0,0], fillColor: [245,245,245], halign: 'center', fontSize: 11, cellPadding: 2, font: 'helvetica' } 
            });
          } else {
            row.push({ content: l.name, styles: { fontSize: 9 } });
            row.push({ content: l.price, styles: { fontSize: 9 } });
          }
        } else {
          row.push({ content: '' });
          row.push({ content: '' });
        }

        if (r) {
          if (r.isCategory) {
            row.push({ 
              content: r.text, 
              colSpan: 2, 
              styles: { fontStyle: 'italic', textColor: [0,0,0], fillColor: [245,245,245], halign: 'center', fontSize: 11, cellPadding: 2, font: 'helvetica' } 
            });
          } else {
            row.push({ content: r.name, styles: { fontSize: 9 } });
            row.push({ content: r.price, styles: { fontSize: 9 } });
          }
        } else {
          row.push({ content: '' });
          row.push({ content: '' });
        }

        body.push(row);
      }

      autoTable(doc, {
        startY: 25,
        head: [['Producto', 'Precio', 'Producto', 'Precio']],
        body: body,
        theme: 'grid',
        headStyles: { 
          fillColor: [255, 255, 255], 
          textColor: [0, 0, 0], 
          lineColor: [0, 0, 0], 
          lineWidth: 0.1,
          halign: 'center',
          fontStyle: 'bold'
        },
        styles: { 
          lineColor: [0, 0, 0], 
          lineWidth: 0.1,
          textColor: [0, 0, 0],
          cellPadding: 1.5,
          font: 'helvetica'
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 40 },
          2: { cellWidth: 50 },
          3: { cellWidth: 40 }
        },
        margin: { left: 15, right: 15 }
      });

      doc.save('Listas_de_Precios.pdf');
      toast.success("Catálogo generado correctamente", { id: loadingToast });
    } catch (err) {
      console.error(err);
      toast.error("Error al generar catálogo", { id: loadingToast });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header and Actions */}
      <div className="p-4 md:p-6 border-b border-black flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-gray-50/50">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest flex items-center gap-2">
            Catálogo
          </h1>
          <p className="text-[10px] font-mono uppercase text-gray-500 mt-1 font-bold">
            {productos.length} Productos • Servidor VPS REST
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Botón Importar JSON */}
          <label 
            className="bg-yellow-400 text-black border-2 border-black px-3 py-2 font-bold uppercase tracking-wider text-xs hover:bg-black hover:text-white transition-all flex items-center gap-2 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            title="Cargar copia de seguridad JSON desde tu equipo"
          >
            <UploadCloud size={16} /> <span className="hidden sm:inline">Importar JSON</span>
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              onChange={handleSubirCopiaJSON}
            />
          </label>

          {/* Botón Sincronizar con Servidor */}
          <button
            onClick={handleSincronizarConServidor}
            disabled={sincronizando || productos.length === 0}
            className="bg-blue-600 text-white border-2 border-black px-3 py-2 font-bold uppercase tracking-wider text-xs hover:bg-black transition-all flex items-center gap-2 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 cursor-pointer"
            title="Enviar masivamente el catálogo actual al servidor VPS (POST /api/products/bulk)"
          >
            <Server size={16} className={sincronizando ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Sincronizar Servidor</span>
          </button>

          {/* Botón Exportar JSON */}
          <button 
            onClick={async () => {
              const loadingToast = toast.loading("Exportando catálogo completo en JSON...");
              try {
                const data = await exportarProductosJSON(productos);
                descargarJSON(data, 'bibi_store_productos_completos.json');
                toast.success(`¡Descargados ${data.length} productos en JSON!`, { id: loadingToast, duration: 4000 });
              } catch (err) {
                console.error(err);
                toast.error("Error al exportar productos", { id: loadingToast });
              }
            }}
            className="bg-emerald-600 text-white border-2 border-black px-3 py-2 font-bold uppercase tracking-wider text-xs hover:bg-black transition-all flex items-center gap-2 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            title="Exportar base de datos a archivo JSON"
          >
            <FileCode size={16} /> <span className="hidden sm:inline">Exportar JSON</span>
          </button>

          {/* Botón PDF */}
          <button 
            onClick={descargarCatalogo}
            className="bg-black text-white border-2 border-black px-3 py-2 font-bold uppercase tracking-wider text-xs hover:bg-yellow-400 hover:text-black transition-all flex items-center gap-2 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            title="Descargar Catálogo PDF"
          >
            <FileDown size={16} /> <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Buscador */}
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar producto o código..." 
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border-2 border-black rounded-none focus:outline-none focus:border-yellow-500 font-mono text-xs uppercase"
            />
          </div>

          {/* Botón Nuevo Producto */}
          {(isAdmin || role === 'cajero') && (
            <button 
              onClick={() => abrirModal()}
              className="bg-yellow-400 text-black border-2 border-black px-4 py-2 font-bold uppercase tracking-wider text-xs hover:bg-black hover:text-white transition-all flex items-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Nuevo</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid de Productos */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white">
        {cargando && productos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-yellow-400 mb-3"></div>
            <p className="font-mono text-xs uppercase tracking-widest font-black text-gray-500">Cargando Catálogo de Productos...</p>
          </div>
        ) : !cargando && productos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-black bg-yellow-50/50 my-6">
            <Package size={48} className="text-black mb-3" />
            <h3 className="font-black text-base uppercase tracking-wider text-black">Catálogo sin productos</h3>
            <p className="text-xs text-gray-600 max-w-md mt-1 mb-5 font-medium leading-relaxed">
              Carga tu archivo de respaldo <b>bibi_store_productos_completos.json</b> o pulsa &quot;Nuevo&quot; para comenzar a registrar productos en tu nuevo servidor.
            </p>
            <div className="flex gap-3">
              <label className="bg-yellow-400 text-black border-2 border-black px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-black hover:text-white transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                Cargar Archivo JSON
                <input type="file" accept=".json" className="hidden" onChange={handleSubirCopiaJSON} />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {prodFiltrados.map(prod => (
              <div 
                key={prod.id} 
                className="border-2 border-black bg-white p-4 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] bg-yellow-400 border border-black px-2 py-0.5 font-bold uppercase tracking-tighter truncate max-w-[60%]">
                      {prod.categoria || 'Sin Categoría'}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border border-black ${prod.stock <= 5 ? 'bg-red-200 text-red-900' : 'bg-green-100 text-green-900'}`}>
                      {prod.stock} {prod.unidad_medida || 'unid'}
                    </span>
                  </div>

                  {prod.imagen_url && (
                    <div className="h-32 w-full bg-gray-50 border border-black mb-3 overflow-hidden flex items-center justify-center">
                      <img src={prod.imagen_url} alt={prod.nombre} className="h-full w-full object-cover" />
                    </div>
                  )}

                  <h3 className="font-black text-sm uppercase tracking-tight text-black line-clamp-2 mb-2">
                    {prod.nombre}
                  </h3>

                  {prod.codigo_barras && prod.codigo_barras !== 'N/A' && (
                    <p className="text-[10px] font-mono text-gray-500 mb-2 truncate">
                      REF: {prod.codigo_barras}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-200 mt-2">
                  <div className="flex justify-between items-baseline mb-3">
                    <div>
                      <span className="text-lg font-black text-black block leading-none">
                        {formatUSD(prod.precio_usd)}
                      </span>
                      <span className="text-xs font-mono font-bold text-gray-500">
                        {formatBs(prod.precio_usd * tasaDolar)}
                      </span>
                    </div>

                    {isAdmin && typeof prod.costo_usd === 'number' && prod.costo_usd > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 uppercase block">Costo</span>
                        <span className="text-xs font-mono font-bold text-gray-700">
                          {formatUSD(prod.costo_usd)}
                        </span>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => abrirModal(prod)}
                        className="flex-1 py-1.5 bg-yellow-100 border border-black text-black font-black text-[10px] uppercase tracking-wider hover:bg-yellow-400 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit2 size={12} /> Editar
                      </button>
                      <button 
                        onClick={() => eliminarProducto(prod.id)}
                        className="p-1.5 bg-red-100 border border-black text-red-700 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                        title="Eliminar producto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nuevo / Editar Producto */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border-4 border-black p-6 w-full max-w-lg shadow-[8px_8px_0px_rgba(0,0,0,1)] my-8">
            <div className="flex justify-between items-center pb-3 border-b-2 border-black mb-4">
              <h2 className="text-base font-black uppercase tracking-widest text-black">
                {editandoId ? "Editar Producto" : "Nuevo Producto"}
              </h2>
              <button 
                onClick={() => setModalAbierto(false)} 
                className="text-black hover:text-red-500 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={guardarProducto} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Nombre del Producto *</label>
                <input 
                  type="text"
                  required
                  placeholder="EJ. HARINA PAN 1KG"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full p-2.5 border-2 border-black font-bold uppercase text-xs focus:outline-none focus:bg-yellow-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Categoría</label>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    className="w-full p-2.5 border-2 border-black font-bold text-xs bg-white focus:outline-none"
                  >
                    <option value="">Seleccionar...</option>
                    {CATEGORIAS_PRODUCTO.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Unidad de Medida</label>
                  <select
                    value={unidadMedida}
                    onChange={e => setUnidadMedida(e.target.value as 'unid' | 'kg')}
                    className="w-full p-2.5 border-2 border-black font-bold text-xs bg-white focus:outline-none"
                  >
                    <option value="unid">Unidad (Pza)</option>
                    <option value="kg">Kilos (Peso)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {isAdmin && (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Costo USD</label>
                    <input 
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={costo}
                      onChange={e => handleCostoChange(e.target.value)}
                      className="w-full p-2.5 border-2 border-black font-mono font-bold text-xs focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Precio Venta USD *</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={precio}
                    onChange={e => handlePrecioChange(e.target.value)}
                    className="w-full p-2.5 border-2 border-black font-mono font-bold text-xs bg-yellow-50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Stock Actual *</label>
                  <input 
                    type="number"
                    step={unidadMedida === 'kg' ? '0.01' : '1'}
                    required
                    placeholder="0"
                    value={stock}
                    onChange={e => setStock(e.target.value)}
                    className="w-full p-2.5 border-2 border-black font-mono font-bold text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Código de Barras / Referencia</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="EJ. 759100012345"
                    value={codigo}
                    onChange={e => setCodigo(e.target.value)}
                    className="flex-1 p-2.5 border-2 border-black font-mono text-xs uppercase focus:outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => setScannerAbierto(true)}
                    className="px-3 bg-black text-white text-xs font-bold uppercase flex items-center gap-1 hover:bg-yellow-400 hover:text-black transition-colors"
                  >
                    <Scan size={14} /> Escanear
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider mb-1">Foto del Producto</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:border-2 file:border-black file:text-xs file:font-black file:bg-yellow-400 file:uppercase file:cursor-pointer"
                />
                {imagenUrl && (
                  <div className="mt-2 h-20 w-20 border-2 border-black overflow-hidden relative">
                    <img src={imagenUrl} alt="Preview" className="h-full w-full object-cover" />
                    <button 
                      type="button" 
                      onClick={() => setImagenUrl('')}
                      className="absolute top-0 right-0 bg-red-600 text-white p-0.5 text-[10px]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t-2 border-black flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="flex-1 py-3 border-2 border-black font-black uppercase tracking-wider text-xs hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 py-3 bg-yellow-400 border-2 border-black text-black font-black uppercase tracking-wider text-xs hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_rgba(0,0,0,1)] cursor-pointer"
                >
                  {guardando ? "Guardando..." : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {scannerAbierto && (
        <Scanner 
          onScan={(code) => {
            setCodigo(code);
            setScannerAbierto(false);
            toast.success(`Código escaneado: ${code}`);
          }}
          onClose={() => setScannerAbierto(false)}
          title="Escanear Código de Producto"
        />
      )}
    </div>
  );
}
