// Servicio base para consumir la API
import axios from 'axios';

// De dónde sale la URL del backend, por orden de prioridad:
//
// 1. REACT_APP_API_URL, si está definida. Es la vía para cualquier despliegue.
// 2. En desarrollo: el mismo host desde el que se abrió la web, puerto 4000.
//    Así funciona igual en localhost y desde otra máquina de la red local.
// 3. En producción sin variable: el MISMO origen que la web (sin puerto), que es
//    lo que da un reverse proxy sirviendo el frontend y /api juntos.
//
// El caso 3 existe porque adivinar ":4000" en producción rompía el despliegue de
// forma confusa: con dominio y HTTPS, el navegador intentaba
// https://midominio.mx:4000 y fallaba sin decir por qué.
function resolverOrigen() {
  const configurada = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
  if (configurada) return configurada.replace(/\/api$/, '');

  const { protocol, hostname, origin } = window.location;

  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[WeedTown] REACT_APP_API_URL no está definida. Se asume que la API vive en el mismo ' +
      'origen que la web (' + origin + '/api). Si el backend está en otro dominio o puerto, ' +
      'define REACT_APP_API_URL al compilar.'
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
