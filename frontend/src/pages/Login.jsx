import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, IconButton, Tooltip,
  CircularProgress, Divider, Collapse
} from '@mui/material';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { BrandMark, BrandWordmark } from '../components/BrandLogo';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { useAuth } from '../hooks/useAuth';
import { useColorMode } from '../theme';
import api, { API_ORIGIN } from '../services/api';

const API_URL = `${API_ORIGIN}/api`;

const ERROR_MESSAGES = {
  instance: 'No se pudo conectar con esa instancia de Mastodon. Verifica el dominio.',
  denied: 'Autorización cancelada en Mastodon.',
  state: 'La sesión de autorización expiró. Intenta de nuevo.',
  oauth: 'No se pudo completar el inicio de sesión con Mastodon.',
  magiclink: 'Ese enlace ya no es válido — pídelo de nuevo.',
  'magiclink-en-uso': 'Ese correo ya es el método de acceso de otra cuenta.'
};

const Login = () => {
  const [instance, setInstance] = useState('');
  const [searchParams] = useSearchParams();
  const { user, loading, loginWithToken } = useAuth();
  const { mode, toggle } = useColorMode();
  const error = ERROR_MESSAGES[searchParams.get('error')] || '';

  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');
  const [altaPasskey, setAltaPasskey] = useState(false);
  const [handlePropuesto, setHandlePropuesto] = useState('');

  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');

  const entrarConPasskey = async () => {
    setPasskeyError('');
    setPasskeyBusy(true);
    try {
      const { data } = await api.post('/auth/passkey/login/options');
      const authResp = await startAuthentication({ optionsJSON: data.options });
      const { data: verificado } = await api.post('/auth/passkey/login/verify', {
        authResp, loginToken: data.loginToken
      });
      await loginWithToken(verificado.token);
    } catch (e) {
      if (e?.name === 'NotAllowedError') setPasskeyError('Cancelado.');
      else setPasskeyError('No se pudo entrar con la llave de acceso.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const crearCuentaConPasskey = async () => {
    setPasskeyError('');
    setPasskeyBusy(true);
    try {
      const { data } = await api.post('/auth/passkey/register/options', { handle: handlePropuesto });
      const attResp = await startRegistration({ optionsJSON: data.options });
      const { data: creado } = await api.post('/auth/passkey/register/verify', {
        attResp, regToken: data.regToken
      });
      await loginWithToken(creado.token);
    } catch (e) {
      if (e?.name === 'NotAllowedError') setPasskeyError('Cancelado.');
      else if (e?.name === 'InvalidStateError') setPasskeyError('Esa llave ya está registrada. Usa "Entrar con llave de acceso".');
      else setPasskeyError('No se pudo crear la cuenta con esa llave de acceso.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const pedirEnlaceMagico = async (e) => {
    e.preventDefault();
    setEmailErr('');
    setEmailMsg('');
    if (!email.trim()) return;
    setEmailBusy(true);
    try {
      const { data } = await api.post('/auth/email/start', { email: email.trim() });
      setEmailMsg(data.message);
    } catch (e) {
      setEmailErr(e.response?.data?.error || 'No se pudo enviar el enlace. Intenta de nuevo.');
    } finally {
      setEmailBusy(false);
    }
  };

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
            <Stack spacing={1.5} alignItems="center">
              <BrandMark size={96} />
              <BrandWordmark variant="h4" component="h1" />
            </Stack>
            <Typography variant="body1" color="text.secondary" textAlign="center">
              La red de la comunidad cannábica mexicana. Un espacio seguro y con respeto — inicia sesión con tu cuenta del fediverso.
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

            <Divider flexItem>o</Divider>

            <Stack spacing={1.5} sx={{ width: '100%' }}>
              <Button
                variant="outlined" size="large" fullWidth startIcon={<VpnKeyIcon />}
                onClick={entrarConPasskey} disabled={passkeyBusy}
              >
                {passkeyBusy ? 'Conectando…' : 'Entrar con llave de acceso'}
              </Button>
              <Button size="small" onClick={() => setAltaPasskey(v => !v)} disabled={passkeyBusy}>
                {altaPasskey ? 'Cancelar' : '¿Primera vez? Crear cuenta con llave de acceso'}
              </Button>
              <Collapse in={altaPasskey}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Handle (opcional)"
                    placeholder="como quieres llamarte"
                    value={handlePropuesto}
                    onChange={e => setHandlePropuesto(e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{ maxLength: 20, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                  />
                  <Button variant="contained" fullWidth onClick={crearCuentaConPasskey} disabled={passkeyBusy}>
                    {passkeyBusy ? 'Creando…' : 'Crear cuenta con llave de acceso'}
                  </Button>
                </Stack>
              </Collapse>
              {passkeyError && <Alert severity="error" role="alert">{passkeyError}</Alert>}
            </Stack>

            <Divider flexItem>o</Divider>

            <Box component="form" onSubmit={pedirEnlaceMagico} sx={{ width: '100%' }}>
              <Stack spacing={1.5}>
                <TextField
                  label="Tu correo"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  fullWidth
                  size="small"
                  InputProps={{ startAdornment: <MailOutlineIcon fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} /> }}
                />
                <Button type="submit" variant="outlined" fullWidth disabled={emailBusy}>
                  {emailBusy ? 'Enviando…' : 'Entrar con enlace por correo'}
                </Button>
                {emailErr && <Alert severity="error" role="alert">{emailErr}</Alert>}
                {emailMsg && <Alert severity="success" role="status">{emailMsg}</Alert>}
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary" textAlign="center">
              No creamos contraseñas: entra con Mastodon, una llave de acceso o un enlace por correo.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
