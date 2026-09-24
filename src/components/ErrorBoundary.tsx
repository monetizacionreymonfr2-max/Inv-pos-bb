import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
    } catch (e) {
      console.error("Error clearing localStorage:", e);
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-yellow-50 p-6">
          <div className="max-w-md w-full bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
            <div className="w-16 h-16 bg-red-100 border-2 border-black flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-600" />
            </div>
            <h1 className="text-xl font-black uppercase tracking-wider text-black mb-2">
              ¡Ups, algo salió mal!
            </h1>
            <p className="text-xs font-mono text-gray-700 mb-6 bg-gray-50 p-3 border border-black text-left overflow-x-auto max-h-32">
              {this.state.error?.message || "Error desconocido en la aplicación"}
            </p>
            <p className="text-xs text-gray-600 mb-6 font-medium leading-relaxed">
              La aplicación detectó un problema en el estado o almacenamiento local. Haz clic en el botón para limpiar la caché y reiniciar de forma segura.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full bg-yellow-400 hover:bg-black hover:text-white text-black font-black py-3 px-4 border-2 border-black uppercase tracking-wider text-xs transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 size={16} /> Restablecer aplicación y limpiar caché
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
