import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Stack, IconButton, Tooltip,
  CircularProgress, Divider, Collapse, Checkbox, FormControlLabel, Link, Tabs, Tab
} from '@mui/material';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { BrandMark, BrandWordmark } from '../components/BrandLogo';
import Footer from '../components/Footer';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuth } from '../hooks/useAuth';
import { useColorMode } from '../theme';
import api, { API_ORIGIN } from '../services/api';
import { capturarAtribucion, tomarNextPendiente, registrarAltaSiCorresponde } from '../lib/attribution';

const API_URL = `${API_ORIGIN}/api`;

const ERROR_MESSAGES = {
  instance: 'No se pudo conectar con esa instancia de Mastodon. Verifica el dominio.',
  denied: 'Autorización cancelada en Mastodon.',
  state: 'La sesión de autorización expiró. Intenta de nuevo.',
  oauth: 'No se pudo completar el inicio de sesión con Mastodon.',
  magiclink: 'Ese enlace ya no es válido — pídelo de nuevo.',
  'magiclink-en-uso': 'Ese correo ya es el método de acceso de otra cuenta.'
};

// Errores que solo pueden venir del flujo de Mastodon: si llegan por la URL,
// conviene abrir su panel de una vez en vez de dejar el error escondido
// detrás de un colapsable cerrado.
const ERRORES_DE_MASTODON = new Set(['instance', 'denied', 'state', 'oauth']);

// Instancias curadas para quien ya sabe que tiene cuenta pero no recuerda
// el dominio exacto — llevan fuera de WeedTown, por eso van con aviso.
const INSTANCIAS_SUGERIDAS = ['mstdn.mx', 'mastodon.social'];

