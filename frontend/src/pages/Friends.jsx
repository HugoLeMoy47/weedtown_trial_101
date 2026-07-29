import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container, Card, CardContent, Typography, List, ListItem, ListItemAvatar, ListItemButton,
  ListItemText, Avatar, Button, CircularProgress, Box, Alert, Stack
} from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import Navbar from '../components/Navbar';
import api from '../services/api';

// Bandeja de amistad (HU-AMI-001): solicitudes recibidas (aceptar/rechazar),
// enviadas (cancelar) y la lista de amigos ya aceptados. Todo lo que no es
// "propio contenido" apunta al perfil ajeno (/perfil/:id) — ahí vive el
// detalle y las mismas acciones, esto es solo el resumen.
const Friends = () => {
  const [amigos, setAmigos] = useState(null);
  const [recibidas, setRecibidas] = useState(null);
  const [enviadas, setEnviadas] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

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
                    {amigos.map(a => <Persona key={a.user.id} user={a.user} />)}
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
