import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Venta, CATEGORIAS_PRODUCTO } from '../types';
import { formatUSD, formatBs, cn } from '../lib/utils';
import { useConfig } from '../contexts/ConfigContext';
import { BarChart, DollarSign, TrendingUp, PackageSearch, Download, ChevronDown, ChevronUp, FileDown, Trash2, PieChart, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { getSales, getProducts } from '../services/api';

export default function Estadisticas() {
  const { role } = useAuth();
  const { tasaDolar } = useConfig();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [costos, setCostos] = useState<Record<string, number>>({});
  const [expandedVenta, setExpandedVenta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const isAdmin = role === 'admin' || role === 'superadmin';

  const cargarDatos = async () => {
    setCargando(true);
    try {
      // 1. Cargar ventas desde API REST (GET /api/sales)
      const dataVentas = await getSales();
      if (Array.isArray(dataVentas)) {
        setVentas(dataVentas.sort((a, b) => b.fecha - a.fecha));
      }

      // 2. Cargar productos para mapear costos
      const dataProds = await getProducts();
      if (Array.isArray(dataProds)) {
        const costs: Record<string, number> = {};
        dataProds.forEach((p: any) => {
          if (typeof p.costo_usd === 'number') {
            costs[p.id] = p.costo_usd;
          }
        });
        setCostos(costs);
      }
    } catch (err) {
      console.warn("Error cargando estadísticas desde API:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    cargarDatos();
  }, [isAdmin]);

  // Compute metrics
  const { globalStats, statsPorCategoria } = useMemo(() => {
    let ingresosBrutos = 0;
    let gananciaNeta = 0;
    let productosVendidos = 0;

    const cats: Record<string, { ingresosBrutos: number, gananciaNeta: number, productosVendidos: number }> = {};
    CATEGORIAS_PRODUCTO.forEach(c => {
      cats[c] = { ingresosBrutos: 0, gananciaNeta: 0, productosVendidos: 0 };
    });
    cats['Sin Categoría'] = { ingresosBrutos: 0, gananciaNeta: 0, productosVendidos: 0 };

    for (const v of ventas) {
      ingresosBrutos += v.total_usd;
      if (v.items) {
        for (const item of v.items) {
          productosVendidos += item.cantidad;
          const costoUnidad = costos[item.productoId] || 0;
          const gananciaThisItem = (item.precio_unitario_usd - costoUnidad) * item.cantidad;
          gananciaNeta += gananciaThisItem;

          const cat = item.categoria || 'Sin Categoría';
          if (!cats[cat]) {
            cats[cat] = { ingresosBrutos: 0, gananciaNeta: 0, productosVendidos: 0 };
          }
          const subtotalItem = item.precio_unitario_usd * item.cantidad;
          cats[cat].ingresosBrutos += subtotalItem;
          cats[cat].productosVendidos += item.cantidad;
          cats[cat].gananciaNeta += gananciaThisItem;
        }
      }
    }

    const catsArray = Object.keys(cats)
      .filter(k => cats[k].ingresosBrutos > 0 || cats[k].productosVendidos > 0)
      .map(k => ({
        categoria: k,
        ...cats[k]
      }))
      .sort((a, b) => b.ingresosBrutos - a.ingresosBrutos);

    return {
      globalStats: {
        ingresosBrutos,
        gananciaNeta,
        productosVendidos,
        totalVentas: ventas.length
      },
      statsPorCategoria: catsArray
    };
  }, [ventas, costos]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full bg-white max-w-5xl mx-auto w-full items-center justify-center p-6 text-center">
        <BarChart className="text-gray-300 mb-4" size={64} />
        <h2 className="text-2xl font-black uppercase tracking-widest mb-2">Acceso Restringido</h2>
        <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
          Solo administradores pueden ver estadísticas y ganancias.
        </p>
      </div>
    );
  }

  const exportarReportePDF = () => {
    const toastId = toast.loading("Generando reporte contable...");
    try {
      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("BIBI STORE - REPORTE DE VENTAS & RENTABILIDAD", 14, 20);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha de emisión: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Tasa: ${formatBs(tasaDolar)}`, 14, 28);
      doc.text(`Ventas Registradas: ${globalStats.totalVentas} | Unidades Vendidas: ${globalStats.productosVendidos}`, 14, 34);
      doc.text(`Ingresos Totales: ${formatUSD(globalStats.ingresosBrutos)} (${formatBs(globalStats.ingresosBrutos * tasaDolar)})`, 14, 40);
      doc.text(`Ganancia Neta Estimada: ${formatUSD(globalStats.gananciaNeta)} (${formatBs(globalStats.gananciaNeta * tasaDolar)})`, 14, 46);

      const tableData = statsPorCategoria.map(c => [
        c.categoria,
        c.productosVendidos.toString(),
        formatUSD(c.ingresosBrutos),
        formatUSD(c.gananciaNeta)
      ]);

      autoTable(doc, {
        startY: 54,
        head: [['Categoría', 'Cant. Vendida', 'Ingreso Bruto', 'Ganancia Neta']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      doc.save(`Reporte_Ventas_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success("Reporte generado con éxito", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Error al generar PDF", { id: toastId });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="pb-6 border-b-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-black flex items-center gap-2">
            Estadísticas & Ventas
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-gray-500 mt-1">
            Conectado a servidor API REST (DigitalOcean VPS)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="p-2 border-2 border-black hover:bg-yellow-400 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            title="Actualizar datos"
          >
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportarReportePDF}
            className="bg-yellow-400 text-black border-2 border-black px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-black hover:text-white transition-all flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
          >
            <FileDown size={16} /> Exportar Reporte PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <div className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Ingresos Totales</span>
            <DollarSign size={18} className="text-black" />
          </div>
          <p className="text-2xl font-black text-black leading-none">{formatUSD(globalStats.ingresosBrutos)}</p>
          <p className="text-xs font-mono font-bold text-gray-500 mt-1">{formatBs(globalStats.ingresosBrutos * tasaDolar)}</p>
        </div>

        <div className="border-2 border-black p-4 bg-yellow-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-black font-bold">Ganancia Neta</span>
            <TrendingUp size={18} className="text-black" />
          </div>
          <p className="text-2xl font-black text-black leading-none">{formatUSD(globalStats.gananciaNeta)}</p>
          <p className="text-xs font-mono font-bold text-gray-600 mt-1">{formatBs(globalStats.gananciaNeta * tasaDolar)}</p>
        </div>

        <div className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tickets de Venta</span>
            <BarChart size={18} className="text-black" />
          </div>
          <p className="text-2xl font-black text-black leading-none">{globalStats.totalVentas}</p>
          <p className="text-xs font-mono font-bold text-gray-500 mt-1">Registros en servidor</p>
        </div>

        <div className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Artículos Vendidos</span>
            <PackageSearch size={18} className="text-black" />
          </div>
          <p className="text-2xl font-black text-black leading-none">{globalStats.productosVendidos}</p>
          <p className="text-xs font-mono font-bold text-gray-500 mt-1">Unidades despachadas</p>
        </div>
      </div>

      {/* Categories Breakdown */}
      <div className="mb-8">
        <h2 className="text-sm font-black uppercase tracking-widest mb-3 flex items-center gap-2">
          <PieChart size={16} /> Rendimiento por Categoría
        </h2>
        {statsPorCategoria.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono italic">No hay ventas registradas aún.</p>
        ) : (
          <div className="border-2 border-black overflow-x-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-black text-white uppercase text-[10px] font-black">
                <tr>
                  <th className="p-3">Categoría</th>
                  <th className="p-3 text-center">Unidades</th>
                  <th className="p-3 text-right">Venta Total</th>
                  <th className="p-3 text-right">Ganancia Estimada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {statsPorCategoria.map((c, i) => (
                  <tr key={c.categoria} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="p-3 font-sans font-bold uppercase">{c.categoria}</td>
                    <td className="p-3 text-center font-bold">{c.productosVendidos}</td>
                    <td className="p-3 text-right font-bold text-black">{formatUSD(c.ingresosBrutos)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">{formatUSD(c.gananciaNeta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sales History List */}
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest mb-3">Historial Detallado de Ventas (GET /api/sales)</h2>
        {ventas.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono italic">No hay ventas registradas en el servidor.</p>
        ) : (
          <div className="space-y-3">
            {ventas.map(v => {
              const isExpanded = expandedVenta === v.id;
              return (
                <div key={v.id} className="border-2 border-black p-4 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-black uppercase">
                          Ticket #{v.id?.substring(0, 10)}
                        </span>
                        <span className="text-[10px] bg-gray-100 border border-black px-1.5 py-0.5 font-bold">
                          {format(new Date(v.fecha), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">Vendedor: {v.vendedor_id || 'Cajero'}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-base font-black text-black leading-none block">{formatUSD(v.total_usd)}</span>
                        <span className="text-[10px] font-mono text-gray-500">{formatBs(v.total_ved || (v.total_usd * tasaDolar))}</span>
                      </div>
                      <button
                        onClick={() => setExpandedVenta(isExpanded ? null : v.id)}
                        className="p-1 border border-black hover:bg-yellow-400 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && v.items && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Productos del ticket:</h4>
                      <div className="space-y-1">
                        {v.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs font-mono">
                            <span>{item.cantidad}x {item.nombre || item.productoId}</span>
                            <span className="font-bold">{formatUSD(item.precio_unitario_usd * item.cantidad)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
