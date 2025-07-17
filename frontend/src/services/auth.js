// Servicio de autenticación
import api from './api';

export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (data) => api.post('/auth/register', data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
// OAuth: redirigir a /auth/oauth/google o /auth/oauth/facebook
