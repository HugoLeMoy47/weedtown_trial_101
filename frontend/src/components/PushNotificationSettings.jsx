import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, Typography, Switch, FormControlLabel, Box, Alert,
  CircularProgress, Stack, Chip
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import { isPushSupported, checkPushSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/pushManager';

const PushNotificationSettings = () => {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const check = async () => {
      const isSupp = isPushSupported();
      setSupported(isSupp);
      if (isSupp) {
        const sub = await checkPushSubscription();
        setSubscribed(Boolean(sub));
      }
      setLoading(false);
    };
    check();
  }, []);

  const handleToggle = async (e) => {
    const shouldSubscribe = e.target.checked;
    setError('');
    setSuccess('');
    setActionLoading(true);

    try {
      if (shouldSubscribe) {
        await subscribeToPush();
        setSubscribed(true);
        setSuccess('¡Notificaciones push activadas en este dispositivo! 🌿');
      } else {
        await unsubscribeFromPush();
        setSubscribed(false);
        setSuccess('Notificaciones push desactivadas en este dispositivo.');
      }
    } catch (err) {
      setError(err.message || 'Error al cambiar la configuración de notificaciones.');
      // Revertir estado si falló
      const sub = await checkPushSubscription();
      setSubscribed(Boolean(sub));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card sx={{ mt: 3 }}>
        <CardContent sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 4, pt: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          {subscribed ? <NotificationsActiveIcon color="primary" /> : <NotificationsOffIcon color="action" />}
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            Notificaciones en este dispositivo
          </Typography>
          {subscribed && <Chip label="Activas" size="small" color="primary" variant="outlined" />}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Recibe toques 👋 de Cerca, mensajes privados y respuestas al instante, incluso con la pantalla apagada o la app cerrada.
        </Typography>

        {!supported ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            Este navegador o dispositivo no soporta notificaciones Web Push. En dispositivos iOS (iPhone/iPad), asegúrate de haber agregado WeedTown a la pantalla de inicio («Compartir → Agregar a pantalla de inicio»).
          </Alert>
        ) : (
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={subscribed}
                  onChange={handleToggle}
                  disabled={actionLoading}
                  color="primary"
                />
              }
              label={
                actionLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="body2">Actualizando...</Typography>
                  </Stack>
                ) : (
                  subscribed ? 'Notificaciones push activadas' : 'Activar notificaciones push'
                )
              }
            />

            {error && <Alert severity="error" sx={{ mt: 2 }} role="alert">{error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2 }} role="status">{success}</Alert>}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default PushNotificationSettings;
