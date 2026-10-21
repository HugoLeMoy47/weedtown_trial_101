import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Box, Container, Card, CardContent, Typography, Button, Stack, Divider, Alert,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Link
} from '@mui/material';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import ConsentimientosPanel from './ConsentimientosPanel';
import AccountPrivacy from './AccountPrivacy';
import {
  modoDePuerta, tomarMarcaDeTerminos, posponerAvisoDeTerminos, avisoDeTerminosPospuesto, fechaLarga,
  franjaDeTerminos, cerrarFranjaDeTerminos, franjaDeTerminosCerrada
} from '../lib/terminos';

// La capa base de los Términos: registro, aviso y compuerta (ciclos 19.5 y 20).
//
// Envuelve las rutas (va DENTRO del <Router> y FUERA de <Routes>) y decide, una
// vez por cuenta y sesión, entre cuatro modos (ver `modoDePuerta`):
//
//   libre       no pinta nada.
//   registrar   quien acaba de entrar marcando la casilla de ESTA versión:
//               se registra en silencio, sin pedirle nada. Mientras tanto se
//               muestra un indicador y NO las pantallas, para que ninguna
//               petición salga antes y se tope con la compuerta del servidor.
//   dialogo     le falta aceptarla pero aún hay plazo: aviso con «Más tarde».
//   compuerta   le falta aceptarla y el plazo venció: una pantalla que la
//               exige. La cuenta NO se borra: ahí mismo se puede aceptar,
//               descargar los datos o eliminarla.
//
// QUÉ SE EXIGE Y QUÉ NO. Solo la BASE (los Términos y el medidor anónimo). Las
// decisiones opcionales que se muestran en la compuerta salen apagadas y NO
// condicionan nada: se pueden dejar tal cual y seguir.
//
// DOS DEFENSAS, y la de verdad es la del servidor: `requireAuth` responde 403 a
// todo lo que no sea esta pantalla. Si esto fallara, el servidor igual protege;
// si el servidor dice 403 con la sesión abierta, el interceptor de api.js avisa
// y esta pantalla aparece sin recargar.
//
// `/terms` queda siempre accesible: no se puede exigir aceptar un texto que no se
// puede leer.
const RUTAS_ABIERTAS = ['/terms', '/baja']; // `/baja` (ciclo 22): darse de baja de un correo nunca puede quedar detrás de la compuerta

const Cargando = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }} role="status" aria-label="Cargando">
    <CircularProgress />
  </Box>
);

