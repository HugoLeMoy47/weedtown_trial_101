// Servicio base para consumir la API
import axios from 'axios';

// De dónde sale la URL del backend, por orden de prioridad:
//
// 1. VITE_API_URL, si está definida. Es la vía para cualquier despliegue.
//    REACT_APP_API_URL se sigue aceptando (ver abajo).
// 2. En desarrollo: el mismo host desde el que se abrió la web, puerto 4000.
//    Así funciona igual en localhost y desde otra máquina de la red local.
// 3. En producción sin variable: el MISMO origen que la web (sin puerto), que es
//    lo que da un reverse proxy sirviendo el frontend y /api juntos.
//
// El caso 3 existe porque adivinar ":4000" en producción rompía el despliegue de
// forma confusa: con dominio y HTTPS, el navegador intentaba
// https://midominio.mx:4000 y fallaba sin decir por qué.
//
// MIGRACIÓN A VITE (12B): el nombre pasó de REACT_APP_API_URL a VITE_API_URL,
// y las dos se leen a propósito. Este es EL punto donde la migración podía
// fallar en silencio: la configuración de Render y de Cloudflare vive en sus
// dashboards, fuera de este repo, así que si solo se aceptara el nombre nuevo,
// un despliegue con el viejo compilaría bien y apuntaría al backend
// equivocado — sin error, sin aviso, y visible solo cuando alguien note que la
// app no carga datos. Aceptar los dos convierte eso en una advertencia.
function resolverOrigen() {
  const nueva = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  const vieja = (import.meta.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');

  if (!nueva && vieja) {
    console.warn(
      '[WeedTown] Estás usando REACT_APP_API_URL, que quedó del tiempo de Create React App. ' +
      'Sigue funcionando, pero el nombre actual es VITE_API_URL — conviene cambiarlo donde ' +
      'esté configurado (Render, Cloudflare, el job de E2E) para no dejar dos nombres vivos.'
    );
  }

  const configurada = nueva || vieja;
  if (configurada) return configurada.replace(/\/api$/, '');

  const { protocol, hostname, origin } = window.location;

  if (import.meta.env.PROD) {
    console.warn(
      '[WeedTown] VITE_API_URL no está definida. Se asume que la API vive en el mismo ' +
      'origen que la web (' + origin + '/api). Si el backend está en otro dominio o puerto, ' +
      'define VITE_API_URL al compilar.'
    );
    return origin;
  }

  return `${protocol}//${hostname}:4000`;
}

export const API_ORIGIN = resolverOrigen();

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
});

// Adjunta el JWT de sesión a cada request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('weedtown_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
