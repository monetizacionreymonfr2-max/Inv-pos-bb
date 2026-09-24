import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { KeyRound, Lock, ArrowRight, Sparkles } from "lucide-react";
import BibiStoreLogo from "../components/BibiStoreLogo";
import toast from "react-hot-toast";

export default function Login() {
  const { user, loading, role, loginWithPin } = useAuth();
  const [pinIngresado, setPinIngresado] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-black"></div>
          <p className="font-mono text-xs uppercase tracking-widest font-black">Cargando Bibi Store...</p>
        </div>
      </div>
    );
  }

  // Si ya tiene rol asignado, redirigir directo a la app
  if (user && role !== 'none') {
    return <Navigate to="/" replace />;
  }

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinIngresado.trim()) return;
    setVerificando(true);
    const toastId = toast.loading("Verificando acceso...");

    try {
      const res = await loginWithPin(pinIngresado.trim());
      if (res.success) {
        toast.success(`¡Bienvenido/a como ${res.role?.toUpperCase()}!`, { id: toastId });
      } else {
        toast.error(res.message || "PIN o código incorrecto", { id: toastId });
      }
    } catch (err: any) {
      console.error("Error en login con PIN:", err);
      toast.error("Error al validar acceso. Intenta de nuevo.", { id: toastId });
    } finally {
      setVerificando(false);
    }
  };

  const handleQuickPin = (pin: string) => {
    setPinIngresado(pin);
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col justify-center py-6 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="flex justify-center text-black mb-2 w-28 h-28 relative bg-white p-2 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <BibiStoreLogo className="h-full w-full object-contain" />
        </div>
        <h1 className="text-center text-3xl sm:text-4xl font-black tracking-tighter text-black uppercase mt-2">
          BIBI STORE
        </h1>
        <p className="text-center text-xs font-mono text-gray-600 uppercase tracking-widest font-bold">
          Control de Inventario & Ventas POS
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 sm:px-8 border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          
          <div className="space-y-5">
            <div className="border-b-2 border-black pb-3 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-400 border-2 border-black text-xs font-black uppercase tracking-wider mb-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Lock size={14} /> Acceso Directo por PIN
              </div>
              <p className="text-xs text-gray-600 font-medium">
                Inicia sesión al instante con tu código o PIN de seguridad.
              </p>
            </div>

            {/* Formulario de PIN */}
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-black mb-1.5 flex justify-between">
                  <span>PIN de la Tienda</span>
                  <button 
                    type="button" 
                    onClick={() => setMostrarAyuda(!mostrarAyuda)}
                    className="text-[10px] text-gray-500 underline font-normal normal-case hover:text-black"
                  >
                    {mostrarAyuda ? "Ocultar PINs" : "Ver PINs de Acceso"}
                  </button>
                </label>

                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    autoFocus
                    placeholder="INGRESE PIN O TOKEN..."
                    value={pinIngresado}
                    onChange={e => setPinIngresado(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 tracking-widest font-mono font-black text-base border-2 border-black focus:outline-none focus:bg-yellow-50 focus:border-black"
                  />
                </div>
              </div>

              {/* Botones de PIN rápido */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleQuickPin("2026")}
                  className="p-2 border-2 border-black text-left bg-zinc-50 hover:bg-yellow-300 transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-black uppercase tracking-wider text-black">Dueña / Admin</span>
                  <span className="block font-mono text-xs text-gray-600 font-bold">PIN: 2026</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickPin("1234")}
                  className="p-2 border-2 border-black text-left bg-zinc-50 hover:bg-yellow-300 transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-black uppercase tracking-wider text-black">Cajera / POS</span>
                  <span className="block font-mono text-xs text-gray-600 font-bold">PIN: 1234</span>
                </button>
              </div>

              {mostrarAyuda && (
                <div className="bg-yellow-50 border-2 border-black p-3 text-xs space-y-1 font-mono">
                  <p className="font-bold text-black uppercase">PINs de Acceso Predeterminados:</p>
                  <p className="text-gray-800">👑 <strong>Super Admin:</strong> 7799</p>
                  <p className="text-gray-800">🛍️ <strong>Dueña:</strong> 2026</p>
                  <p className="text-gray-800">🛒 <strong>Cajera:</strong> 1234</p>
                  <p className="text-[10px] text-gray-500 pt-1">Configurados y sincronizados con tu servidor VPS.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={verificando || !pinIngresado.trim()}
                className="w-full flex justify-center items-center gap-2 py-4 px-4 font-black text-black bg-yellow-400 border-2 border-black hover:bg-black hover:text-white uppercase tracking-widest text-sm transition-all cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
              >
                {verificando ? "COMPROBANDO..." : (
                  <>
                    <span>INGRESAR AL SISTEMA</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center">
              <button 
                type="button"
                onClick={() => {
                  setPinIngresado("2026");
                  loginWithPin("2026").then(res => {
                    if (res.success) toast.success("Acceso rápido como Administrador");
                  });
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-black uppercase tracking-wider cursor-pointer"
              >
                <Sparkles size={13} className="text-yellow-500" />
                Acceso Rápido Administrador (1-Clic)
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
