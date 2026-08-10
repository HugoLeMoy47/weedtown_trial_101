import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container, Card, CardContent, Typography, Avatar, Box, Stack, Button, Chip,
  CircularProgress, Alert, Divider, Pagination, Link
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import Navbar from '../components/Navbar';
import ContentActions from '../components/ContentActions';
import PostCard from '../components/PostCard';
import { useAuth } from '../hooks/useAuth';
import { tomarBienvenida } from '../lib/attribution';
import { datosCuarentena } from '../lib/cuarentena';
import api from '../services/api';

// Perfil de otra persona (HU-AMI-002): datos públicos siempre, "sobre mí"
// solo cuando friendStatus es "friends" (el backend ya decide eso, aquí solo
// se pinta lo que llega).
//
// Ciclo 10A. Tres cambios:
//   · Se llega por HANDLE (`/@luna`), que es la forma compartible. `/perfil/:id`
//     se conserva porque hay enlaces viejos, y ambos caen en este componente.
//   · EXIGE SESIÓN. La ruta NO va detrás de RequireAuth a propósito: así el
//     enlace sobrevive a que lo abra alguien sin cuenta, que aterriza en el
//     login y VUELVE aquí tras darse de alta (mismo mecanismo que /p/:id).
//     Ponerlo detrás de RequireAuth mandaría al login sin recordar a dónde iba.
//   · Debajo del perfil van los posteos de esa persona, con su visibilidad
//     resuelta en el servidor.
const PublicProfile = () => {
  const { id, arrobaHandle } = useParams();
  const navigate = useNavigate();
  // La ruta captura el segmento entero (`@luna`) porque React Router v6 no
  // deja mezclar estático y parámetro — ver el comentario en App.jsx. Aquí se
  // quita la arroba y se exige que venga: `/cualquiercosa` sin arroba NO es un
  // perfil, es una URL rota, y debe comportarse como antes (al feed).
  const handle = arrobaHandle?.startsWith('@') ? arrobaHandle.slice(1) : null;
  const rutaInvalida = Boolean(arrobaHandle) && !handle;
  const { user, loading: authLoading } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sinSesion, setSinSesion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accionError, setAccionError] = useState('');
  const [cuarentena, setCuarentena] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [posts, setPosts] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  // 11A: quién invitó a esta persona, para saludarla. LEERLO LO CONSUME, y de
  // ahí todo el cuidado.
  //
  // La primera versión era `useState(() => tomarBienvenida())`, y no funciona:
  // en desarrollo `StrictMode` invoca DOS VECES el inicializador de useState, y
  // éste tiene efecto colateral. La primera llamada lee el handle y borra la
  // clave; la segunda ya encuentra null — y ese null es el que se queda. El
  // aviso no aparecía nunca, sin ningún error en consola.
  //
  // Es el mismo error que Login.jsx documenta sobre `tomarNextPendiente`, y se
  // resuelve con el patrón que ya usa AuthCallback.jsx: una guarda en `useRef`
  // que sobrevive al montaje simulado de StrictMode, así el consumo ocurre
  // exactamente una vez.
  const [invitadaPor, setInvitadaPor] = useState(null);
  const bienvenidaLeida = useRef(false);
  useEffect(() => {
    if (bienvenidaLeida.current) return;
    bienvenidaLeida.current = true;
    setInvitadaPor(tomarBienvenida());
  }, []);

  // La ruta canónica de esta persona, para volver aquí tras el login.
  const ruta = handle ? `/@${handle}` : `/perfil/${id}`;
  const rutaApi = handle ? `/profile/handle/${handle}` : `/profile/${id}`;

  const cargar = useCallback(() => {
    if (rutaInvalida) return;
    setLoading(true);
    setError('');
    api.get(rutaApi)
      .then(res => setPerfil(res.data))
      .catch(err => {
        if (err.response?.status === 401) setSinSesion(true);
        else setError('No se encontró ese perfil.');
      })
      .finally(() => setLoading(false));
  }, [rutaApi, rutaInvalida]);

  useEffect(() => { cargar(); }, [cargar]);

  // Una URL de un solo segmento sin arroba (`/loquesea`) no es un perfil: es
  // lo que antes atrapaba el catch-all. Se conserva ese comportamiento en vez
  // de dejar la pantalla colgada en el spinner.
  useEffect(() => {
    if (rutaInvalida) navigate('/feed', { replace: true });
  }, [rutaInvalida, navigate]);

  // `noindex` salvo que la persona haya encendido el perfil público (10B).
  //
  // Esto cubre a los rastreadores que SÍ ejecutan JavaScript, que son los
  // únicos que llegarían a ver algo de una SPA. Los que no, no ven nada de
  // todos modos. La defensa de verdad está en el servidor —401 sin sesión— y
  // en robots.txt; esto es la tercera capa, y la única que puede distinguir un
  // perfil público de uno privado hasta que exista la ficha del borde (11B).
  const esPublico = Boolean(perfil?.perfilPublico);
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = esPublico ? 'index, follow' : 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, [esPublico]);

  // Los posteos se piden por handle, así que hasta que el perfil no llega no
  // se sabe cuál es (cuando se entró por id).
  const handleDelPerfil = perfil?.handle;
  useEffect(() => {
    if (!handleDelPerfil) return;
    let cancelado = false;
    api.get(`/posts/de/${handleDelPerfil}?page=${pagina}`)
      .then(res => {
        if (cancelado) return;
        setPosts(res.data.posts || []);
        setTotalPaginas(res.data.totalPages || 1);
      })
      .catch(() => { if (!cancelado) setPosts([]); });
    return () => { cancelado = true; };
  }, [handleDelPerfil, pagina]);

  // Sin sesión, al login recordando a dónde iba. `ref=perfil` ya estaba en la
  // lista blanca de atribución desde el 7A, esperando justamente esto.
  //
  // La antienumeración vive en el backend: `requireAuth` corre antes del
  // handler, así que un handle que existe y uno inventado dan el MISMO 401 y
  // aterrizan en esta misma pantalla. Desde aquí no hay forma de distinguirlos
  // —y por eso este efecto no mira si el perfil existe, solo si hay sesión.
  useEffect(() => {
    if (!loading && !authLoading && sinSesion && !user) {
      navigate(`/login?ref=perfil&next=${encodeURIComponent(ruta)}`, { replace: true });
    }
  }, [loading, authLoading, sinSesion, user, ruta, navigate]);

  const conAccion = async (fn) => {
    setBusy(true);
    setAccionError('');
    setCuarentena(null);
    try {
      await fn();
      await cargar();
    } catch (e) {
      // Ciclo 13B. La cuarentena de cuentas nuevas se distingue de cualquier
      // otro error, y aquí no basta la frase de una línea que usan Chat y
      // Cerca: este es el momento en que alguien acaba de llegar POR UNA
      // INVITACIÓN y lo primero que intenta —corresponder— le sale bloqueado.
      // Con el mensaje genérico se queda parada sin saber cuánto falta ni si
      // puede hacer algo. El aviso con enlaces se pinta abajo.
      const espera = datosCuarentena(e);
      if (espera) setCuarentena(espera);
      else setAccionError(e.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  // El id sale del perfil ya cargado, no de la URL: entrando por `/@handle`
  // no hay id en los parámetros.
  const idPerfil = perfil?.id;
  const agregarAmigo = () => conAccion(() => api.post(`/friends/request/${idPerfil}`));
  const cancelarOQuitar = () => conAccion(() => api.delete(`/friends/${idPerfil}`));
  const aceptar = () => conAccion(() => api.post(`/friends/accept/${perfil.friendRequestId}`));
  const rechazar = () => conAccion(() => api.post(`/friends/reject/${perfil.friendRequestId}`));

  // Mientras se decide la redirección al login, no se pinta el error: quien no
  // tiene sesión debe ver el spinner y salir hacia /login, no un "no se
  // encontró" que además insinuaría algo sobre si ese handle existe.
  if (loading || (sinSesion && !user)) {
    return (
      <>
        <Navbar />
        <Container maxWidth="sm" sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress role="status" aria-label="Cargando perfil" />
        </Container>
      </>
    );
  }

  if (bloqueado || error || !perfil) {
    return (
      <>
        <Navbar />
        <Container maxWidth="sm" sx={{ py: 6 }}>
          <Alert severity="info">{bloqueado ? 'Bloqueaste a esta persona: ya no puedes ver su perfil.' : (error || 'Usuario no encontrado.')}</Alert>
        </Container>
      </>
    );
  }

  const nombre = perfil.displayName || perfil.name;
  const fecha = perfil.createdAt ? new Date(perfil.createdAt) : null;

  return (
    <>
      <Navbar />
      <Container maxWidth="sm" component="main" sx={{ py: 3 }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar src={perfil.avatar || undefined} alt={nombre} sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: 28 }}>
                {(nombre || '?').charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="h5" component="h1" noWrap>{nombre}</Typography>
                <Typography variant="body2" color="text.secondary">@{perfil.handle}</Typography>
                {fecha && (
                  <Typography variant="caption" color="text.secondary">
                    En WeedTown desde {fecha.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
                  </Typography>
                )}
              </Box>
              {perfil.friendStatus !== 'self' && (
                <ContentActions
                  user={{ id: idPerfil, name: perfil.name, displayName: perfil.displayName }}
                  report={{ targetType: 'USER', targetId: idPerfil }}
                  onBlocked={() => setBloqueado(true)}
                />
              )}
            </Stack>

            {/* 11A: quien acaba de darse de alta desde este enlace ve de quién
                vino. Solo si el perfil que está abierto ES el de quien invitó:
                si la persona navegó a otro lado, el saludo sería mentira.
                No hay amistad automática — se ofrece mandar solicitud, y ese
                botón ya existe abajo. Regalar la amistad por hacer clic en un
                enlace volvería cosechables los posteos de "solo amigos". */}
            {invitadaPor && perfil.handle === invitadaPor && (
              <Alert severity="success" sx={{ mt: 3 }}>
                <strong>{perfil.displayName || perfil.name}</strong> te invitó a WeedTown.
                Si se conocen, mándale una solicitud de amistad aquí abajo.
              </Alert>
            )}

            {perfil.bio && (
              <Typography variant="body1" sx={{ mt: 3, whiteSpace: 'pre-wrap' }}>{perfil.bio}</Typography>
            )}

            {/* Edad y género pueden llegar desde el 10B, si su dueña los abrió.
                El servidor ya decidió: aquí solo se pinta lo que vino. */}
            {/* `Boolean(...)` en cada condición, no el valor a secas. En JSX
                `{0 && <Chip/>}` NO renderiza nada: renderiza EL CERO, suelto,
                en medio de la tarjeta. `age` e `invitaciones` son números y
                los dos pueden valer 0 — `invitaciones` vale 0 para todo el
                mundo hasta que alguien invite, así que este bug salía en el
                perfil de cualquiera que mirara el suyo. */}
            {Boolean(perfil.age || perfil.gender || perfil.invitaciones) && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                {Boolean(perfil.age) && <Chip size="small" label={`${perfil.age} años`} />}
                {Boolean(perfil.gender) && <Chip size="small" label={perfil.gender} sx={{ textTransform: 'capitalize' }} />}
                {/* 11A. Al ver tu propio perfil llega el número exacto; a los
                    demás les llega una cubeta ("5+"). El texto se arma según
                    cuál de las dos vino, sin que el cliente decida nada de
                    privacidad — eso ya se resolvió en el servidor. */}
                {Boolean(perfil.invitaciones) && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={typeof perfil.invitaciones === 'number'
                      ? `${perfil.invitaciones} ${perfil.invitaciones === 1 ? 'persona llegó' : 'personas llegaron'} por tu enlace`
                      : `${perfil.invitaciones} personas llegaron por su enlace`}
                  />
                )}
              </Stack>
            )}

            {perfil.aboutMe && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary">Sobre mí</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{perfil.aboutMe}</Typography>
              </>
            )}

            <Divider sx={{ my: 3 }} />

            {perfil.friendStatus === 'self' && (
              <Button component={RouterLink} to="/profile" variant="outlined">Editar mi perfil</Button>
            )}

            {perfil.friendStatus === 'none' && (
              <Button startIcon={<PersonAddIcon />} variant="contained" onClick={agregarAmigo} disabled={busy}>
                {busy ? 'Enviando…' : 'Agregar amigo'}
              </Button>
            )}

            {perfil.friendStatus === 'pending_sent' && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label="Solicitud enviada" />
                <Button size="small" onClick={cancelarOQuitar} disabled={busy} color="secondary">
                  {busy ? 'Cancelando…' : 'Cancelar'}
                </Button>
              </Stack>
            )}

            {perfil.friendStatus === 'pending_received' && (
              <Stack direction="row" spacing={1}>
                <Button startIcon={<HowToRegIcon />} variant="contained" onClick={aceptar} disabled={busy}>
                  {busy ? 'Aceptando…' : 'Aceptar solicitud'}
                </Button>
                <Button onClick={rechazar} disabled={busy} color="secondary">Rechazar</Button>
              </Stack>
            )}

            {perfil.friendStatus === 'friends' && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip color="primary" label="Amigos ✓" />
                <Button size="small" onClick={cancelarOQuitar} disabled={busy} color="secondary">
                  {busy ? 'Quitando…' : 'Dejar de ser amigos'}
                </Button>
              </Stack>
            )}

            {accionError && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{accionError}</Alert>}

            {/* Ciclo 13B: el callejón sin salida de la cuarentena, con salida.
                Dice CUÁNDO se libera —el backend ya mandaba ese dato y el
                frontend lo tiraba— y ofrece las dos cosas que se pueden hacer
                mientras tanto. Ojo con cuál es cuál: completar el perfil NO
                acorta la espera y el texto no lo insinúa; agregar un correo de
                respaldo SÍ, porque baja la ventana de 24 h a 3 h. La diferencia
                es que un correo demuestra control de algo, y una biografía se
                escribe en diez segundos — también por un script. */}
            {cuarentena && (
              <Alert severity="info" role="status" sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Tu cuenta es muy nueva para mandar solicitudes — es una protección de la
                  comunidad, no un castigo. Vas a poder <strong>{cuarentena.cuando}</strong>.
                </Typography>
                <Typography variant="body2">
                  Mientras tanto, <Link component={RouterLink} to="/profile">completa tu perfil</Link>:
                  cuando se libere, quien reciba tu solicitud va a ver quién eres.
                  Y si <Link component={RouterLink} to="/profile">agregas un correo de respaldo</Link>,
                  la espera se acorta.
                </Typography>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Sus posteos, del más nuevo al más viejo. Qué entra aquí lo decide el
            servidor con la MISMA regla que el feed principal: un posteo de
            solo-amigos no aparece para quien no lo es, ni siquiera en el perfil
            de su autora. */}
        <Box component="section" aria-label={`Publicaciones de ${nombre}`} sx={{ mt: 3 }}>
          <Typography variant="overline" color="text.secondary">Publicaciones</Typography>
          {posts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {perfil.friendStatus === 'self'
                ? 'Todavía no has publicado nada.'
                : 'Nada que mostrar por aquí.'}
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onUpdated={(actualizado) => setPosts(ps => ps.map(p => (p.id === actualizado.id ? actualizado : p)))}
                  onDeleted={(borradoId) => setPosts(ps => ps.filter(p => p.id !== borradoId))}
                  onBlocked={() => setBloqueado(true)}
                />
              ))}
            </Stack>
          )}
          {totalPaginas > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination count={totalPaginas} page={pagina} onChange={(_, v) => setPagina(v)} />
            </Box>
          )}
        </Box>
      </Container>
    </>
  );
};

export default PublicProfile;
