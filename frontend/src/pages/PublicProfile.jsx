import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Container, Card, CardContent, Typography, Avatar, Box, Stack, Button, Chip,
  CircularProgress, Alert, Divider
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import Navbar from '../components/Navbar';
import ContentActions from '../components/ContentActions';
import api from '../services/api';

// Perfil de otra persona (HU-AMI-002): datos públicos siempre, "sobre mí"
// solo cuando friendStatus es "friends" (el backend ya decide eso, aquí solo
// se pinta lo que llega). El botón de relación es la puerta de entrada al
// sistema de amistad — no hay buscador todavía, se llega desde un post.
const PublicProfile = () => {
  const { id } = useParams();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accionError, setAccionError] = useState('');
  const [bloqueado, setBloqueado] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    setError('');
    api.get(`/profile/${id}`)
      .then(res => setPerfil(res.data))
      .catch(() => setError('No se encontró ese perfil.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const conAccion = async (fn) => {
    setBusy(true);
    setAccionError('');
    try {
      await fn();
      await cargar();
    } catch (e) {
      setAccionError(e.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const agregarAmigo = () => conAccion(() => api.post(`/friends/request/${id}`));
  const cancelarOQuitar = () => conAccion(() => api.delete(`/friends/${id}`));
  const aceptar = () => conAccion(() => api.post(`/friends/accept/${perfil.friendRequestId}`));
  const rechazar = () => conAccion(() => api.post(`/friends/reject/${perfil.friendRequestId}`));

  if (loading) {
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
                  user={{ id: Number(id), name: perfil.name, displayName: perfil.displayName }}
                  report={{ targetType: 'USER', targetId: Number(id) }}
                  onBlocked={() => setBloqueado(true)}
                />
              )}
            </Stack>

            {perfil.bio && (
              <Typography variant="body1" sx={{ mt: 3, whiteSpace: 'pre-wrap' }}>{perfil.bio}</Typography>
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
          </CardContent>
        </Card>
      </Container>
    </>
  );
};

export default PublicProfile;
