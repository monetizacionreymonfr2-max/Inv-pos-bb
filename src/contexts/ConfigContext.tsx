import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getConfig, saveConfig } from '../services/api';

interface ConfigContextType {
  tasaDolar: number;
  actualizarTasa: (nuevaTasa: number) => Promise<boolean>;
}

const ConfigContext = createContext<ConfigContextType>({ 
  tasaDolar: 865,
  actualizarTasa: async () => false 
});

export const ConfigProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [tasaDolar, setTasaDolar] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('bibi_store_tasa_dolar');
      if (cached) {
        const parsed = Number(cached);
        if (parsed > 0) return parsed;
      }
    } catch {}
    return 865;
  });

  // Cargar tasa desde el servidor API REST
  const cargarDesdeAPI = useCallback(async () => {
    try {
      const config = await getConfig();
      if (config && typeof config.tasa_dolar === 'number' && config.tasa_dolar > 0) {
        setTasaDolar(config.tasa_dolar);
        try {
          localStorage.setItem('bibi_store_tasa_dolar', String(config.tasa_dolar));
        } catch {}
      }
    } catch (e) {
      console.warn("No se pudo cargar config desde servidor:", e);
    }
  }, []);

  useEffect(() => {
    cargarDesdeAPI();
    // Sincronización periódica cada 30 segundos con el servidor
    const timer = setInterval(cargarDesdeAPI, 30000);
    return () => clearInterval(timer);
  }, [cargarDesdeAPI]);

  // Función unificada para cambiar la tasa (actualiza servidor y LocalStorage)
  const actualizarTasa = async (nuevaTasa: number): Promise<boolean> => {
    const val = Number(nuevaTasa);
    if (!val || isNaN(val) || val <= 0) return false;

    setTasaDolar(val);
    try {
      localStorage.setItem('bibi_store_tasa_dolar', String(val));
    } catch {}

    return await saveConfig({ tasa_dolar: val });
  };

  return (
    <ConfigContext.Provider value={{ tasaDolar, actualizarTasa }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);
