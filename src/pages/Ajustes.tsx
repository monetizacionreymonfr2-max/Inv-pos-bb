import React, { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { Settings, Save, Download, Copy, FileCode, X, Check, Database, UploadCloud, AlertCircle, Server, Terminal, ExternalLink, ShieldCheck, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { exportarProductosJSON, descargarJSON, ProductoExportJSON } from '../lib/exportProductos';
import { checkVPSOnline, migrarTodoAVPS, VPSStatus } from '../lib/vpsService';

export default function Ajustes() {
  const { tasaDolar, actualizarTasa } = useConfig();
  const { role } = useAuth();
  const [nuevaTasa, setNuevaTasa] = useState('');
  const [guardando, setGuardando] = useState(false);
  
  const [exportando, setExportando] = useState(false);
  const [exportData, setExportData] = useState<ProductoExportJSON[] | null>(null);
  const [modalExportAbierto, setModalExportAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Estados para VPS Autónomo (DigitalOcean)
  const [vpsStatus, setVpsStatus] = useState<VPSStatus>({ online: false });
  const [migrandoVPS, setMigrandoVPS] = useState(false);
  const [copiadoComandoActivarBackend, setCopiadoComandoActivarBackend] = useState(false);

  // Estados para Despliegue en VPS
  const [vpsIp, setVpsIp] = useState('143.198.163.70');
  const [copiadoVpsSsh, setCopiadoVpsSsh] = useState(false);
  const [copiadoVpsComandoDirecto, setCopiadoVpsComandoDirecto] = useState(false);

  useEffect(() => {
    if (tasaDolar) {
      setNuevaTasa(tasaDolar.toString());
    }
  }, [tasaDolar]);

  useEffect(() => {
    checkVPSOnline().then(setVpsStatus);
    const interval = setInterval(() => {
      checkVPSOnline().then(setVpsStatus);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleMigrarAVPS = async () => {
    setMigrandoVPS(true);
    const loadingToast = toast.loading("Preparando catálogo y enviando a la VPS de DigitalOcean...");
    try {
      let prods: any[] = [];
      const cached = localStorage.getItem('bibi_store_cached_productos');
      if (cached) {
        try { prods = JSON.parse(cached); } catch {}
      }

      if (prods.length === 0) {
        prods = await exportarProductosJSON();
      }

      if (prods.length === 0) {
        throw new Error("No hay productos cargados en memoria. Abre la pantalla de Inventario primero.");
      }

      const res = await migrarTodoAVPS(
        {
          productos: prods,
          config: { tasa_dolar: Number(nuevaTasa) || tasaDolar || 50 }
        },
        (msg) => {
          toast.loading(msg, { id: loadingToast });
        }
      );

      toast.success(`🎉 ¡Migración Perfecta! ${res.totalProductos} productos guardados en la VPS de DigitalOcean.`, {
        id: loadingToast,
        duration: 8000
      });
      checkVPSOnline().then(setVpsStatus);
    } catch (err: any) {
      console.error("Error migrando a VPS:", err);
      toast.error(err.message || "Error al migrar a la VPS. Asegúrate de que el servidor esté activo.", {
        id: loadingToast,
        duration: 7000
      });
    } finally {
      setMigrandoVPS(false);
    }
  };

  const handleSubirCopiaJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Restaurando catálogo desde archivo JSON...");
    try {
      const text = await file.text();
      let parsed = JSON.parse(text);
      let rawProds: any[] = [];
      if (Array.isArray(parsed)) {
        rawProds = parsed;
      } else if (parsed && Array.isArray(parsed.productos)) {
        rawProds = parsed.productos;
      } else if (parsed && Array.isArray(parsed.products)) {
        rawProds = parsed.products;
      } else if (parsed && Array.isArray(parsed.data)) {
        rawProds = parsed.data;
      } else if (parsed && Array.isArray(parsed.items)) {
        rawProds = parsed.items;
      } else if (parsed && typeof parsed === 'object') {
        const possibleKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (possibleKey) {
          rawProds = parsed[possibleKey];
        } else {
          rawProds = [parsed];
        }
      } else {
        throw new Error("El archivo no contiene una lista de productos válida.");
      }

      if (rawProds.length === 0) {
        throw new Error("El archivo JSON no contiene productos.");
      }

      const prods = rawProds.map((p, idx) => ({
        id: String(p.id || p._id || `prod_${Date.now()}_${idx}`),
        nombre: String(p.nombre || p.name || p.title || p.descripcion || `Producto ${idx + 1}`),
        precio_usd: Number(p.precio_usd !== undefined ? p.precio_usd : (p.precio !== undefined ? p.precio : (p.price !== undefined ? p.price : 0))) || 0,
        costo_usd: Number(p.costo_usd !== undefined ? p.costo_usd : (p.costo !== undefined ? p.costo : (p.cost !== undefined ? p.cost : 0))) || 0,
        stock: Number(p.stock !== undefined ? p.stock : (p.existencia !== undefined ? p.existencia : (p.cantidad !== undefined ? p.cantidad : 0))) || 0,
        unidad_medida: (p.unidad_medida === 'kg' || p.unidad === 'kg') ? 'kg' : 'unid',
        categoria: p.categoria || p.category || 'Sin Categoría',
        codigo_barras: String(p.codigo_barras || p.codigo || p.barcode || p.ref || `N/A_${idx}`),
        imagen_url: String(p.imagen_url || p.imagen || p.image || p.photo || '')
      }));

      try {
        localStorage.setItem('bibi_store_cached_productos', JSON.stringify(prods));
      } catch {}

      const res = await migrarTodoAVPS(
        {
          productos: prods,
          config: { tasa_dolar: Number(nuevaTasa) || tasaDolar || 50 }
        },
        (msg) => {
          toast.loading(msg, { id: toastId });
        }
      );

      toast.success(`🎉 ¡Restauración completa! ${res.totalProductos || prods.length} productos guardados en tu VPS y en este navegador.`, { id: toastId, duration: 8000 });
      checkVPSOnline().then(setVpsStatus);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al procesar el archivo JSON", { id: toastId });
    }
  };

  const guardarAjustes = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const loadingToast = toast.loading("Actualizando tasa oficial...");
    try {
      const val = Number(nuevaTasa);
      if (!val || val <= 0) {
        toast.error("Por favor ingresa una tasa válida mayor a 0", { id: loadingToast });
        return;
      }
      await actualizarTasa(val);
      toast.success(`🎉 Tasa oficial actualizada a Bs. ${val}`, { id: loadingToast });
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar la tasa", { id: loadingToast });
    } finally {
      setGuardando(false);
    }
  };

  const handleExportarJSON = async () => {
    setExportando(true);
    const loadingToast = toast.loading("Exportando catálogo completo con fotos y costos...");
    try {
      let cached: any[] | undefined;
      try {
        const s = localStorage.getItem('bibi_store_cached_productos');
        if (s) cached = JSON.parse(s);
      } catch {}
      const data = await exportarProductosJSON(cached);
      setExportData(data);
      descargarJSON(data, 'bibi_store_productos_completos.json');
      toast.success(`¡Exportados ${data.length} productos con fotos y costos!`, { id: loadingToast, duration: 5000 });
      setModalExportAbierto(true);
    } catch (err: any) {
      console.error("Error en handleExportarJSON:", err);
      const errMsg = err?.message || "Error al exportar productos";
      toast.error(errMsg, { id: loadingToast });
    } finally {
      setExportando(false);
    }
  };

  const copiarAlPortapapeles = () => {
    if (!exportData) return;
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopiado(true);
    toast.success("JSON copiado al portapapeles");
    setTimeout(() => setCopiado(false), 2000);
  };

  const copiarTexto = (texto: string, setEstado: (v: boolean) => void, mensaje: string) => {
    navigator.clipboard.writeText(texto);
    setEstado(true);
    toast.success(mensaje);
    setTimeout(() => setEstado(false), 2000);
  };

  const descargarArchivoTexto = (nombre: string, contenido: string, tipo = 'text/plain') => {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Descargado ${nombre}`);
  };

  const getDeployScriptContent = () => `#!/usr/bin/env bash
# SCRIPT DE DESPLIEGUE AUTOMÁTICO DE BIBI STORE EN DIGITALOCEAN
# IP: ${vpsIp}
set -e
if [ "$EUID" -ne 0 ]; then echo "Ejecuta como root (o sudo)"; exit 1; fi

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update -y && apt-get install -y curl git ufw nginx unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs

ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

mkdir -p /var/www/bibi-store && cd /var/www/bibi-store
if [ -f "package.json" ]; then
  export NODE_OPTIONS="--max-old-space-size=768"
  npm install && npm run build
fi

echo "========================================================="
echo "¡Bibi Store activo y en línea en http://${vpsIp}!"
echo "========================================================="
`;

  const getNginxConfContent = () => `server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${vpsIp} localhost;

    root /var/www/bibi-store/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml image/svg+xml;

    location ~* \\.(?:ico|css|js|gif|jpe?g|png|woff2?|svg)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location ~* (sw\\.js|registerSW\\.js|manifest\\.webmanifest|index\\.html)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;

  return (
    <div className="flex flex-col h-full bg-white max-w-4xl mx-auto w-full border-x-2 border-black overflow-y-auto pb-24">
      <div className="p-6 border-b-2 border-black flex items-center gap-3 bg-gray-50">
        <Settings size={32} />
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-black">Ajustes del Sistema</h1>
          <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mt-1">Configuración general y Servidor DigitalOcean</p>
        </div>
      </div>

      <div className="p-6 space-y-8 flex-1 overflow-y-auto">
        <form onSubmit={guardarAjustes} className="space-y-6">
          <section className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] relative">
            <label className="block text-xl font-extrabold text-black mb-2 uppercase tracking-tight">Tasa de Cambio (VED)</label>
            <p className="text-xs font-mono text-gray-500 mb-6 uppercase tracking-widest">Esta tasa se usará en toda la aplicación para calcular los precios en Bolívares.</p>
            
            <div className="flex flex-col sm:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <label className="block text-[10px] font-black uppercase tracking-widest text-black mb-1">Valor Oficial / USD</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">Bs.</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="1"
                    required
                    value={nuevaTasa}
                    onChange={e => setNuevaTasa(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 text-xl font-mono font-bold border-2 border-black rounded-none focus:outline-none focus:border-yellow-400 bg-gray-50 transition-colors"
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={guardando || !nuevaTasa || Number(nuevaTasa) <= 0}
                className="w-full sm:w-auto bg-black text-white hover:bg-yellow-400 hover:text-black border-2 border-black disabled:bg-gray-400 font-bold px-8 py-4 uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {guardando ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <><Save size={20} /> Guardar</>
                )}
              </button>
            </div>
          </section>

          {/* VPS DigitalOcean Deployment & Management Section */}
          <section className="bg-gradient-to-br from-emerald-50 to-teal-50 border-4 border-black p-6 flex flex-col gap-5 shadow-[8px_8px_0px_rgba(0,0,0,1)] relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500 text-white border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <Server size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black uppercase tracking-widest text-black">
                      Servidor DigitalOcean VPS (Exclusivo)
                    </h2>
                    <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-widest border border-black">
                      100% Independiente
                    </span>
                  </div>
                  <p className="text-xs font-mono text-gray-700 uppercase tracking-widest mt-0.5">
                    Droplet Activo • IP: {vpsIp}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-black">IP VPS:</label>
                <input 
                  type="text"
                  value={vpsIp}
                  onChange={e => setVpsIp(e.target.value)}
                  className="px-2 py-1 border-2 border-black font-mono text-xs font-bold bg-white focus:outline-none w-36"
                  placeholder="143.198.163.70"
                />
              </div>
            </div>

            {/* PANEL DE MIGRACIÓN AUTÓNOMA 1-CLIC */}
            <div className="bg-white border-4 border-black p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black pb-3">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-700 block">
                    ★ BACKEND AUTÓNOMO DIGITALOCEAN
                  </span>
                  <h3 className="text-lg font-black uppercase tracking-tight text-black mt-0.5">
                    Sincronización de Catálogo en la VPS
                  </h3>
                </div>
                <div>
                  {vpsStatus.online ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 border-2 border-emerald-600 font-mono text-xs font-black uppercase">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Servidor VPS En Línea ({vpsStatus.totalProductos ?? 0} prods)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 border-2 border-amber-600 font-mono text-xs font-bold uppercase">
                      <AlertCircle size={14} /> Verificando Servidor VPS...
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs font-mono text-gray-700 leading-relaxed">
                Este botón transfiere todos tus productos (con fotos, precios de venta, costos en dólares, existencias y códigos de barra) directamente al disco duro de tu VPS en DigitalOcean.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleMigrarAVPS}
                  disabled={migrandoVPS}
                  className="flex-1 bg-emerald-600 hover:bg-black text-white font-black py-3.5 px-6 border-2 border-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shadow-[3px_3px_0px_rgba(0,0,0,1)] disabled:opacity-50"
                >
                  {migrandoVPS ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <UploadCloud size={18} />
                  )}
                  {migrandoVPS ? "Sincronizando con la VPS..." : "🚀 Sincronizar Catálogo con la VPS"}
                </button>

                <button
                  type="button"
                  onClick={handleExportarJSON}
                  disabled={exportando}
                  className="bg-black hover:bg-yellow-400 hover:text-black text-white font-bold py-3.5 px-5 border-2 border-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shadow-[3px_3px_0px_rgba(0,0,0,1)] disabled:opacity-50 whitespace-nowrap"
                  title="Descargar copia de seguridad completa con fotos y costos"
                >
                  <Download size={18} />
                  <span>💾 Descargar Copia Maestra (JSON)</span>
                </button>
              </div>

              {/* Opción Directa: Cargar archivo de respaldo JSON */}
              <div className="bg-yellow-50 border-2 border-black p-4 space-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database size={18} className="text-black" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-black">
                      Restaurar con archivo JSON de respaldo
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono bg-yellow-400 border border-black px-1.5 py-0.5 font-bold uppercase">
                    DigitalOcean VPS
                  </span>
                </div>
                <p className="text-xs font-mono text-gray-700 leading-relaxed">
                  ¿Tienes tu archivo <strong>bibi_store_productos_completos.json</strong>? Selecciónalo aquí abajo para cargarlo directamente en tu servidor VPS y en este navegador.
                </p>
                <div>
                  <label className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-black hover:text-white text-black font-black py-3 px-5 border-2 border-black uppercase tracking-widest text-xs transition-all shadow-[3px_3px_0px_rgba(0,0,0,1)] cursor-pointer">
                    <UploadCloud size={16} />
                    <span>📂 Cargar bibi_store_productos_completos.json</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={handleSubirCopiaJSON}
                    />
                  </label>
                </div>
              </div>

              {/* Comando para activar el backend y actualizar en la VPS */}
              <div className="bg-gray-900 text-gray-100 p-3.5 font-mono text-xs border-2 border-black space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <Terminal size={14} /> Comando para actualizar Backend en tu VPS:
                  </span>
                  <button
                    type="button"
                    onClick={() => copiarTexto(
                      "curl -fsSL https://raw.githubusercontent.com/monetizacionreymonfr2-max/Bibi-Store/main/public/actualizar.sh | bash",
                      setCopiadoComandoActivarBackend,
                      "¡Comando copiado!"
                    )}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                  >
                    {copiadoComandoActivarBackend ? <Check size={12} /> : <Copy size={12} />}
                    {copiadoComandoActivarBackend ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="text-yellow-300 break-all select-all font-bold">
                  curl -fsSL https://raw.githubusercontent.com/monetizacionreymonfr2-max/Bibi-Store/main/public/actualizar.sh | bash
                </div>
              </div>
            </div>

            {/* Especificaciones y optimización de memoria */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border-2 border-black p-3">
                <span className="text-[10px] font-black uppercase text-gray-500 block">Arquitectura</span>
                <span className="text-xs font-bold font-mono text-black">Express API + Nginx SPA</span>
                <p className="text-[10px] text-gray-500 mt-1">Servidor 100% dedicado en DigitalOcean.</p>
              </div>
              <div className="bg-white border-2 border-black p-3">
                <span className="text-[10px] font-black uppercase text-gray-500 block">Memoria Swap</span>
                <span className="text-xs font-bold font-mono text-emerald-700">1GB Swap Activo</span>
                <p className="text-[10px] text-gray-500 mt-1">Optimizado para estabilidad total.</p>
              </div>
              <div className="bg-white border-2 border-black p-3">
                <span className="text-[10px] font-black uppercase text-gray-500 block">Seguridad</span>
                <span className="text-xs font-bold font-mono text-black">Firewall UFW Configurado</span>
                <p className="text-[10px] text-gray-500 mt-1">Protección SSH y puertos web.</p>
              </div>
            </div>

            {/* Pasos de instalación */}
            <div className="space-y-4">
              {/* Paso 1: Conexión */}
              <div className="bg-white border-2 border-black p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-black text-white font-black text-xs flex items-center justify-center">1</span>
                    <h3 className="text-xs font-black uppercase tracking-widest text-black">Conectarse al Droplet</h3>
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">Vía Web Console o Terminal</span>
                </div>
                <p className="text-xs font-mono text-gray-600">
                  En tu panel de DigitalOcean, haz clic en el botón azul <strong className="text-black">"Web Console"</strong> de tu droplet, o ejecuta desde tu terminal:
                </p>
                <div className="flex items-center justify-between bg-gray-900 text-green-400 p-2.5 font-mono text-xs border border-black">
                  <span>ssh root@{vpsIp}</span>
                  <button
                    type="button"
                    onClick={() => copiarTexto(`ssh root@${vpsIp}`, setCopiadoVpsSsh, "Comando SSH copiado")}
                    className="ml-2 bg-gray-800 hover:bg-gray-700 text-white px-2 py-1 text-[11px] font-bold uppercase flex items-center gap-1 transition-colors"
                  >
                    {copiadoVpsSsh ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    {copiadoVpsSsh ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              {/* Paso 2: Script Automático */}
              <div className="bg-white border-2 border-black p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-black text-white font-black text-xs flex items-center justify-center">2</span>
                    <h3 className="text-xs font-black uppercase tracking-widest text-black">Comando de Despliegue en la VPS</h3>
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">Instalación 100% Automática</span>
                </div>
                <p className="text-xs font-mono text-gray-600">
                  Copia y pega este comando en la consola de tu VPS para desplegar Bibi Store en DigitalOcean:
                </p>
                
                <div className="bg-gray-900 text-gray-100 p-3 font-mono text-[11px] border border-black space-y-2 overflow-x-auto">
                  <div className="text-emerald-400 font-bold"># Comando de 1 solo clic:</div>
                  <div className="text-yellow-300 break-all select-all font-bold">
                    curl -fsSL https://raw.githubusercontent.com/monetizacionreymonfr2-max/Bibi-Store/main/public/actualizar.sh | bash
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => copiarTexto(
                      `curl -fsSL https://raw.githubusercontent.com/monetizacionreymonfr2-max/Bibi-Store/main/public/actualizar.sh | bash`,
                      setCopiadoVpsComandoDirecto,
                      "¡Comando copiado!"
                    )}
                    className="bg-black text-white hover:bg-emerald-600 border-2 border-black font-bold px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                  >
                    {copiadoVpsComandoDirecto ? <Check size={16} /> : <Copy size={16} />}
                    {copiadoVpsComandoDirecto ? "¡Comando Copiado!" : "Copiar Comando de 1 Clic"}
                  </button>

                  <button
                    type="button"
                    onClick={() => descargarArchivoTexto('deploy-vps.sh', getDeployScriptContent(), 'application/x-sh')}
                    className="bg-white text-black hover:bg-black hover:text-white border-2 border-black font-bold px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                  >
                    <Download size={16} /> Descargar deploy-vps.sh
                  </button>

                  <button
                    type="button"
                    onClick={() => descargarArchivoTexto('nginx.conf', getNginxConfContent(), 'text/plain')}
                    className="bg-white text-black hover:bg-black hover:text-white border-2 border-black font-bold px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                  >
                    <Download size={16} /> Descargar nginx.conf
                  </button>
                </div>
              </div>

              {/* Paso 3: Acceso Final */}
              <div className="bg-white border-2 border-black p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-1.5">
                    <Globe size={16} className="text-emerald-600" />
                    Tu URL de Acceso en la VPS:
                  </h4>
                  <p className="text-xs font-mono text-gray-600 mt-0.5">
                    Tu tienda corre en el servidor DigitalOcean:
                  </p>
                </div>
                <a
                  href={`http://${vpsIp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 font-black text-xs uppercase tracking-widest border-2 border-black flex items-center gap-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all"
                >
                  Abrir http://{vpsIp} <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </section>

          {/* Export section */}
          <section className="bg-emerald-50 border-4 border-emerald-600 p-6 flex flex-col gap-4 shadow-[8px_8px_0px_rgba(5,150,105,1)] relative">
            <h2 className="text-xl font-black uppercase tracking-widest text-black flex items-center gap-2">
              <FileCode className="text-emerald-700" size={24} /> Exportar Catálogo Completo
            </h2>
            <p className="text-xs font-mono text-gray-700 uppercase tracking-widest leading-relaxed">
              Obtiene los datos de productos, costos y existencias y genera el archivo <code className="bg-white px-1 py-0.5 border border-black font-bold text-emerald-800">bibi_store_productos_completos.json</code> para respaldar tu inventario en DigitalOcean.
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <button 
                type="button"
                disabled={exportando}
                onClick={handleExportarJSON}
                className="bg-black text-white hover:bg-emerald-500 hover:text-black border-2 border-black font-bold px-6 py-4 uppercase tracking-widest flex items-center justify-center gap-2 transition-all text-sm disabled:opacity-50 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
              >
                {exportando ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <><Download size={20} /> Exportar y Descargar JSON</>
                )}
              </button>

              {exportData && (
                <button
                  type="button"
                  onClick={() => setModalExportAbierto(true)}
                  className="bg-white text-black hover:bg-black hover:text-white border-2 border-black font-bold px-6 py-4 uppercase tracking-widest flex items-center justify-center gap-2 transition-all text-sm"
                >
                  Ver / Copiar JSON
                </button>
              )}
            </div>
          </section>

          <section className="bg-yellow-50 border-4 border-yellow-400 p-6 flex flex-col gap-4 shadow-[8px_8px_0px_rgba(250,204,21,1)] relative group">
             <h2 className="text-xl font-black uppercase tracking-widest text-black flex items-center gap-2">
                🛍️ Catálogo Online
             </h2>
             <p className="text-xs font-mono text-gray-600 uppercase tracking-widest flex items-center gap-1">
                Comparte este enlace con tus clientes para ventas online por WhatsApp.
             </p>
             <div className="flex flex-col sm:flex-row gap-3">
               <input 
                 readOnly 
                 value={`${window.location.origin}/tienda`}
                 className="flex-1 bg-white border-2 border-yellow-400 p-3 font-mono text-sm focus:outline-none focus:border-black transition-colors text-black"
               />
               <div className="flex gap-2">
                 <button 
                    type="button"
                    onClick={() => {
                       navigator.clipboard.writeText(`${window.location.origin}/tienda`);
                       toast.success("Enlace copiado");
                    }}
                    className="flex-1 sm:flex-none justify-center font-bold px-6 py-3 uppercase tracking-widest border-2 border-black bg-white hover:bg-black hover:text-white transition-all text-sm"
                 >
                   Copiar
                 </button>
                 <a 
                   href="/tienda" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="flex-1 sm:flex-none flex items-center justify-center font-bold px-6 py-3 uppercase tracking-widest border-2 border-black bg-yellow-400 hover:bg-black hover:text-white transition-all text-sm"
                 >
                   Abrir
                 </a>
               </div>
             </div>
          </section>
        </form>
      </div>

      {/* Modal Visualizador / Copiador de JSON */}
      {modalExportAbierto && exportData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white border-4 border-black w-full max-w-3xl max-h-[85vh] flex flex-col shadow-[12px_12px_0px_rgba(0,0,0,1)]">
            <div className="p-4 border-b-2 border-black bg-emerald-400 flex justify-between items-center">
              <h3 className="font-black uppercase tracking-wider text-black flex items-center gap-2">
                <FileCode size={20} /> bibi_store_productos_completos.json ({exportData.length} ítems)
              </h3>
              <button 
                onClick={() => setModalExportAbierto(false)}
                className="bg-black text-white p-1 hover:bg-red-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto bg-gray-900">
              <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(exportData, null, 2)}
              </pre>
            </div>

            <div className="p-4 border-t-2 border-black bg-gray-100 flex flex-wrap gap-3 justify-between items-center">
              <p className="text-xs font-mono text-gray-600 uppercase">
                {exportData.length} productos listos para tu VPS
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copiarAlPortapapeles}
                  className="bg-black text-white border-2 border-black px-4 py-2 font-bold uppercase text-xs hover:bg-yellow-400 hover:text-black transition-all flex items-center gap-2"
                >
                  {copiado ? <Check size={16} /> : <Copy size={16} />}
                  {copiado ? "Copiado!" : "Copiar JSON"}
                </button>
                <button
                  onClick={() => descargarJSON(exportData, 'bibi_store_productos_completos.json')}
                  className="bg-emerald-500 text-black border-2 border-black px-4 py-2 font-bold uppercase text-xs hover:bg-black hover:text-white transition-all flex items-center gap-2"
                >
                  <Download size={16} /> Volver a Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
