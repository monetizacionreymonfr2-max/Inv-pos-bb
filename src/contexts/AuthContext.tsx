import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSecurityConfig, saveSecurityConfig, getAccessCodes, saveAccessCode, SecurityConfig } from '../services/api';

export type UserRole = 'superadmin' | 'admin' | 'cajero' | 'none';

export interface AppUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  authMethod?: 'pin';
}

export type PinesSeguridad = SecurityConfig;

const DEFAULT_PINES: PinesSeguridad = {
  pinSuperadmin: '7799',
  pinAdmin: '2026',
  pinCajero: '1234'
};

interface AuthContextType {
  user: AppUser | null;
  role: UserRole;
  loading: boolean;
  loginWithPin: (pin: string) => Promise<{ success: boolean; role?: UserRole; message?: string }>;
  logout: () => void;
  pinesConfig: PinesSeguridad;
  actualizarPines: (nuevosPines: Partial<PinesSeguridad>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: 'none',
  loading: true,
  loginWithPin: async () => ({ success: false, message: 'No inicializado' }),
  logout: () => {},
  pinesConfig: DEFAULT_PINES,
  actualizarPines: async () => false
});

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole>('none');
  const [loading, setLoading] = useState(true);
  const [pinesConfig, setPinesConfig] = useState<PinesSeguridad>(DEFAULT_PINES);

  // 1. Cargar los PINs de seguridad desde el servidor REST / almacenamiento local
  useEffect(() => {
    getSecurityConfig().then(sec => {
      if (sec && sec.pinSuperadmin) {
        setPinesConfig(sec);
      }
    }).catch(() => {});
  }, []);

  // 2. Gestionar sesión: Restaurar de localStorage
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem('bibi_store_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.role && parsed.role !== 'none') {
          setUser(parsed.user);
          setRole(parsed.role);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn("Error leyendo sesión local:", e);
    }
    setLoading(false);
  }, []);

  // Función para iniciar sesión con PIN o Token de acceso
  const loginWithPin = async (rawPin: string): Promise<{ success: boolean; role?: UserRole; message?: string }> => {
    const pin = rawPin.trim().toUpperCase();
    if (!pin) {
      return { success: false, message: 'Ingrese un PIN o código válido' };
    }

    // 1. Comprobar contra PIN Superadmin
    if (pin === pinesConfig.pinSuperadmin || pin === DEFAULT_PINES.pinSuperadmin) {
      const superUser: AppUser = {
        uid: 'pin-superadmin',
        email: 'superadmin@bibistore.com',
        displayName: 'Super Admin',
        authMethod: 'pin'
      };
      setUser(superUser);
      setRole('superadmin');
      try {
        localStorage.setItem('bibi_store_session', JSON.stringify({ user: superUser, role: 'superadmin' }));
      } catch {}
      return { success: true, role: 'superadmin' };
    }

    // 2. Comprobar contra PIN Admin / Dueña
    if (pin === pinesConfig.pinAdmin || pin === DEFAULT_PINES.pinAdmin) {
      const adminUser: AppUser = {
        uid: 'pin-admin-duena',
        email: 'duena@bibistore.com',
        displayName: 'Dueña (Bibi Store)',
        authMethod: 'pin'
      };
      setUser(adminUser);
      setRole('admin');
      try {
        localStorage.setItem('bibi_store_session', JSON.stringify({ user: adminUser, role: 'admin' }));
      } catch {}
      return { success: true, role: 'admin' };
    }

    // 3. Comprobar contra PIN Cajera
    if (pin === pinesConfig.pinCajero || pin === DEFAULT_PINES.pinCajero) {
      const cajeroUser: AppUser = {
        uid: 'pin-cajero-pos',
        email: 'cajero@bibistore.com',
        displayName: 'Cajera Bibi Store',
        authMethod: 'pin'
      };
      setUser(cajeroUser);
      setRole('cajero');
      try {
        localStorage.setItem('bibi_store_session', JSON.stringify({ user: cajeroUser, role: 'cajero' }));
      } catch {}
      return { success: true, role: 'cajero' };
    }

    // 4. Comprobar si es un Token de un solo uso en la lista de códigos del servidor
    try {
      const codes = await getAccessCodes();
      const match = codes.find(c => String(c.id).toUpperCase() === pin);
      if (match) {
        if (match.usado) {
          return { success: false, message: 'Este código ya fue utilizado.' };
        }

        const rolAsignado = (match.rol as UserRole) || 'cajero';
        const tokenUser: AppUser = {
          uid: `token-${pin}`,
          email: `${rolAsignado}@bibistore.com`,
          displayName: rolAsignado === 'admin' ? 'Dueña (Acceso Token)' : 'Cajera (Acceso Token)',
          authMethod: 'pin'
        };

        // Marcar como usado
        await saveAccessCode({
          ...match,
          usado: true,
          usadoPor: tokenUser.uid,
          usadoEn: Date.now()
        }).catch(() => {});

        setUser(tokenUser);
        setRole(rolAsignado);
        try {
          localStorage.setItem('bibi_store_session', JSON.stringify({ user: tokenUser, role: rolAsignado }));
        } catch {}
        return { success: true, role: rolAsignado };
      }
    } catch (err) {
      console.warn("Error comprobando código de acceso:", err);
    }

    return { success: false, message: 'PIN o código incorrecto. Verifica e intenta nuevamente.' };
  };

  const logout = () => {
    localStorage.removeItem('bibi_store_session');
    setUser(null);
    setRole('none');
  };

  const actualizarPines = async (nuevosPines: Partial<PinesSeguridad>): Promise<boolean> => {
    try {
      const dataToSave = {
        ...pinesConfig,
        ...nuevosPines
      };
      setPinesConfig(dataToSave);
      return await saveSecurityConfig(dataToSave);
    } catch (err) {
      console.error("Error guardando nuevos PINs:", err);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, loginWithPin, logout, pinesConfig, actualizarPines }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
