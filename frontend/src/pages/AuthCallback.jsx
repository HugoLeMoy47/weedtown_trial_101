import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, CircularProgress, Typography, Alert, Button, Stack } from '@mui/material';
import { useAuth } from '../hooks/useAuth';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      navigate('/login?error=oauth', { replace: true });
      return;
    }
    // Limpiar el token de la barra de direcciones
    window.history.replaceState(null, '', window.location.pathname);
    loginWithToken(token)
      .then(() => navigate('/feed', { replace: true }))
      .catch(() => setError('No se pudo validar la sesión. Intenta iniciar sesión de nuevo.'));
  }, [navigate, loginWithToken]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          {error ? (
            <Stack spacing={2}>
              <Alert severity="error" role="alert">{error}</Alert>
              <Button variant="contained" onClick={() => navigate('/login')}>Volver al login</Button>
            </Stack>
          ) : (
            <Stack spacing={2} alignItems="center" role="status" aria-live="polite">
              <CircularProgress />
              <Typography color="text.secondary">Conectando con tu cuenta…</Typography>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AuthCallback;
