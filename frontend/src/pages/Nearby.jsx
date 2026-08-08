import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container, Box, Paper, Typography, Button, Alert, Stack, List, ListItem,
  ListItemAvatar, ListItemText, Avatar, Chip, CircularProgress, Divider,
  IconButton, Tooltip, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import LocationOffIcon from '@mui/icons-material/LocationOff';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import WavingHandIcon from '@mui/icons-material/WavingHand';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { MapContainer, TileLayer, Circle, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Navbar from '../components/Navbar';
import ContentActions from '../components/ContentActions';
import api from '../services/api';
import { getMyCell } from '../lib/geo';
import { mensajeCuarentena } from '../lib/cuarentena';
import { rutaPerfil } from '../lib/rutaPerfil';
import { intencionPor } from '../lib/intencionCerca';
import SelectorIntencion from '../components/SelectorIntencion';

// Radio visual de una celda de la cuadrícula (~2.2 km de lado) en metros
const ZONE_RADIUS_M = 1100;

// Sin esto, Leaflet no se entera cuando su contenedor cambia de alto — al
// girar el teléfono, o al aparecer/ocultarse la barra de direcciones móvil —
// y pinta cuadros grises o deja los círculos de zona descolocados. No tiene
// nada que ver con la barra de navegación del ciclo 3; es un bug de Leaflet
// que ya existía y que un layout más dinámico vuelve más frecuente. Debe
// vivir DENTRO de <MapContainer> — react-leaflet solo expone la instancia del
// mapa a componentes hijos, vía useMap().
function InvalidarAlRedimensionar() {
  const map = useMap();
  useEffect(() => {
    const contenedor = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(contenedor);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

const Nearby = () => {
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(null); // null = cargando estado
  // Intención propia (ciclo 10C): viaja junto al estado de compartir
  const [miIntencion, setMiIntencion] = useState({ intencion: null, intencionHasta: null, horas: [2, 4, 8] });
  const [data, setData] = useState(null);       // { myZone, people, zones }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pokes, setPokes] = useState({}); // id -> 'sent' | 'cooldown'
  // Preferencia del momento, no una configuración: nace en 'todas' cada vez que se abre la página
  const [soloAmigos, setSoloAmigos] = useState(false);

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
        setMiIntencion({
          intencion: res.data.intencion,
          intencionHasta: res.data.intencionHasta,
          horas: res.data.horasDisponibles || [2, 4, 8]
        });
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
      // La intención se va con la zona (el backend la borra); la pantalla lo refleja
      setMiIntencion(m => ({ ...m, intencion: null, intencionHasta: null }));
    } catch {
      setError('No se pudo desactivar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const sendPoke = async (person) => {
    try {
      await api.post('/nearby/poke', { userId: person.id });
      setPokes(prev => ({ ...prev, [person.id]: 'sent' }));
    } catch (e) {
      if (e.response?.status === 429) {
        setPokes(prev => ({ ...prev, [person.id]: 'cooldown' }));
      } else {
        setError(mensajeCuarentena(e) || e.response?.data?.error || 'No se pudo mandar el toque.');
      }
    }
  };

  const openChat = (person) => {
    navigate('/chat', { state: { withUser: { id: person.id, name: person.name, displayName: person.displayName, avatar: person.avatar, handle: person.handle } } });
  };

  const displayName = (p) => p.displayName || p.name;

  // Filtro del lado del cliente sobre los datos que ya trajo /api/nearby — sin
  // parámetro nuevo en el endpoint (tiene su propio rate limit anti-scraping).
  const personasVisibles = data ? (soloAmigos ? data.people.filter(p => p.isFriend) : data.people) : [];

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 2 }}
        >
          <Typography variant="h5" component="h1">Cerca</Typography>
          {sharing && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
                  🔒 Tu posición exacta <strong>nunca sale de tu navegador</strong>: antes de enviarse se convierte a una zona de ~2 km. El servidor solo conoce la zona, nunca el punto.
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
            {/* Ciclo 10C: arriba de todo, porque declarar para qué andas es
                la acción que convierte el mapa de presencia en uno de
                disponibilidad — y es lo primero que conviene ver al entrar. */}
            <SelectorIntencion
              intencion={miIntencion.intencion}
              intencionHasta={miIntencion.intencionHasta}
              horas={miIntencion.horas}
              onCambio={(nuevo) => {
                setMiIntencion(m => ({ ...m, ...nuevo }));
                loadNearby();
              }}
            />
            <Paper sx={{ overflow: 'hidden' }}>
              <MapContainer
                center={[data.myZone.lat, data.myZone.lon]}
                zoom={11}
                // dvh, no vh: en iOS Safari `vh` se calcula contra el viewport
                // GRANDE (el que existe con la barra de direcciones oculta),
                // así que el mapa saldría más alto de lo esperado.
                style={{ height: 'clamp(260px, 45dvh, 420px)', width: '100%' }}
                scrollWheelZoom
              >
                <InvalidarAlRedimensionar />
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
                  <LeafletTooltip permanent direction="center">Tu zona</LeafletTooltip>
                </Circle>
                {/* Zonas con gente (agregadas por celda, sin pins individuales) */}
                {data.zones.filter(z => z.cell !== data.myZone.cell).map(z => (
                  <Circle
                    key={z.cell}
                    center={[z.lat, z.lon]}
                    radius={ZONE_RADIUS_M}
                    pathOptions={{ color: '#455a64', fillColor: '#546e7a', fillOpacity: 0.3 }}
                  >
                    <LeafletTooltip direction="center">🌿 {z.count} {z.count === 1 ? 'persona' : 'personas'}</LeafletTooltip>
                  </Circle>
                ))}
              </MapContainer>
            </Paper>

            <Paper>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
                spacing={1}
                sx={{ px: 2, pt: 2 }}
              >
                <Typography variant="subtitle1" fontWeight={700}>
                  {personasVisibles.length === 0
                    ? (soloAmigos ? 'Ninguna amistad por tu zona ahora mismo' : 'Aún no hay nadie más por tu zona')
                    : `${personasVisibles.length} ${personasVisibles.length === 1 ? 'persona' : 'personas'} por tu zona`}
                </Typography>
                {data.people.length > 0 && (
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={soloAmigos ? 'amigos' : 'todas'}
                    onChange={(_e, val) => { if (val) setSoloAmigos(val === 'amigos'); }}
                    aria-label="Filtrar personas por amistad"
                  >
                    <ToggleButton value="todas" aria-label="Ver todas las personas">Todas</ToggleButton>
                    <ToggleButton value="amigos" aria-label="Ver solo mis amistades">Solo mis amistades</ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>
              {personasVisibles.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  {soloAmigos
                    ? 'Ninguna de tus amistades está compartiendo su zona ahora mismo.'
                    : 'Sé la semilla de tu zona 🌱 — cuando alguien más comparta la suya, aparecerá aquí.'}
                </Typography>
              ) : (
                <List>
                  {personasVisibles.map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i > 0 && <Divider component="li" />}
                      <ListItem
                        secondaryAction={
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title={pokes[p.id] === 'sent' ? 'Toque enviado' : pokes[p.id] === 'cooldown' ? 'Ya le mandaste un toque hace poco' : 'Mandar un toque 👋'}>
                              <span>
                                <IconButton
                                  size="small"
                                  color={pokes[p.id] === 'sent' ? 'primary' : 'default'}
                                  onClick={() => sendPoke(p)}
                                  disabled={Boolean(pokes[p.id])}
                                  aria-label={`Mandar un toque a ${displayName(p)}`}
                                >
                                  <WavingHandIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Button size="small" startIcon={<ChatBubbleOutlineIcon />} onClick={() => openChat(p)}>
                              Mensaje
                            </Button>
                            <ContentActions user={p} report={{ targetType: 'USER', targetId: p.id }} onBlocked={loadNearby} />
                          </Stack>
                        }
                      >
                        <ListItemAvatar component={RouterLink} to={rutaPerfil(p)}>
                          <Avatar src={p.avatar || undefined} sx={{ bgcolor: 'primary.main' }}>
                            {displayName(p).charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Typography
                              component={RouterLink}
                              to={rutaPerfil(p)}
                              variant="body1"
                              sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                            >
                              {displayName(p)}
                            </Typography>
                          }
                          secondary={
                            <Stack direction="row" spacing={1} alignItems="center" component="span" flexWrap="wrap" useFlexGap>
                              <Chip label={p.band} size="small" color={p.band === 'En tu zona' ? 'primary' : 'default'} component="span" />
                              {/* La intención va primero entre los distintivos:
                                  es lo que dice si tiene sentido acercarse. */}
                              {intencionPor(p.intencion) && (
                                <Chip
                                  label={`${intencionPor(p.intencion).emoji} ${intencionPor(p.intencion).ajena}`}
                                  size="small"
                                  variant="filled"
                                  color={intencionPor(p.intencion).color === 'default' ? undefined : intencionPor(p.intencion).color}
                                  component="span"
                                  aria-label={`${displayName(p)} ${intencionPor(p.intencion).ajena}`}
                                />
                              )}
                              {p.isFriend && (
                                <Chip
                                  icon={<PeopleAltIcon />}
                                  label="Amistad"
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  component="span"
                                  aria-label={`${displayName(p)} es tu amistad`}
                                />
                              )}
                              <Typography variant="caption" color="text.secondary" component="span">@{p.handle}</Typography>
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
