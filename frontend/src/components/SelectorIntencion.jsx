import React, { useState } from 'react';
import { Paper, Stack, Typography, Chip, Button, Menu, MenuItem, Alert, Box } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import api from '../services/api';
import { INTENCIONES, intencionPor, tiempoRestante } from '../lib/intencionCerca';

// Declarar para qué anda una en el mapa (ciclo 10C).
//
// Solo aparece si ya se comparte la zona: la intención es un atributo de la
// celda, no algo suelto — el backend también lo exige, esto evita ofrecer un
// botón que va a dar 403.
const SelectorIntencion = ({ intencion, intencionHasta, horas = [2, 4, 8], onCambio }) => {
  const [menu, setMenu] = useState(null);
  const [elegida, setElegida] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const actual = intencionPor(intencion);

  const abrirDuraciones = (valor) => (e) => {
    setElegida(valor);
    setMenu(e.currentTarget);
  };

  const declarar = async (h) => {
    setMenu(null);
    setGuardando(true);
    setError('');
    try {
      const res = await api.put('/nearby/intent', { intencion: elegida, horas: h });
      onCambio(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setGuardando(true);
    setError('');
    try {
      await api.delete('/nearby/intent');
      onCambio({ intencion: null, intencionHasta: null });
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo quitar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>¿Para qué andas?</Typography>

      {actual ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={`${actual.emoji} ${actual.propia}`}
            color={actual.color === 'default' ? undefined : actual.color}
            onDelete={guardando ? undefined : quitar}
          />
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
            <AccessTimeIcon fontSize="inherit" />
            <Typography variant="caption">{tiempoRestante(intencionHasta)}</Typography>
          </Stack>
        </Stack>
      ) : (
        <>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {INTENCIONES.map(i => (
              <Button
                key={i.valor}
                size="small"
                variant="outlined"
                disabled={guardando}
                onClick={abrirDuraciones(i.valor)}
              >
                {i.emoji} {i.propia}
              </Button>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Lo ven solo quienes también comparten su zona, y se borra sola cuando pasa el tiempo que elijas.
          </Typography>
        </>
      )}

      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem disabled sx={{ opacity: 1 }}>
          <Typography variant="caption" color="text.secondary">¿Por cuánto tiempo?</Typography>
        </MenuItem>
        {horas.map(h => (
          <MenuItem key={h} onClick={() => declarar(h)}>{h} horas</MenuItem>
        ))}
      </Menu>

      {error && <Box sx={{ mt: 1 }}><Alert severity="error" role="alert">{error}</Alert></Box>}
    </Paper>
  );
};

export default SelectorIntencion;
