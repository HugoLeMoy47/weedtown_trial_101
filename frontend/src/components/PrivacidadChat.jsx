import React, { useState } from 'react';
import {
  Card, CardContent, Typography, Stack, Switch, FormControlLabel,
  Alert, CircularProgress, Box
} from '@mui/material';
import MarkChatReadIcon from '@mui/icons-material/MarkChatRead';
import api from '../services/api';

/**
 * Ajustes de privacidad para el chat de WeedTown (Ciclo Chat).
 * Implementa reciprocidad estricta en confirmaciones de lectura y presencia.
 */
const PrivacidadChat = ({ valores, onCambio }) => {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const confirmaciones = valores?.confirmacionesLectura !== false;
  const enLinea = valores?.mostrarEnLinea !== false;

  const handleToggle = async (campo, nuevoValor) => {
    setGuardando(true);
    setError('');
    try {
      const res = await api.put('/profile/me', { [campo]: nuevoValor });
      if (onCambio) onCambio(res.data.user);
    } catch (err) {
      setError(err.response?.data?.errors?.[0] || 'No se pudo guardar la preferencia');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <MarkChatReadIcon color="primary" />
          <Typography variant="h6" component="h2">Privacidad del Chat</Typography>
          {guardando && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Controla qué señales de actividad compartes. WeedTown aplica <strong>reciprocidad estricta</strong>:
          lo que decides no compartir tampoco podrás verlo de las demás personas.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Stack spacing={2}>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={confirmaciones}
                  disabled={guardando}
                  onChange={(e) => handleToggle('confirmacionesLectura', e.target.checked)}
                  color="primary"
                />
              }
              label={<Typography variant="subtitle2">Confirmaciones de lectura (Visto ✓✓)</Typography>}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 4 }}>
              Si las desactivas, nadie sabrá cuándo leíste sus mensajes, y tampoco podrás ver cuándo leen los tuyos.
            </Typography>
          </Box>

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={enLinea}
                  disabled={guardando}
                  onChange={(e) => handleToggle('mostrarEnLinea', e.target.checked)}
                  color="primary"
                />
              }
              label={<Typography variant="subtitle2">Estado de presencia (En línea)</Typography>}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 4 }}>
              Muestra un punto verde cuando estás dentro del chat. Si lo desactivas, tampoco podrás ver quién está en línea.
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default PrivacidadChat;
