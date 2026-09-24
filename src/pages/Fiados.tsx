import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Fiado } from '../types';
import { formatUSD, formatBs, cn } from '../lib/utils';
import { Plus, Check, Search, X, Users, CreditCard, History, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useConfig } from '../contexts/ConfigContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getFiados, saveFiado } from '../services/api';

export default function Fiados() {
  const { role } = useAuth();
  const { tasaDolar } = useConfig();
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [expandedHistorial, setExpandedHistorial] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cliente, setCliente] = useState('');
  const [montoUSD, setMontoUSD] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [modalAbono, setModalAbono] = useState<{abierto: boolean, fiadoId: string, cliente: string, deuda: number}>({
    abierto: false,
    fiadoId: '',
    cliente: '',
    deuda: 0
  });
  const [montoAbono, setMontoAbono] = useState('');

  const cargarFiados = async () => {
    setCargando(true);
    try {
      const data = await getFiados();
      if (Array.isArray(data)) {
        setFiados(data.sort((a, b) => b.fecha - a.fecha));
      }
    } catch (err) {
      console.warn("Aviso al cargar fiados:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarFiados();
  }, []);

  const fiadosFiltrados = (fiados || []).filter(f => f && (f.cliente || '').toLowerCase().includes((busqueda || '').toLowerCase()));
  const totalPendiente = (fiados || []).filter(f => f && f.estado === 'pendiente').reduce((acc, curr) => acc + (curr?.monto_usd || 0), 0);

  if (role === 'cajero') {
    return (
      <div className="flex flex-col h-full bg-white max-w-5xl mx-auto w-full items-center justify-center p-6 text-center">
        <Users className="text-gray-300 mb-4" size={64} />
        <h2 className="text-2xl font-black uppercase tracking-widest mb-2">Acceso Restringido</h2>
        <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">No tienes permisos para acceder a los fiados.</p>
      </div>
    );
  }

  const guardarFiadoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const existing = (fiados || []).find(f => f && (f.cliente || '').toLowerCase() === (cliente || '').trim().toLowerCase() && f.estado === 'pendiente');
      
      const nuevoMonto = existing ? existing.monto_usd + Number(montoUSD) : Number(montoUSD);
      const nuevaDesc = existing 
        ? (existing.descripcion ? `${existing.descripcion}, ${descripcion}` : descripcion)
        : descripcion;
      const targetId = existing ? existing.id : `fiado_${Date.now()}`;

      const fiadoObj: Fiado = {
        id: targetId,
        cliente: cliente.trim().toUpperCase(),
        monto_usd: nuevoMonto,
        descripcion: nuevaDesc,
        fecha: Date.now(),
        estado: 'pendiente',
        historial_abonos: existing?.historial_abonos || []
      };

      await saveFiado(fiadoObj);

      setFiados(prev => {
        const filtered = prev.filter(f => f.id !== targetId);
        return [fiadoObj, ...filtered].sort((a, b) => b.fecha - a.fecha);
      });

      setCliente('');
      setMontoUSD('');
      setDescripcion('');
      setModalAbierto(false);
      toast.success(existing ? "Cuenta actualizada con éxito" : "Nuevo fiado registrado");
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar fiado");
    }
  };

  const registrarAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    const abonoNum = Number(montoAbono);
    if (!abonoNum || abonoNum <= 0) {
      toast.error("Monto inválido");
      return;
    }

    try {
      const f = fiados.find(item => item.id === modalAbono.fiadoId);
      if (!f) return;

      const nuevaDeuda = Math.max(0, f.monto_usd - abonoNum);
      const nuevoEstado = nuevaDeuda === 0 ? 'pagado' : 'pendiente';
      const abonoItem = { monto_usd: abonoNum, fecha: Date.now() };
      const nuevoHistorial = [...(f.historial_abonos || []), abonoItem];

      const fiadoActualizado: Fiado = {
        ...f,
        monto_usd: nuevaDeuda,
        estado: nuevoEstado,
        historial_abonos: nuevoHistorial
      };

      await saveFiado(fiadoActualizado);

      setFiados(prev => prev.map(item => item.id === f.id ? fiadoActualizado : item));

      setModalAbono({ abierto: false, fiadoId: '', cliente: '', deuda: 0 });
      setMontoAbono('');
      toast.success(nuevaDeuda === 0 ? "¡Deuda saldada por completo!" : `Abono de ${formatUSD(abonoNum)} registrado`);
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar abono");
    }
  };

  const marcarComoPagado = async (f: Fiado) => {
    if (!confirm(`¿Marcar la cuenta de ${f.cliente} como totalmente pagada?`)) return;
    try {
      const fiadoActualizado: Fiado = {
        ...f,
        monto_usd: 0,
        estado: 'pagado',
        historial_abonos: [...(f.historial_abonos || []), { monto_usd: f.monto_usd, fecha: Date.now() }]
      };

      await saveFiado(fiadoActualizado);

      setFiados(prev => prev.map(item => item.id === f.id ? fiadoActualizado : item));
      toast.success("Cuenta marcada como pagada");
    } catch (err) {
      toast.error("Error al actualizar estado");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="pb-6 border-b-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-black flex items-center gap-2">
            Cuentas por Cobrar (Fiados)
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-gray-500 mt-1">
            Total Pendiente: <span className="font-black text-black">{formatUSD(totalPendiente)}</span> ({formatBs(totalPendiente * tasaDolar)})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarFiados}
            disabled={cargando}
            className="p-2 border-2 border-black hover:bg-yellow-400 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            title="Actualizar datos"
          >
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setModalAbierto(true)}
            className="bg-yellow-400 text-black border-2 border-black px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-black hover:text-white transition-all flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
          >
            <Plus size={16} /> Registrar Fiado
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="my-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por nombre de cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border-2 border-black font-mono text-xs uppercase focus:outline-none focus:border-yellow-500"
          />
        </div>
      </div>

      {/* Lista de Fiados */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
        {fiadosFiltrados.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400 font-mono text-xs">
            No se encontraron registros de cuentas por cobrar.
          </div>
        ) : (
          fiadosFiltrados.map(f => {
            const isPagado = f.estado === 'pagado';
            const isExpanded = expandedHistorial === f.id;
            return (
              <div key={f.id} className={`border-2 border-black p-4 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isPagado ? 'bg-gray-50 opacity-70' : 'bg-white'}`}>
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-black text-sm uppercase tracking-tight text-black">{f.cliente}</h3>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border border-black uppercase ${isPagado ? 'bg-gray-200 text-gray-700' : 'bg-yellow-300 text-black'}`}>
                      {f.estado}
                    </span>
                  </div>

                  <p className="text-2xl font-black text-black leading-none mb-1">
                    {formatUSD(f.monto_usd)}
                  </p>
                  <p className="text-xs font-mono font-bold text-gray-500 mb-3">
                    {formatBs(f.monto_usd * tasaDolar)}
                  </p>

                  {f.descripcion && (
                    <p className="text-xs text-gray-700 font-medium mb-3 bg-gray-50 p-2 border border-gray-200">
                      {f.descripcion}
                    </p>
                  )}

                  <p className="text-[10px] font-mono text-gray-400">
                    Fecha: {format(new Date(f.fecha), 'dd/MM/yyyy')}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-200 mt-3 space-y-2">
                  {!isPagado && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModalAbono({ abierto: true, fiadoId: f.id, cliente: f.cliente, deuda: f.monto_usd })}
                        className="flex-1 py-1.5 bg-yellow-400 border border-black text-black font-black text-xs uppercase hover:bg-black hover:text-white transition-colors cursor-pointer"
                      >
                        Abonar
                      </button>
                      <button
                        onClick={() => marcarComoPagado(f)}
                        className="px-3 py-1.5 bg-emerald-600 border border-black text-white font-black text-xs uppercase hover:bg-black transition-colors cursor-pointer"
                        title="Marcar totalmente pagado"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  )}

                  {f.historial_abonos && f.historial_abonos.length > 0 && (
                    <div>
                      <button
                        onClick={() => setExpandedHistorial(isExpanded ? null : f.id)}
                        className="w-full text-[10px] font-bold text-gray-600 flex items-center justify-between pt-1 uppercase tracking-wider hover:text-black cursor-pointer"
                      >
                        <span>Historial de Abonos ({f.historial_abonos.length})</span>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1 bg-gray-50 p-2 border border-gray-200 text-[10px] font-mono">
                          {f.historial_abonos.map((h, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{format(new Date(h.fecha), 'dd/MM/yyyy')}</span>
                              <span className="font-bold text-emerald-700">+{formatUSD(h.monto_usd)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Nuevo Fiado */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black p-6 w-full max-w-sm shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center pb-3 border-b-2 border-black mb-4">
              <h3 className="font-black text-sm uppercase tracking-widest">Registrar Nuevo Fiado</h3>
              <button onClick={() => setModalAbierto(false)}><X size={18} /></button>
            </div>

            <form onSubmit={guardarFiadoSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Nombre del Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="EJ. JUAN PÉREZ"
                  value={cliente}
                  onChange={e => setCliente(e.target.value)}
                  className="w-full p-2 border-2 border-black font-bold uppercase text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Monto en USD *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={montoUSD}
                  onChange={e => setMontoUSD(e.target.value)}
                  className="w-full p-2 border-2 border-black font-mono font-bold text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Detalle o Concepto</label>
                <input
                  type="text"
                  placeholder="EJ. Harina, arroz y refresco"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  className="w-full p-2 border-2 border-black text-xs focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t-2 border-black flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="flex-1 py-2 border-2 border-black text-xs font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-yellow-400 border-2 border-black text-black text-xs font-black uppercase hover:bg-black hover:text-white"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abonar */}
      {modalAbono.abierto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black p-6 w-full max-w-sm shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center pb-3 border-b-2 border-black mb-4">
              <h3 className="font-black text-sm uppercase tracking-widest">Abono: {modalAbono.cliente}</h3>
              <button onClick={() => setModalAbono({ abierto: false, fiadoId: '', cliente: '', deuda: 0 })}><X size={18} /></button>
            </div>

            <p className="text-xs text-gray-600 mb-3 font-mono">
              Deuda Actual: <strong>{formatUSD(modalAbono.deuda)}</strong> ({formatBs(modalAbono.deuda * tasaDolar)})
            </p>

            <form onSubmit={registrarAbono} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Monto a Abonar (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={montoAbono}
                  onChange={e => setMontoAbono(e.target.value)}
                  className="w-full p-2 border-2 border-black font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t-2 border-black flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalAbono({ abierto: false, fiadoId: '', cliente: '', deuda: 0 })}
                  className="flex-1 py-2 border-2 border-black text-xs font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-yellow-400 border-2 border-black text-black text-xs font-black uppercase hover:bg-black hover:text-white"
                >
                  Confirmar Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
