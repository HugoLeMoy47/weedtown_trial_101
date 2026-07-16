// Servicio base para consumir la API
import axios from 'axios';

// El backend vive en el mismo host desde el que se abrió la web (localhost o IP LAN),
// puerto 4000. REACT_APP_API_URL lo sobreescribe para despliegues.
export const API_ORIGIN =
  (process.env.REACT_APP_API_URL || '').replace(/\/api\/?$/, '') ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

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
