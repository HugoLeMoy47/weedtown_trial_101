import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Paper, Typography, Button, Alert, Stack, List, ListItem,
  ListItemAvatar, ListItemText, Avatar, Chip, CircularProgress, Divider
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import LocationOffIcon from '@mui/icons-material/LocationOff';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { MapContainer, TileLayer, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { getMyCell } from '../lib/geo';

// Radio visual de una celda geohash-5 (~4.9 km de lado) en metros
const ZONE_RADIUS_M = 2600;

const Nearby = () => {
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(null); // null = cargando estado
  const [data, setData] = useState(null);       // { myZone, people, zones }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadNearby = useCallback(async () => {
    try {
      const res = await api.get('/nearby');
      setData(res.data);
    } catch (e) {
      if (e.response?.status !== 403) setError('No se pudo cargar el mapa.');
      setData(null);
    }
  }, []);

  // Estado inicial: ¿ya comparto mi zona?
  useEffect(() => {
    api.get('/nearby/location')
      .then(res => {
        setSharing(res.data.sharing);
        if (res.data.sharing) loadNearby();
      })
      .catch(() => setSharing(false));
  }, [loadNearby]);

  const shareZone = async () => {
    setBusy(true);
    setError('');
    try {
      const cell = await getMyCell(); // la ofuscación ocurre en el navegador
      await api.put('/nearby/location', { cell });
      setSharing(true);
      await loadNearby();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'No se pudo activar Cerca.');
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    setBusy(true);
    setError('');
    try {
      await api.delete('/nearby/location');
      setSharing(false);
      setData(null);
    } catch {
      setError('No se pudo desactivar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const openChat = (person) => {
    navigate('/chat', { state: { withUser: { id: person.id, name: person.name, displayName: person.displayName, avatar: person.avatar, acct: person.acct } } });
  };

  const displayName = (p) => p.displayName || p.name;

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5" component="h1">Cerca</Typography>
          {sharing && (
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<MyLocationIcon />} onClick={shareZone} disabled={busy}>
                Actualizar mi zona
              </Button>
              <Button size="small" color="secondary" startIcon={<LocationOffIcon />} onClick={stopSharing} disabled={busy}>
                Dejar de compartir
              </Button>
            </Stack>
          )}
        </Stack>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {sharing === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
        ) : !sharing ? (
          /* Consentimiento: se explica ANTES de pedir permiso al navegador */
          <Paper sx={{ p: 4, maxWidth: 560, mx: 'auto' }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <ShieldOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
              <Typography variant="h6" component="h2">Conoce a la comunidad de tu zona</Typography>
              <Typography color="text.secondary">
                Cerca te muestra a otras personas de WeedTown en tu área — sin exponer tu ubicación:
              </Typography>
              <Stack spacing={1} sx={{ textAlign: 'left' }} component="ul">
                <Typography component="li" variant="body2">
                  🔒 Tu posición exacta <strong>nunca sale de tu navegador</strong>: antes de enviarse se convierte a una zona de ~5 km. El servidor solo conoce la zona.
                </Typography>
                <Typography component="li" variant="body2">
                  🤝 Es <strong>recíproco</strong>: solo ves a quienes comparten su zona, y solo te ven si tú compartes la tuya.
                </Typography>
                <Typography component="li" variant="body2">
                  ⏳ Tu zona <strong>caduca a los 7 días</strong> si no la actualizas, y puedes borrarla cuando quieras.
                </Typography>
              </Stack>
              <Button variant="contained" size="large" startIcon={<MyLocationIcon />} onClick={shareZone} disabled={busy}>
                {busy ? 'Activando…' : 'Compartir mi zona'}
              </Button>
            </Stack>
          </Paper>
        ) : !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
        ) : (
          <Stack spacing={2}>
            <Paper sx={{ overflow: 'hidden' }}>
              <MapContainer
                center={[data.myZone.lat, data.myZone.lon]}
                zoom={11}
                style={{ height: 380, width: '100%' }}
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/* Mi zona */}
                <Circle
                  center={[data.myZone.lat, data.myZone.lon]}
                  radius={ZONE_RADIUS_M}
                  pathOptions={{ color: '#33691e', fillColor: '#8bc34a', fillOpacity: 0.25 }}
                >
                  <Tooltip permanent direction="center">Tu zona</Tooltip>
                </Circle>
                {/* Zonas con gente (agregadas por celda, sin pins individuales) */}
                {data.zones.filter(z => z.cell !== data.myZone.cell).map(z => (
                  <Circle
                    key={z.cell}
                    center={[z.lat, z.lon]}
                    radius={ZONE_RADIUS_M}
                    pathOptions={{ color: '#455a64', fillColor: '#546e7a', fillOpacity: 0.3 }}
                  >
                    <Tooltip direction="center">🌿 {z.count} {z.count === 1 ? 'persona' : 'personas'}</Tooltip>
                  </Circle>
                ))}
              </MapContainer>
            </Paper>

            <Paper>
              <Typography variant="subtitle1" fontWeight={700} sx={{ px: 2, pt: 2 }}>
                {data.people.length === 0
                  ? 'Aún no hay nadie más por tu zona'
                  : `${data.people.length} ${data.people.length === 1 ? 'persona' : 'personas'} por tu zona`}
              </Typography>
              {data.people.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Sé la semilla de tu zona 🌱 — cuando alguien más comparta la suya, aparecerá aquí.
                </Typography>
              ) : (
                <List>
                  {data.people.map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i > 0 && <Divider component="li" />}
                      <ListItem
                        secondaryAction={
                          <Button size="small" startIcon={<ChatBubbleOutlineIcon />} onClick={() => openChat(p)}>
                            Mensaje
                          </Button>
                        }
                      >
                        <ListItemAvatar>
                          <Avatar src={p.avatar || undefined} sx={{ bgcolor: 'primary.main' }}>
                            {displayName(p).charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={displayName(p)}
                          secondary={
                            <Stack direction="row" spacing={1} alignItems="center" component="span">
                              <Chip label={p.band} size="small" color={p.band === 'En tu zona' ? 'primary' : 'default'} component="span" />
                              <Typography variant="caption" color="text.secondary" component="span">{p.acct}</Typography>
                            </Stack>
                          }
                          secondaryTypographyProps={{ component: 'span' }}
                        />
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Paper>
          </Stack>
        )}
      </Container>
    </>
  );
};

export default Nearby;
