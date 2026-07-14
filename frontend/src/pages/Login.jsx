import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, IconButton, Tooltip, CircularProgress
} from '@mui/material';
import SpaIcon from '@mui/icons-material/Spa';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useAuth } from '../hooks/useAuth';
import { useColorMode } from '../theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const ERROR_MESSAGES = {
  instance: 'No se pudo conectar con esa instancia de Mastodon. Verifica el dominio.',
  denied: 'Autorización cancelada en Mastodon.',
  state: 'La sesión de autorización expiró. Intenta de nuevo.',
  oauth: 'No se pudo completar el inicio de sesión con Mastodon.'
};

const Login = () => {
  const [instance, setInstance] = useState('');
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { mode, toggle } = useColorMode();
  const error = ERROR_MESSAGES[searchParams.get('error')] || '';

  // Si ya hay sesión activa, no mostrar el login
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }} role="status" aria-label="Cargando sesión">
        <CircularProgress />
      </Box>
    );
  }
  if (user) return <Navigate to="/feed" replace />;

  const handleSubmit = (e) => {
    e.preventDefault();
    const domain = instance.trim();
    if (!domain) return;
    window.location.href = `${API_URL}/auth/mastodon/start?instance=${encodeURIComponent(domain)}`;
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Tooltip title={mode === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}>
        <IconButton
          onClick={toggle}
          sx={{ position: 'fixed', top: 16, right: 16 }}
          color="secondary"
          aria-label={mode === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
        >
          {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
        </IconButton>
      </Tooltip>

      <Card sx={{ maxWidth: 420, width: '100%' }} component="main">
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3} alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <SpaIcon color="primary" fontSize="large" aria-hidden="true" />
              <Typography variant="h5" component="h1">WeedTown</Typography>
            </Stack>
            <Typography variant="body1" color="text.secondary" textAlign="center">
              Tu red para nómadas digitales. Inicia sesión con tu cuenta del fediverso.
            </Typography>

            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <Stack spacing={2}>
                <TextField
                  id="mastodon-instance"
                  label="Tu instancia de Mastodon"
                  placeholder="mastodon.social"
                  value={instance}
                  onChange={e => setInstance(e.target.value)}
                  required
                  fullWidth
                  autoFocus
                  helperText="Ejemplo: mastodon.social, mstdn.mx, hachyderm.io"
                />
                {error && <Alert severity="error" role="alert">{error}</Alert>}
                <Button type="submit" variant="contained" size="large" fullWidth>
                  Entrar con Mastodon
                </Button>
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary" textAlign="center">
              No creamos contraseñas: tu identidad vive en tu instancia de Mastodon.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
