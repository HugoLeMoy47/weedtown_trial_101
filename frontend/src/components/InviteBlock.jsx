import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, Typography, Button, Stack, Link } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

// Diferenciadores verificables contra el README (sección "Seguridad
// primero" y la tabla de estado) — no se inventa ninguno. Si el producto deja
// de cumplir alguno, este texto debe cambiar con él.
const DIFERENCIADORES = [
  'Identidad federada: sin contraseña ni correo obligatorio',
  'Bloquea a quien te incomode, con efecto inmediato en toda la red',
  'Las fotos se suben sin EXIF ni GPS'
];

// HU-CTA-001 — bloque de invitación bajo un posteo público.
//
// Regla de producto, no estética: nada modal, nada interstitial, nada
// encima del contenido, nada temporizado, nada que bloquee el scroll.
// Por eso este componente es un <Card> normal en el flujo del documento —
// nunca un Dialog ni un Snackbar automático — y no lleva `autoFocus` en
// ningún control para no robar el foco de quien está leyendo.
const InviteBlock = ({ authorId, authorHandle }) => {
  const seguirHref = authorId
    ? `/login?ref=post&next=${encodeURIComponent(`/perfil/${authorId}`)}`
    : null;

  return (
    <Card
      component="aside"
      aria-label="Invitación a unirte a WeedTown"
      variant="outlined"
      sx={{ borderColor: 'primary.main', borderWidth: 1.5 }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <GroupsIcon color="primary" aria-hidden="true" />
            <Typography variant="h6" component="p">
              Esta conversación pasa en WeedTown
            </Typography>
          </Stack>
          <Stack spacing={0.75} component="ul" sx={{ pl: 0, listStyle: 'none', m: 0 }}>
            {DIFERENCIADORES.map((linea) => (
              <Typography
                key={linea}
                component="li"
                variant="body2"
                color="text.secondary"
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}
              >
                <CheckCircleOutlineIcon fontSize="small" color="primary" aria-hidden="true" sx={{ mt: '2px' }} />
                {linea}
              </Typography>
            ))}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Button
              component={RouterLink}
              to="/login?ref=post"
              variant="contained"
              size="large"
            >
              Únete a WeedTown
            </Button>
            {seguirHref && (
              <Link component={RouterLink} to={seguirHref} variant="body2" underline="hover">
                Sigue a @{authorHandle || 'esta cuenta'}
              </Link>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default InviteBlock;
