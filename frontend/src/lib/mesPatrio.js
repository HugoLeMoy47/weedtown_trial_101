import { useState, useEffect, useCallback } from 'react';

export const MES_PATRIO_KEY = 'weedtown_mes_patrio';
export const MES_PATRIO_EVENT = 'weedtown:mes-patrio';

/**
 * Determina si el ambiente del Mes Patrio está activo.
 * - Si el usuario configuró explícitamente una preferencia en localStorage, se respeta ('true' o 'false').
 * - Por defecto, se activa automáticamente durante todo el mes de septiembre (mes 8 en Date de JS).
 */
export function isMesPatrio() {
  const manual = localStorage.getItem(MES_PATRIO_KEY);
  if (manual === 'true') return true;
  if (manual === 'false') return false;
  return new Date().getMonth() === 8;
}

/**
 * Hook para consultar y alternar el modo festivo patrio.
 * Sincroniza cambios entre pestañas y componentes mediante CustomEvent.
 */
export function useMesPatrio() {
  const [esMesPatrio, setEsMesPatrio] = useState(isMesPatrio);

  useEffect(() => {
    const sincronizar = () => setEsMesPatrio(isMesPatrio());
    window.addEventListener(MES_PATRIO_EVENT, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => {
      window.removeEventListener(MES_PATRIO_EVENT, sincronizar);
      window.removeEventListener('storage', sincronizar);
    };
  }, []);

  const toggleMesPatrio = useCallback(() => {
    const nuevoValor = !isMesPatrio();
    localStorage.setItem(MES_PATRIO_KEY, String(nuevoValor));
    setEsMesPatrio(nuevoValor);
    window.dispatchEvent(new CustomEvent(MES_PATRIO_EVENT, { detail: { activo: nuevoValor } }));
  }, []);

  return { esMesPatrio, toggleMesPatrio };
}
