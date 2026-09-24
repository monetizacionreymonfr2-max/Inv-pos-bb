import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Plus, Trash2, KeyRound, Copy, Check, Save, Lock, Server } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAccessCodes, saveAccessCode, deleteAccessCode, getApiBaseUrl, setApiBaseUrl, checkServerHealth } from '../services/api';

interface CodigoAcceso {
  id: string;
  rol: 'admin' | 'cajero';
  usado: boolean;
  usadoPor?: string;
  creadoPor: string;
  creadoEn: number;
}

export default function PanelCreador() {
  const { role, user, pinesConfig, actualizarPines } = useAuth();
  const [codigos, setCodigos] = useState<CodigoAcceso[]>([]);
  const [generando, setGenerando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Estados locales para edición de PINs
  const [pinAdmin, setPinAdmin] = useState(pinesConfig.pinAdmin || '2026');
  const [pinCajero, setPinCajero] = useState(pinesConfig.pinCajero || '1234');
  const [pinSuperadmin, setPinSuperadmin] = useState(pinesConfig.pinSuperadmin || '7799');
  const [guardandoPines, setGuardandoPines] = useState(false);

  // Estado para URL de la API del servidor
  const [customApiUrl, setCustomApiUrl] = useState(getApiBaseUrl());
  const [serverStatus, setServerStatus] = useState<{ online: boolean; totalProductos?: number } | null>(null);

  useEffect(() => {
    setPinAdmin(pinesConfig.pinAdmin || '2026');
    setPinCajero(pinesConfig.pinCajero || '1234');
    setPinSuperadmin(pinesConfig.pinSuperadmin || '7799');
  }, [pinesConfig]);

  const cargarCodigos = async () => {
    try {
      const list = await getAccessCodes();
      if (Array.isArray(list)) {
        setCodigos(list.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0)));
      }
    } catch {}
  };

  useEffect(() => {
    if (role !== 'superadmin') return;
    cargarCodigos();
    checkServerHealth().then(setServerStatus);
  }, [role]);

  const handleGuardarPines = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoPines(true);
    const toastId = toast.loading("Guardando nuevos PINs...");
    try {
      const ok = await actualizarPines({
        pinAdmin: pinAdmin.trim(),
        pinCajero: pinCajero.trim(),
        pinSuperadmin: pinSuperadmin.trim()
      });
      if (ok) {
        toast.success("¡PINs de seguridad actualizados con éxito!", { id: toastId });
      } else {
        toast.error("Error al guardar PINs.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar PINs.", { id: toastId });
    } finally {
      setGuardandoPines(false);
    }
  };

  const generarCodigoConIdPropio = async (rol: 'admin' | 'cajero') => {
    setGenerando(true);
    const toastId = toast.loading("Generando token de acceso...");
    try {
      const codigoRaw = Math.random().toString(36).substring(2, 8).toUpperCase();
      const nuevoCodigo: CodigoAcceso = {
        id: codigoRaw,
        rol,
        usado: false,
        creadoPor: user?.uid || 'superadmin',
        creadoEn: Date.now()
      };

      await saveAccessCode(nuevoCodigo);
      setCodigos(prev => [nuevoCodigo, ...prev]);
      toast.success(`Código ${codigoRaw} generado con éxito`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Error al generar código.", { id: toastId });
    } finally {
      setGenerando(false);
    }
  };

  const copiarAlPortapapeles = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    toast.success(`Copiado: ${texto}`);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  const eliminarCodigo = async (id: string) => {
    if (!confirm('¿Seguro que desea eliminar este código?')) return;
    try {
      await deleteAccessCode(id);
      setCodigos(prev => prev.filter(c => c.id !== id));
      toast.success("Código eliminado");
    } catch (err) {
      toast.error("Error al eliminar código");
    }
  };

  const handleGuardarApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(customApiUrl.trim());
    toast.success("URL base de la API guardada.");
    checkServerHealth().then(setServerStatus);
  };

  if (role !== 'superadmin') {
    return (
      <div className="flex flex-col h-full bg-white max-w-5xl mx-auto w-full items-center justify-center p-6 text-center">
        <ShieldAlert className="text-red-500 mb-4" size={64} />
        <h2 className="text-2xl font-black uppercase tracking-widest mb-2">Acceso Exclusivo Superadmin</h2>
        <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
          Esta sección está restringida al creador/dueño maestro del sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="pb-6 border-b-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-black text-yellow-400 p-1.5 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <ShieldAlert size={20} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-black">
              Panel Creador & Seguridad
            </h1>
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-gray-500 mt-1">
            Control maestro de PINs, tokens de acceso y conexión al servidor VPS
          </p>
        </div>

        {serverStatus && (
          <div className="flex items-center gap-2 border-2 border-black px-3 py-1.5 bg-gray-50 text-xs font-mono">
            <Server size={14} className={serverStatus.online ? "text-green-600" : "text-red-600"} />
            <span>Servidor VPS: <strong>{serverStatus.online ? "ONLINE" : "OFFLINE"}</strong></span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
        {/* Formulario PINs */}
        <div className="border-4 border-black p-6 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b-2 border-black mb-4">
              <Lock className="text-black" size={20} />
              <h2 className="text-base font-black uppercase tracking-wider">PINs de Acceso Fijos</h2>
            </div>
            <p className="text-xs text-gray-600 mb-4 font-medium">
              Configura los números de acceso para cada nivel de permiso. Estos PINs se sincronizan con la base de datos del servidor.
            </p>

            <form onSubmit={handleGuardarPines} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider mb-1">
                  👑 PIN Super Admin (Tu Acceso Maestro)
                </label>
                <input
                  type="text"
                  required
                  value={pinSuperadmin}
                  onChange={e => setPinSuperadmin(e.target.value)}
                  className="w-full p-2.5 border-2 border-black font-mono font-bold text-sm bg-yellow-50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider mb-1">
                  🛍️ PIN Dueña / Administradora
                </label>
                <input
                  type="text"
                  required
                  value={pinAdmin}
                  onChange={e => setPinAdmin(e.target.value)}
                  className="w-full p-2.5 border-2 border-black font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider mb-1">
                  🛒 PIN Cajera (Punto de Venta)
                </label>
                <input
                  type="text"
                  required
                  value={pinCajero}
                  onChange={e => setPinCajero(e.target.value)}
                  className="w-full p-2.5 border-2 border-black font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={guardandoPines}
                className="w-full py-3 bg-yellow-400 border-2 border-black font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
              >
                <Save size={16} />
                {guardandoPines ? "Guardando..." : "Guardar PINs de Seguridad"}
              </button>
            </form>
          </div>
        </div>

        {/* Generador de Tokens Temporales */}
        <div className="border-4 border-black p-6 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b-2 border-black mb-4">
              <KeyRound className="text-black" size={20} />
              <h2 className="text-base font-black uppercase tracking-wider">Tokens de Acceso de 1 Solo Uso</h2>
            </div>
            <p className="text-xs text-gray-600 mb-4 font-medium">
              Genera códigos alfanuméricos de un solo uso para empleados o técnicos.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => generarCodigoConIdPropio('admin')}
                disabled={generando}
                className="py-3 bg-zinc-900 text-white border-2 border-black font-black uppercase text-xs tracking-wider hover:bg-yellow-400 hover:text-black transition-all cursor-pointer flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                <Plus size={14} /> Token Admin
              </button>
              <button
                onClick={() => generarCodigoConIdPropio('cajero')}
                disabled={generando}
                className="py-3 bg-zinc-100 text-black border-2 border-black font-black uppercase text-xs tracking-wider hover:bg-yellow-400 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                <Plus size={14} /> Token Cajero
              </button>
            </div>

            {/* Configuración de URL del Servidor API */}
            <div className="mt-6 pt-4 border-t-2 border-black">
              <h3 className="text-xs font-black uppercase tracking-wider mb-2">Dirección del Servidor API REST</h3>
              <form onSubmit={handleGuardarApiUrl} className="flex gap-2">
                <input
                  type="text"
                  value={customApiUrl}
                  onChange={e => setCustomApiUrl(e.target.value)}
                  placeholder="http://143.198.163.70:3000/api"
                  className="flex-1 p-2 border-2 border-black font-mono text-[11px] focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-black text-white px-3 py-2 text-xs font-black uppercase hover:bg-yellow-400 hover:text-black border-2 border-black transition-colors"
                >
                  Guardar
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Tokens Generados */}
      <div className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-8">
        <h3 className="text-xs font-black uppercase tracking-widest mb-3">Tokens y Códigos Activos ({codigos.length})</h3>
        {codigos.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono italic">No hay tokens creados actualmente.</p>
        ) : (
          <div className="space-y-2">
            {codigos.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 border border-black bg-gray-50 text-xs font-mono">
                <div className="flex items-center gap-3">
                  <span className="font-black text-sm text-black tracking-widest">{c.id}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-yellow-300 border border-black">{c.rol}</span>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 border border-black ${c.usado ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}`}>
                    {c.usado ? 'Usado' : 'Disponible'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copiarAlPortapapeles(c.id, c.id)}
                    className="p-1 border border-black bg-white hover:bg-yellow-400 cursor-pointer"
                    title="Copiar código"
                  >
                    {copiadoId === c.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => eliminarCodigo(c.id)}
                    className="p-1 border border-black bg-white text-red-600 hover:bg-red-600 hover:text-white cursor-pointer"
                    title="Eliminar token"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
