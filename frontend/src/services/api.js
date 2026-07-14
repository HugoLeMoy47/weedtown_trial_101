// Servicio base para consumir la API
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
});

// Adjunta el JWT de sesión a cada request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('weedtown_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
