import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Container, Card, CardContent, Typography, List, ListItem, ListItemAvatar, ListItemButton,
  ListItemText, Avatar, Button, CircularProgress, Box, Alert, Stack, TextField, InputAdornment
} from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import SearchIcon from '@mui/icons-material/Search';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import Navbar from '../components/Navbar';
import api from '../services/api';

// Mismo intervalo que el resto del polling de la app (campana, badge de
// Amigos del Navbar): sin esto, una solicitud que llega mientras esta
// pantalla ya está abierta no aparece hasta recargar a mano.
const POLL_MS = 20000;

// Bandeja de amistad (HU-AMI-001): solicitudes recibidas (aceptar/rechazar),
// enviadas (cancelar) y la lista de amigos ya aceptados. Todo lo que no es
// "propio contenido" apunta al perfil ajeno (/perfil/:id) — ahí vive el
// detalle y las mismas acciones, esto es solo el resumen.
const Friends = () => {
  const navigate = useNavigate();
  const [amigos, setAmigos] = useState(null);
  const [recibidas, setRecibidas] = useState(null);
  const [enviadas, setEnviadas] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const [resultados, setResultados] = useState([]);

  const cargar = useCallback(() => {
    Promise.all([api.get('/friends'), api.get('/friends/requests')])
      .then(([f, r]) => {
        setAmigos(f.data.friends);
        setRecibidas(r.data.recibidas);
        setEnviadas(r.data.enviadas);
      })
      .catch(() => setError('No se pudo cargar tu lista de amigos.'));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  // Descubribilidad por handle: reusa /api/chat/users, que ya busca personas
  // por nombre/handle sin PII — es la misma búsqueda que abre un chat nuevo,
  // aquí solo cambia a dónde lleva el resultado (el perfil, no una conversación).
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setResultados([]); return undefined; }
    const t = setTimeout(() => {
      api.get('/chat/users', { params: { q } })
        .then(res => setResultados(res.data.users || []))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const conAccion = async (id, fn) => {
    setBusyId(id);
    setError('');
    try {
      await fn();
      await cargar();
    } catch {
      setError('No se pudo completar la acción. Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const cargando = amigos === null || recibidas === null || enviadas === null;

  const nombre = (u) => u.displayName || u.name;

  // Abrir chat con alguien: MISMO mecanismo que "Cerca" (Nearby.jsx), no uno
  // nuevo. `Chat.jsx` ya lee `location.state.withUser` y hace el POST a
  // /chat/conversations por su cuenta, así que aquí no se pide nada al backend
  // — solo se navega. Dos formas distintas de abrir una conversación serían dos
  // lugares donde arreglar el mismo bug, y quien lo arregle va a encontrar una
  // sola.
  //
  // El objeto se arma campo por campo (no `{...u}`) por la misma razón que en
  // Nearby: lo que viaja en el estado del router queda explícito y no se
  // amplía solo el día que /api/friends agregue un campo.
  //
  // La cuarentena de cuentas nuevas (HU-SEG-006/007) tampoco se maneja aquí:
  // el 403 lo produce ese POST, que vive en Chat.jsx, y ahí ya se traduce con
  // `mensajeCuarentena()` — el aviso que dice CUÁNDO va a poder, no "error".
  // Adelantar el POST a esta pantalla solo para mostrar el mismo mensaje antes
  // sería justamente inventar la segunda forma de abrir un chat.
  const abrirChat = (u) => {
    navigate('/chat', {
      state: { withUser: { id: u.id, name: u.name, displayName: u.displayName, avatar: u.avatar, handle: u.handle } }
    });
  };

  const Persona = ({ user, secondary, right }) => (
    <ListItem disableGutters secondaryAction={right}>
      <ListItemButton component={RouterLink} to={`/perfil/${user.id}`} sx={{ borderRadius: 1 }}>
        <ListItemAvatar>
          <Avatar src={user.avatar || undefined} sx={{ bgcolor: 'primary.main' }}>
            {(user.displayName || user.name || '?').charAt(0).toUpperCase()}
          </Avatar>
        </ListItemAvatar>
        <ListItemText primary={user.displayName || user.name} secondary={secondary || `@${user.handle}`} />
      </ListItemButton>
    </ListItem>
  );

  return (
    <>
      <Navbar />
      <Container maxWidth="sm" component="main" sx={{ py: 3, pb: 6 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <PeopleAltIcon color="action" />
          <Typography variant="h5" component="h1">Amigos</Typography>
        </Stack>

        <TextField
          fullWidth
          size="small"
          placeholder="Buscar personas por nombre o handle…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          inputProps={{ 'aria-label': 'Buscar personas' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" color="action" /></InputAdornment>
            )
          }}
          sx={{ mb: resultados.length > 0 ? 1 : 2 }}
        />

        {resultados.length > 0 && (
          <Card sx={{ mb: 2 }}>
            <List disablePadding>
              {resultados.map(u => <Persona key={u.id} user={u} />)}
            </List>
          </Card>
        )}

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        {cargando ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} role="status" aria-label="Cargando">
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {recibidas.length > 0 && (
              <Card>
                <CardContent>
                  <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Solicitudes recibidas</Typography>
                  <List disablePadding>
                    {recibidas.map(s => (
                      <Persona
                        key={s.id}
                        user={s.user}
                        right={
                          <Stack direction="row" spacing={1}>
                            <Button size="small" variant="contained" disabled={busyId === s.id}
                              onClick={() => conAccion(s.id, () => api.post(`/friends/accept/${s.id}`))}>
                              Aceptar
                            </Button>
                            <Button size="small" color="secondary" disabled={busyId === s.id}
                              onClick={() => conAccion(s.id, () => api.post(`/friends/reject/${s.id}`))}>
                              Rechazar
                            </Button>
                          </Stack>
                        }
                      />
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            {enviadas.length > 0 && (
              <Card>
                <CardContent>
                  <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Solicitudes enviadas</Typography>
                  <List disablePadding>
                    {enviadas.map(s => (
                      <Persona
                        key={s.id}
                        user={s.user}
                        secondary="Esperando respuesta"
                        right={
                          <Button size="small" disabled={busyId === s.id}
                            onClick={() => conAccion(s.id, () => api.delete(`/friends/${s.user.id}`))}>
                            Cancelar
                          </Button>
                        }
                      />
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent>
                <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Mis amigos</Typography>
                {amigos.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Todavía no tienes amigos. Agrega desde el perfil de alguien que ya conozcas en WeedTown.
                  </Typography>
                ) : (
                  <List disablePadding>
                    {amigos.map(a => (
                      <Persona
                        key={a.user.id}
                        user={a.user}
                        right={
                          <Button
                            size="small"
                            startIcon={<ChatBubbleOutlineIcon />}
                            onClick={() => abrirChat(a.user)}
                            aria-label={`Mandar mensaje a ${nombre(a.user)}`}
                          >
                            Mensaje
                          </Button>
                        }
                      />
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Stack>
        )}
      </Container>
    </>
  );
};

export default Friends;
