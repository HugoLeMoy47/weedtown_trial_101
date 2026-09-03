import React, { useState, useEffect } from 'react';
import { Paper, Stack, Typography, Button, IconButton, Box } from '@mui/material';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { isPushSupported, checkPushSubscription, subscribeToPush } from '../lib/pushManager';

const DISMISS_KEY = 'wt_push_banner_dismissed_at';
const DISMISS_DAYS = 14;

const PushBanner = () => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;

    // Si ya tiene permiso o ya fue denegado, no mostramos el banner
    if (Notification.permission !== 'default') return;

    // Verificar si el usuario lo cerró recientemente
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const diffMs = Date.now() - Number(dismissedAt);
      if (diffMs < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    checkPushSubscription().then(sub => {
      if (!sub) {
        setVisible(true);
      }
    }).catch(() => {});
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      await subscribeToPush();
      setSuccess(true);
      setTimeout(() => {
        setVisible(false);
      }, 2500);
    } catch {
      handleDismiss();
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        border: 1,
        borderColor: 'primary.light',
        bgcolor: 'background.paper',
        position: 'relative'
      }}
    >
      <IconButton
        size="small"
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        sx={{ position: 'absolute', top: 8, right: 8, color: 'text.secondary' }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            flexShrink: 0
          }}
        >
          <NotificationsActiveOutlinedIcon />
        </Box>
        <Box sx={{ pr: 3, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {success ? '¡Notificaciones activadas con éxito! 🌿' : 'Activa las alertas de WeedTown en tu dispositivo'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {success
              ? 'Te avisaremos cuando alguien interactúe contigo, aun con la app cerrada.'
              : 'Entérate al instante cuando alguien comente en tus posts, te mencione (@) o te salude en Cerca.'}
          </Typography>
          {!success && (
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                variant="contained"
                size="small"
                onClick={handleEnable}
                disabled={loading}
              >
                {loading ? 'Activando…' : 'Activar notificaciones'}
              </Button>
              <Button
                variant="text"
                size="small"
                color="secondary"
                onClick={handleDismiss}
                disabled={loading}
              >
                Ahora no
              </Button>
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  );
};

export default PushBanner;
