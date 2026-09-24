import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, FileJson, RefreshCw, HardDrive } from 'lucide-react';
import toast from 'react-hot-toast';

type RestoreState = 'idle' | 'subiendo' | 'procesando' | 'completado' | 'error';

interface RestoreProgress {
  estado: RestoreState;
  progreso: number; // 0 - 100
  mensaje: string;
  totalProcesados?: number;
  errores?: string[];
}

export default function RestaurarRespaldoVPS({ onRestaurado }: { onRestaurado?: () => void }) {
  const [estadoRestore, setEstadoRestore] = useState<RestoreProgress>({
    estado: 'idle',
    progreso: 0,
    mensaje: 'Seleccione un archivo JSON de respaldo para iniciar la restauración en el servidor.'
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      toast.error('Por favor seleccione un archivo JSON válido.');
      return;
    }

    setEstadoRestore({
      estado: 'subiendo',
      progreso: 15,
      mensaje: 'Leyendo archivo JSON y validando estructura...'
    });

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error('El archivo JSON está corrupto o mal formado.');
      }

      let rawItems: any[] = [];
      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (parsed && Array.isArray(parsed.productos)) {
        rawItems = parsed.productos;
      } else if (parsed && Array.isArray(parsed.products)) {
        rawItems = parsed.products;
      } else if (parsed && Array.isArray(parsed.data)) {
        rawItems = parsed.data;
      } else if (parsed && Array.isArray(parsed.items)) {
        rawItems = parsed.items;
      } else if (parsed && typeof parsed === 'object') {
        const foundKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (foundKey) {
          rawItems = parsed[foundKey];
        } else {
          rawItems = [parsed];
        }
      }

      if (rawItems.length === 0) {
        throw new Error('No se encontraron productos en el archivo de respaldo.');
      }

      setEstadoRestore({
        estado: 'procesando',
        progreso: 40,
        mensaje: `Desacoplando imágenes y preparando lotes (Chunks de 50 ítems)...`
      });

      // Dividir en lotes (chunks) de 50 registros para evitar saturar RAM y payload
      const CHUNK_SIZE = 50;
      const chunks: any[][] = [];
      for (let i = 0; i < rawItems.length; i += CHUNK_SIZE) {
        chunks.push(rawItems.slice(i, i + CHUNK_SIZE));
      }

      let totalSuccess = 0;
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const porcentajeChunk = Math.round(40 + ((index + 1) / chunks.length) * 55);

        setEstadoRestore({
          estado: 'procesando',
          progreso: Math.min(porcentajeChunk, 95),
          mensaje: `Procesando lote ${index + 1} de ${chunks.length} (${chunk.length} productos)...`
        });

        const response = await fetch('/api/vps/restore-backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productos: chunk, batchIndex: index, totalBatches: chunks.length }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Error en el servidor al procesar el lote ${index + 1}`);
        }

        const data = await response.json();
        totalSuccess += (data.procesados || chunk.length);
      }

      setEstadoRestore({
        estado: 'completado',
        progreso: 100,
        mensaje: `¡Restauración completada con éxito! ${totalSuccess} productos sincronizados en la base de datos WAL y disco VPS.`,
        totalProcesados: totalSuccess
      });

      toast.success(`🎉 Respaldo restaurado: ${totalSuccess} productos procesados.`);
      if (onRestaurado) onRestaurado();

    } catch (err: any) {
      console.error('Error restaurando respaldo:', err);
      setEstadoRestore({
        estado: 'error',
        progreso: 0,
        mensaje: err.message || 'Error desconocido durante la restauración.'
      });
      toast.error(err.message || 'Error en la restauración');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
          <HardDrive className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Restauración Robusta en Servidor VPS (DigitalOcean)</h3>
          <p className="text-xs text-slate-400">Pipeline con SQLite en modo WAL, desacople físico de imágenes Base64 y procesamiento por lotes (Chunks)</p>
        </div>
      </div>

      <div className="space-y-4">
        {estadoRestore.estado === 'idle' && (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-8 cursor-pointer bg-slate-950/50 hover:bg-slate-900/80 transition-all group">
            <div className="p-3 bg-slate-800 group-hover:bg-emerald-500/10 rounded-full text-slate-400 group-hover:text-emerald-400 transition-colors mb-3">
              <UploadCloud className="w-8 h-8" />
            </div>
            <span className="text-sm font-medium text-slate-200 mb-1">Haz clic para seleccionar o arrastra tu archivo JSON</span>
            <span className="text-xs text-slate-500">Soporta respaldos con imágenes en Base64 (las desacopla automáticamente a disco)</span>
            <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
          </label>
        )}

        {(estadoRestore.estado === 'subiendo' || estadoRestore.estado === 'procesando') && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center space-y-4">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-200">{estadoRestore.mensaje}</p>
              <p className="text-xs text-slate-400">{estadoRestore.progreso}% completado</p>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2.5 transition-all duration-300 rounded-full" 
                style={{ width: `${estadoRestore.progreso}%` }}
              ></div>
            </div>
          </div>
        )}

        {estadoRestore.estado === 'completado' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">{estadoRestore.mensaje}</p>
              <p className="text-xs text-emerald-400/80 mt-1">Total de registros procesados con éxito: {estadoRestore.totalProcesados}</p>
            </div>
            <button
              onClick={() => setEstadoRestore({ estado: 'idle', progreso: 0, mensaje: '' })}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Realizar otra restauración
            </button>
          </div>
        )}

        {estadoRestore.estado === 'error' && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-rose-300">Error en el proceso de restauración</p>
              <p className="text-xs text-rose-400/80 mt-1">{estadoRestore.mensaje}</p>
            </div>
            <button
              onClick={() => setEstadoRestore({ estado: 'idle', progreso: 0, mensaje: '' })}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