const Login = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, loginWithToken } = useAuth();
  const { mode, toggle } = useColorMode();
  const errorParam = searchParams.get('error');
  const error = ERROR_MESSAGES[errorParam] || '';

  // HU-CTA-003: si el CTA de un posteo no accesible mandó aquí, el mensaje no
  // puede afirmar que el posteo exista — la API responde 404 igual para "no
  // existe" y para "es de amistades", y esa indistinción es la garantía de
  // privacidad (no se toca).
  const refParam = searchParams.get('ref');
  const nextParam = searchParams.get('next');
  const vieneDePostNoAccesible = refParam === 'post' && /^\/p\/\d+$/.test(nextParam || '');

  // HU-CTA-002: capturar ref/next apenas se aterriza aquí — antes de
  // cualquier navegación (Mastodon se va del sitio por completo; el enlace
  // mágico puede abrirse en otra pestaña).
  useEffect(() => {
    capturarAtribucion(searchParams);
  }, [searchParams]);

  // HU-CTA-003: aterriza en `next` si había uno pendiente y es una ruta
  // interna válida; si no, el destino de siempre. Este es el único punto que
  // consume `next` para los flujos que vuelven a /login (llave de acceso) —
  // Mastodon y correo vuelven a /auth/callback y lo consumen ahí.
  //
  // Va en un efecto, no en el cuerpo del render: tomarNextPendiente() BORRA
  // el valor al leerlo, y este componente puede re-renderizarse más de una
  // vez con `user` ya definido antes de desmontar — leerlo ahí adentro haría
  // que la segunda lectura ya no encontrara nada y cayera siempre a /feed.
  useEffect(() => {
    if (user) navigate(tomarNextPendiente() || '/feed', { replace: true });
  }, [user, navigate]);

  // 0 = Entrar, 1 = Crear cuenta. Los tres métodos viven debajo, en el mismo
  // orden, en ambas pestañas — lo que cambia es la intención declarada
  // (HU-ACC-002): desde "Entrar" ningún método invita a darse de alta.
  const [tab, setTab] = useState(0);
  const esAlta = tab === 1;

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsErr, setTermsErr] = useState('');

  const [instance, setInstance] = useState('');
  const [mastodonOpen, setMastodonOpen] = useState(false);

  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');
  const [handlePropuesto, setHandlePropuesto] = useState('');

  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');

  // Un error de OAuth que vuelve por la URL pertenece al panel de Mastodon:
  // ábrelo de una vez, no lo dejes escondido tras el colapsable.
  useEffect(() => {
    if (ERRORES_DE_MASTODON.has(errorParam)) setMastodonOpen(true);
  }, [errorParam]);

  const validarTerminos = () => {
    if (!termsAccepted) {
      setTermsErr('Debes declarar que eres mayor de 18 años y aceptar los Términos y Condiciones.');
      return false;
    }
    setTermsErr('');
    return true;
  };

  const entrarConPasskey = async () => {
    if (!validarTerminos()) return;
    setPasskeyError('');
    setPasskeyBusy(true);
    try {
      const { data } = await api.post('/auth/passkey/login/options');
      const authResp = await startAuthentication({ optionsJSON: data.options });
      const { data: verificado } = await api.post('/auth/passkey/login/verify', {
        authResp, loginToken: data.loginToken
      });
      await loginWithToken(verificado.token);
      await registrarAltaSiCorresponde(false); // login, no alta: solo limpia lo pendiente
    } catch (e) {
      if (e?.name === 'NotAllowedError') setPasskeyError('Cancelado.');
      else setPasskeyError('No se pudo entrar con la llave de acceso.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const crearCuentaConPasskey = async () => {
    if (!validarTerminos()) return;
    setPasskeyError('');
    setPasskeyBusy(true);
    try {
      const { data } = await api.post('/auth/passkey/register/options', { handle: handlePropuesto });
      const attResp = await startRegistration({ optionsJSON: data.options });
      const { data: creado } = await api.post('/auth/passkey/register/verify', {
        attResp, regToken: data.regToken
      });
      await loginWithToken(creado.token);
      await registrarAltaSiCorresponde(creado.isNew);
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
    if (!validarTerminos()) return;
    setEmailErr('');
    setEmailMsg('');
    if (!email.trim()) return;
    setEmailBusy(true);
    try {
      // La respuesta es SIEMPRE la misma (200 con el mismo mensaje), exista o
      // no una cuenta con ese correo — nunca se muestra un texto distinto
      // según el caso, para no filtrar por la UI lo que el backend protege.
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
  // La navegación real la dispara el efecto de arriba (necesita consumir
  // `next` una sola vez); acá solo se evita seguir mostrando el formulario
  // mientras eso ocurre.
  if (user) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validarTerminos()) return;
    const domain = instance.trim();
    if (!domain) return;
    window.location.href = `${API_URL}/auth/mastodon/start?instance=${encodeURIComponent(domain)}`;
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
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

        <Card sx={{ maxWidth: 440, width: '100%', my: 4 }} component="main">
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack spacing={3} alignItems="center">
              <Stack spacing={1.5} alignItems="center">
                <BrandMark size={96} />
                <BrandWordmark variant="h4" component="h1" />
              </Stack>
              <Typography variant="body1" color="text.secondary" textAlign="center">
                La red de la comunidad cannábica mexicana. Un espacio seguro y con respeto.
              </Typography>

              {/* Casilla obligatoria de 18+ y TyCyP — bloquea los seis caminos (3 métodos × 2 pestañas) */}
              <Box sx={{ width: '100%', bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={termsAccepted}
                      onChange={(e) => {
                        setTermsAccepted(e.target.checked);
                        if (e.target.checked) setTermsErr('');
                      }}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.primary">
                      Declaro que tengo <strong>18 años o más</strong> y acepto los{' '}
                      <Link component={RouterLink} to="/terms" target="_blank" rel="noopener" color="primary">
                        Términos y Condiciones y la Política de Privacidad
                      </Link>.
                    </Typography>
                  }
                />
              </Box>
              {termsErr && <Alert severity="error" role="alert" sx={{ width: '100%' }}>{termsErr}</Alert>}

              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ width: '100%', minHeight: 40 }}>
                <Tab label="Entrar" sx={{ minHeight: 40 }} />
                <Tab label="Crear cuenta" sx={{ minHeight: 40 }} />
              </Tabs>

              {error && <Alert severity="error" role="alert" sx={{ width: '100%' }}>{error}</Alert>}
              {vieneDePostNoAccesible && (
                // No afirma que el posteo exista ni que sea privado: la API
                // responde 404 igual para "no existe" y para "es de
                // amistades" — decirlo distinto filtraría esa distinción.
                <Alert severity="info" role="status" sx={{ width: '100%' }}>
                  Inicia sesión para ver si tienes acceso a esta publicación.
                </Alert>
              )}

              {/* Correo — primero: es el método que cualquiera entiende */}
              <Box component="form" onSubmit={pedirEnlaceMagico} sx={{ width: '100%' }}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Tu correo"
                    type="email"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    fullWidth
                    autoFocus
                    InputProps={{ startAdornment: <MailOutlineIcon fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} /> }}
                  />
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={emailBusy || !termsAccepted}>
                    {emailBusy ? 'Enviando…' : esAlta ? 'Crear cuenta con correo' : 'Entrar con enlace por correo'}
                  </Button>
                  {esAlta && (
                    <Typography variant="caption" color="text.secondary">
                      Te mandamos un enlace para confirmar tu correo y crear tu cuenta.
                    </Typography>
                  )}
                  {emailErr && <Alert severity="error" role="alert">{emailErr}</Alert>}
                  {emailMsg && <Alert severity="success" role="status">{emailMsg}</Alert>}
                </Stack>
              </Box>

              <Divider flexItem>o</Divider>

              {/* Llave de acceso — segundo */}
              <Stack spacing={1.5} sx={{ width: '100%' }}>
                {esAlta ? (
                  <>
                    <TextField
                      label="Handle (opcional)"
                      placeholder="como quieres llamarte"
                      value={handlePropuesto}
                      onChange={e => setHandlePropuesto(e.target.value)}
                      fullWidth
                      size="small"
                      inputProps={{ maxLength: 20, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                    />
                    <Button
                      variant="contained" size="large" fullWidth startIcon={<VpnKeyIcon />}
                      onClick={crearCuentaConPasskey} disabled={passkeyBusy || !termsAccepted}
                    >
                      {passkeyBusy ? 'Creando…' : 'Crear cuenta con llave de acceso'}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outlined" size="large" fullWidth startIcon={<VpnKeyIcon />}
                    onClick={entrarConPasskey} disabled={passkeyBusy || !termsAccepted}
                  >
                    {passkeyBusy ? 'Conectando…' : 'Entrar con llave de acceso'}
                  </Button>
                )}
                {passkeyError && <Alert severity="error" role="alert">{passkeyError}</Alert>}
              </Stack>

              <Divider flexItem>o</Divider>

              {/* Mastodon — tercero y colapsado: es el método que menos gente
                  entiende, así que el trabajo del panel es descalificar rápido,
                  no convertir a nadie. */}
              <Box sx={{ width: '100%' }}>
                <Button
                  fullWidth
                  onClick={() => setMastodonOpen(v => !v)}
                  endIcon={mastodonOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ justifyContent: 'space-between', color: 'text.secondary', textTransform: 'none' }}
                  aria-expanded={mastodonOpen}
                >
                  ¿Qué es Mastodon? — solo si ya tienes cuenta
                </Button>
                <Collapse in={mastodonOpen}>
                  <Stack spacing={1.5} sx={{ pt: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Mastodon es una red social federada: tu cuenta vive en un servidor independiente (una
                      "instancia"), no en WeedTown. Si ya tienes una cuenta ahí, puedes usarla para entrar.
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ¿No sabes si tienes? Entonces no tienes — entra con tu correo, arriba.
                    </Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      {INSTANCIAS_SUGERIDAS.map(host => (
                        <Link
                          key={host}
                          href={`https://${host}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="body2"
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                        >
                          {host} <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </Link>
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Estos enlaces te llevan fuera de WeedTown.
                    </Typography>

                    <Box component="form" onSubmit={handleSubmit}>
                      <Stack spacing={1.5}>
                        <TextField
                          id="mastodon-instance"
                          label="Tu instancia de Mastodon"
                          placeholder="mastodon.social"
                          value={instance}
                          onChange={e => setInstance(e.target.value)}
                          required
                          fullWidth
                          size="small"
                          helperText="Ejemplo: mastodon.social, mstdn.mx, hachyderm.io"
                        />
                        <Button type="submit" variant="outlined" fullWidth disabled={!termsAccepted}>
                          {esAlta ? 'Crear cuenta con Mastodon' : 'Entrar con Mastodon'}
                        </Button>
                      </Stack>
                    </Box>
                  </Stack>
                </Collapse>
              </Box>

              <Typography variant="caption" color="text.secondary" textAlign="center">
                No creamos contraseñas: entra con un enlace por correo, una llave de acceso o Mastodon.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>
      <Footer />
    </Box>
  );
};

export default Login;
