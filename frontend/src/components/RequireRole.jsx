import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../hooks/useAuth';

// Protege rutas por rol. Es una comodidad de la interfaz, NO la autorización:
// esa la hace el servidor en cada petición (requireRole). Alguien que fuerce la
// ruta a mano solo verá una pantalla vacía y 403 en todas las llamadas.
const RequireRole = ({ roles = ['MOD', 'ADMIN'], children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }} role="status" aria-label="Cargando sesión">
        <CircularProgress />
      </Box>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!roles.includes(user.role)) return <Navigate to="/feed" replace />;
  return children;
};

export default RequireRole;
