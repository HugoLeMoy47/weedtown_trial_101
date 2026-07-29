import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, Typography, Box, Stack, Button, ToggleButton, ToggleButtonGroup,
  Alert, CircularProgress, Divider
} from '@mui/material';
import CasinoIcon from '@mui/icons-material/Casino';
import { API_ORIGIN } from '../services/api';
import api from '../services/api';

// Estudio de avatar (pixel art generado por piezas).
//
// El dibujo lo hace el servidor: aquí solo se compone la semilla y se pide el
// SVG por URL. Así no hay una segunda implementación del dibujo que mantener
// sincronizada — la misma trampa que ya tuvimos con la cuadrícula de "Cerca".
const urlDe = (semilla) => `${API_ORIGIN}/api/avatars/${semilla}.svg`;

const semillaDeUrl = (url) => {
  const m = /\/api\/avatars\/([A-Za-z0-9-]+)\.svg$/.exec(url || '');
  return m ? m[1] : null;
};

const AvatarStudio = ({ user, onSaved }) => {
  const [catalogo, setCatalogo] = useState(null);
  const [piezas, setPiezas] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const semillaActual = semillaDeUrl(user?.avatar);
  const usaFotoMastodon = Boolean(user?.mastodonAvatar && user.avatar === user.mastodonAvatar);

  useEffect(() => {
    api.get('/avatars/catalogo')
      .then(res => {
        setCatalogo(res.data);
        const desde = semillaActual ? semillaActual.split('-').slice(1).map(Number) : null;
        setPiezas(res.data.ranuras.map((r, i) => (desde && desde[i] < r.opciones.length ? desde[i] : 0)));
      })
      .catch(() => setError('No se pudo cargar el catálogo de avatares.'));
    // Solo al montar: si se recargara con cada cambio de user, se perdería la
    // selección en curso al guardar.
    // eslint-disable-next-line
  }, []);

  const semilla = catalogo && piezas ? [catalogo.version, ...piezas].join('-') : null;

  const elegir = (i, valor) => {
    setPiezas(prev => prev.map((p, j) => (j === i ? valor : p)));
    setExito('');
  };

  const alAzar = useCallback(() => {
    if (!catalogo) return;
    setPiezas(catalogo.ranuras.map(r => Math.floor(Math.random() * r.opciones.length)));
    setExito('');
  }, [catalogo]);

  const guardar = async (valorAvatar) => {
    setGuardando(true);
    setError('');
    setExito('');
    try {
      const res = await api.put('/profile/me', { avatar: valorAvatar });
      onSaved?.(res.data.user);
      setExito('Avatar actualizado');
    } catch (e) {
      setError(e.response?.data?.errors?.[0] || e.response?.data?.error || 'No se pudo guardar el avatar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>Tu avatar</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Se dibuja con piezas, no se sube ninguna imagen. Tu avatar aparece en el feed, los foros, el chat y
          junto a tu zona en Cerca.
        </Typography>

        {usaFotoMastodon && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Ahora mismo usas <strong>tu foto de Mastodon</strong>. Aparece junto a tu zona en Cerca, donde una
            cara identifica mucho más que un seudónimo. Puedes cambiarla por un avatar generado aquí abajo.
          </Alert>
        )}

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
        {exito && <Alert severity="success" role="status" sx={{ mb: 2 }}>{exito}</Alert>}

        {!catalogo || !piezas ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} role="status" aria-label="Cargando avatares">
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
            <Stack spacing={1.5} alignItems="center" sx={{ minWidth: 150 }}>
              <Box
                component="img"
                src={urlDe(semilla)}
                alt="Vista previa de tu avatar"
                sx={{
                  width: 128, height: 128, imageRendering: 'pixelated',
                  border: 1, borderColor: 'divider', borderRadius: 1
                }}
              />
              <Button size="small" startIcon={<CasinoIcon />} onClick={alAzar}>Al azar</Button>
            </Stack>

            <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
              {catalogo.ranuras.map((ranura, i) => (
                <Box key={ranura.clave}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    {ranura.etiqueta}
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={piezas[i]}
                    onChange={(_, v) => v !== null && elegir(i, v)}
                    sx={{ flexWrap: 'wrap', gap: 0.5 }}
                    aria-label={ranura.etiqueta}
                  >
                    {ranura.opciones.map((op, j) => (
                      <ToggleButton key={op} value={j} sx={{ borderRadius: 1, px: 1.2, py: 0.4 }}>
                        {op}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Box>
              ))}

              <Stack direction="row" spacing={1} sx={{ pt: 1, flexWrap: 'wrap', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={() => guardar(urlDe(semilla))}
                  disabled={guardando || semilla === semillaActual}
                >
                  {guardando ? 'Guardando…' : 'Usar este avatar'}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        )}

        {user?.mastodonAvatar && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" gutterBottom>Tu foto de Mastodon</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Puedes usarla si quieres. Ten en cuenta que se muestra a cualquiera que te vea en el feed, los
              foros o Cerca — donde va acompañada de tu zona aproximada.
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                component="img"
                src={user.mastodonAvatar}
                alt="Tu foto de perfil de Mastodon"
                sx={{ width: 56, height: 56, borderRadius: '50%', border: 1, borderColor: 'divider' }}
              />
              <Button
                size="small"
                color="secondary"
                variant="outlined"
                disabled={guardando || usaFotoMastodon}
                onClick={() => guardar(user.mastodonAvatar)}
              >
                {usaFotoMastodon ? 'En uso' : 'Usar mi foto de Mastodon'}
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AvatarStudio;
