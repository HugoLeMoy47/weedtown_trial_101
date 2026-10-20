import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Stack, Typography, Switch, Chip, Alert, CircularProgress, Divider, FormControlLabel, Link
} from '@mui/material';
import api from '../services/api';

// Las decisiones opcionales de privacidad (ciclo 20), una por finalidad.
//
// REGLAS, que conviene leer antes de «mejorar» esta pantalla:
//   · TODO APAGADO por defecto, siempre. Aquí nunca se pre-marca nada: elegir que
//     sí es una acción de la persona.
//   · LOS TEXTOS NO VIVEN AQUÍ. Vienen del servidor (src/lib/consentimientos.js),
//     que es la única fuente: así lo que se muestra es exactamente la versión del
//     texto que se guarda junto a la decisión.
//   · SIEMPRE SE MUESTRA PARA QUÉ, CÓMO SE TRATA Y QUÉ NO SE HACE. Consentir sin
//     verlo no es informado.
//   · LO QUE AÚN NO EXISTE NO SE PUEDE ACTIVAR. Se muestra como «Próximamente»,
//     sin interruptor: te avisaremos y te lo preguntaremos cuando esté lista.
//   · NO BLOQUEA NADA. Ninguna de estas decisiones condiciona el acceso a la red.
function fechaCorta(iso) {
  try { return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; }
}

const MENSAJES = {
  requiere_correo: 'Para activar esto necesitas un correo en tu perfil.',
  no_disponible: 'Esta opción todavía no está lista.'
};

const ConsentimientosPanel = ({ enlacePerfil = true }) => {
  const [finalidades, setFinalidades] = useState(null);
  const [error, setError] = useState('');
  const [errorPor, setErrorPor] = useState({});
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get('/consentimientos')
      .then(res => { if (vivo) setFinalidades(res.data.finalidades || []); })
      .catch(() => { if (vivo) setError('No se pudieron cargar tus decisiones. Intenta de nuevo.'); });
    return () => { vivo = false; };
  }, []);

  const cambiar = async (finalidad, otorgado) => {
    setGuardando(finalidad);
    setErrorPor(e => ({ ...e, [finalidad]: '' }));
    try {
      const res = await api.put(`/consentimientos/${finalidad}`, { otorgado });
      setFinalidades(lista => lista.map(f => (f.finalidad === finalidad ? res.data : f)));
    } catch (e) {
      const codigo = e.response?.data?.codigo;
      setErrorPor(m => ({ ...m, [finalidad]: MENSAJES[codigo] || e.response?.data?.error || 'No se pudo guardar tu decisión.' }));
    } finally {
      setGuardando(null);
    }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!finalidades) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} aria-label="Cargando tus decisiones" /></Box>;

  return (
    <Stack spacing={2} divider={<Divider flexItem />} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {finalidades.map(f => {
        const activa = f.estado === 'activa';
        return (
          <Box component="li" key={f.finalidad}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} flexWrap="wrap">
              <Typography variant="subtitle1" component="h3" fontWeight="bold">{f.titulo}</Typography>
              {f.disponible ? (
                <FormControlLabel
                  sx={{ m: 0 }}
                  labelPlacement="start"
                  label={<Typography variant="body2" color="text.secondary">{activa ? 'Activada' : 'Desactivada'}</Typography>}
                  control={
                    <Switch
                      checked={activa}
                      disabled={guardando === f.finalidad}
                      onChange={(e) => cambiar(f.finalidad, e.target.checked)}
                      inputProps={{ 'aria-label': `${f.titulo}: ${activa ? 'activada' : 'desactivada'}` }}
                    />
                  }
                />
              ) : (
                <Chip size="small" label="Próximamente" variant="outlined" />
              )}
            </Stack>

            <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Para qué:</strong> {f.paraQue}</Typography>
            <Typography variant="body2" color="text.secondary"><strong>Cómo se trata:</strong> {f.comoSeTrata}</Typography>
            <Typography variant="body2" color="text.secondary"><strong>Qué no hacemos:</strong> {f.queNoHacemos}</Typography>

            {activa && f.decididoEn && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Activada el {fechaCorta(f.decididoEn)}. Puedes apagarla cuando quieras.
              </Typography>
            )}
            {f.estado === 'desactualizada' && (
              <Alert severity="info" sx={{ mt: 1 }}>
                El texto de esta opción cambió desde que la activaste, así que está apagada hasta que la confirmes de nuevo.
              </Alert>
            )}
            {!f.disponible && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Todavía no existe: te avisaremos y te lo preguntaremos cuando esté lista.
              </Typography>
            )}
            {errorPor[f.finalidad] && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {errorPor[f.finalidad]}{' '}
                {enlacePerfil && errorPor[f.finalidad] === MENSAJES.requiere_correo && (
                  <Link component={RouterLink} to="/profile" color="inherit" underline="always">Ir a mi perfil</Link>
                )}
              </Alert>
            )}
          </Box>
        );
      })}
    </Stack>
  );
};

export default ConsentimientosPanel;