const PuertaTerminos = ({ children }) => {
  const { user, setUser, logout, loading } = useAuth();
  const location = useLocation();
  const [estado, setEstado] = useState({ para: null, modo: 'libre' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [franjaCerrada, setFranjaCerrada] = useState(franjaDeTerminosCerrada());
  // `tomarMarcaDeTerminos()` CONSUME la marca, y en desarrollo StrictMode monta
  // dos veces: sin esta guarda la segunda pasada vería la marca ya consumida y
  // pediría lo que acaba de registrar. Una decisión por cuenta y sesión.
  const decididoPara = useRef(null);

  const registrar = async (version) => {
    const res = await api.post('/profile/me/terminos', { version });
    setUser(u => (u ? {
      ...u,
      terminosVersion: res.data.terminosVersion,
      terminosAceptadosEn: res.data.terminosAceptadosEn,
      terminosExigidos: false
    } : u));
  };

  useEffect(() => {
    if (!user?.id) { decididoPara.current = null; return; }
    if (decididoPara.current === user.id) return;
    decididoPara.current = user.id;
    const modo = modoDePuerta(user, tomarMarcaDeTerminos());
    if (modo === 'registrar') {
      setEstado({ para: user.id, modo: 'registrando' });
      registrar(user.terminosVigentes)
        .then(() => setEstado({ para: user.id, modo: 'libre' }))
        // Si falla no se inventa una aceptación: cae en lo que le corresponde.
        .catch(() => setEstado({ para: user.id, modo: user.terminosExigidos ? 'compuerta' : 'dialogo' }));
    } else {
      setEstado({ para: user.id, modo });
    }
    setDialogoAbierto(modo === 'dialogo' && !avisoDeTerminosPospuesto());
  // `registrar` solo usa `setUser` y `api`, estables; la decisión es por cuenta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // El servidor dijo 403 TERMINOS_PENDIENTES con la sesión ya abierta (llegó el
  // límite mientras estaba usando la app): se muestra la compuerta sin recargar.
  useEffect(() => {
    const alPendiente = () => {
      setUser(u => (u ? { ...u, terminosExigidos: true } : u));
      setEstado(e => ({ ...e, modo: 'compuerta' }));
    };
    window.addEventListener('wt:terminos-pendientes', alPendiente);
    return () => window.removeEventListener('wt:terminos-pendientes', alPendiente);
  }, [setUser]);

  const aceptar = async () => {
    setGuardando(true);
    setError('');
    try {
      await registrar(user.terminosVigentes);
      setDialogoAbierto(false);
      setEstado(e => ({ ...e, modo: 'libre' }));
    } catch {
      setError('No se pudo registrar. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const masTarde = () => {
    posponerAvisoDeTerminos();
    setDialogoAbierto(false);
  };

  if (loading || !user) return children;
  if (RUTAS_ABIERTAS.includes(location.pathname)) return children;
  if (estado.para !== user.id || estado.modo === 'registrando') return <Cargando />;

  const limite = fechaLarga(user.terminosLimite);

  if (estado.modo === 'compuerta') {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
                  Para seguir en WeedTown, acepta los Términos
                </Typography>
                <Typography variant="body1" paragraph>
                  Actualizamos los Términos y la Política de Privacidad (versión {user.terminosVigentes}).
                  Es necesario aceptarlos para operar la red{limite ? `, y el plazo venció el ${limite}` : ''}.
                  Tu cuenta, tus publicaciones y tus mensajes siguen intactos: no se borra nada.
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Lo que aceptas es la <strong>capa base</strong>: los Términos y un medidor general y anónimo de cuántas
                  personas usan WeedTown cada día. De tu cuenta solo guardamos <strong>la fecha del último día que
                  entraste</strong>, sin hora ni páginas, y esa fecha se sobrescribe. Todo lo demás es opcional, está
                  apagado y lo decides tú más abajo.
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
                  <Button variant="contained" size="large" onClick={aceptar} disabled={guardando}>
                    Acepto los Términos y continúo
                  </Button>
                  <Button component={RouterLink} to="/terms" target="_blank" rel="noopener" variant="outlined">
                    Leer los Términos
                  </Button>
                </Stack>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" component="h2" fontWeight="bold" gutterBottom>
                  Tus decisiones opcionales
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Ninguna es necesaria para entrar, y puedes cambiarlas después en «Mis decisiones de privacidad».
                </Typography>
                <ConsentimientosPanel enlacePerfil={false} />
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" component="h2" fontWeight="bold" gutterBottom>
                  Si prefieres no aceptar
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Es tu decisión y la respetamos: no podrás usar la red, pero tus datos son tuyos. Puedes descargarlos
                  o eliminar tu cuenta aquí mismo, o simplemente cerrar sesión y volver cuando quieras.
                </Typography>
                <AccountPrivacy />
                <Button onClick={logout} sx={{ mt: 2 }}>Cerrar sesión</Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  // La franja con la cuenta regresiva (ciclo 21). Arriba y en el flujo normal, no
  // flotando: así no tapa la navegación ni el contenido. Solo mientras hay plazo.
  const franja = franjaDeTerminos(user, franjaCerrada);
  const cerrarFranja = () => { cerrarFranjaDeTerminos(); setFranjaCerrada(true); };

  return (
    <>
      {franja && (
        <Alert
          severity="info"
          role="status"
          sx={{ borderRadius: 0, alignItems: 'center' }}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={() => setDialogoAbierto(true)}>Leer y aceptar</Button>
              {franja.cerrable && <Button color="inherit" size="small" onClick={cerrarFranja}>Cerrar</Button>}
            </Stack>
          }
        >
          <strong>{franja.dias === 1 ? 'Queda 1 día' : `Quedan ${franja.dias} días`}</strong> para aceptar los Términos
          actualizados{limite ? ` (hasta el ${limite})` : ''}. Tu cuenta no se borra si no lo haces, pero no podrás usar la red.
        </Alert>
      )}
      {children}
      <Dialog open={dialogoAbierto} onClose={masTarde} aria-labelledby="titulo-terminos" maxWidth="sm" fullWidth>
        <DialogTitle id="titulo-terminos">Actualizamos los Términos</DialogTitle>
        <DialogContent>
          <Typography variant="body2" paragraph>
            Actualizamos los Términos y la Política de Privacidad (versión {user.terminosVigentes}). Lo nuevo, en una
            frase: para saber si la comunidad está viva, contamos cuántas personas usan WeedTown cada día. Guardamos{' '}
            <strong>solo la fecha del último día en que entraste</strong> —sin hora, sin páginas, sin lo que
            leíste— y esa fecha se sobrescribe: no hay lista de tus visitas.
          </Typography>
          <Typography variant="body2" paragraph>
            {limite
              ? <>A partir del <strong>{limite}</strong> será necesario aceptarlos para seguir usando WeedTown. </>
              : null}
            Si no los aceptas, <strong>tu cuenta no se borra</strong>: podrás descargar tus datos o eliminarla.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            También estrenamos <Link component={RouterLink} to="/privacidad" onClick={masTarde} color="primary">Mis decisiones de privacidad</Link>:
            lo demás —avisos por correo, novedades, medición personal— es opcional, está apagado y lo decides tú.
          </Typography>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button component={RouterLink} to="/terms" target="_blank" rel="noopener" variant="outlined">
            Leer los Términos
          </Button>
          <Button onClick={masTarde} variant="outlined" disabled={guardando}>
            Más tarde
          </Button>
          <Button onClick={aceptar} variant="outlined" disabled={guardando}>
            Acepto
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PuertaTerminos;
