import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardContent, Typography, Button, Alert, Stack, TextField, Divider
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

// Exportar y eliminar la cuenta propia (HU-PRIV-001). Distinto del panel de
// moderación: acá es la propia persona ejerciendo su derecho sobre sus datos,
// no alguien más decidiendo qué pasa con contenido ajeno.
const AccountPrivacy = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');

  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const exportar = async () => {
    setExportError('');
    setExportBusy(true);
    try {
      const { data } = await api.get('/profile/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weedtown-datos-${user?.handle || 'cuenta'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('No se pudieron exportar tus datos. Intenta de nuevo.');
    } finally {
      setExportBusy(false);
    }
  };

  const eliminarCuenta = async () => {
    setDeleteError('');
    if (confirmText !== user?.handle) {
      setDeleteError('El handle no coincide.');
      return;
    }
    setDeleteBusy(true);
    try {
      await api.delete('/profile/me', { data: { confirm: confirmText } });
      logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setDeleteError(e.response?.data?.error || 'No se pudo eliminar la cuenta.');
      setDeleteBusy(false);
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>Tus datos</Typography>

        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Descarga una copia de tu perfil, tus posteos, comentarios y demás contenido propio.
          </Typography>
          {exportError && <Alert severity="error" role="alert">{exportError}</Alert>}
          <Button
            variant="outlined" startIcon={<DownloadIcon />} onClick={exportar}
            disabled={exportBusy} sx={{ alignSelf: 'flex-start' }}
          >
            {exportBusy ? 'Preparando…' : 'Descargar mis datos'}
          </Button>
        </Stack>

        <Divider sx={{ mb: 3 }} />

        <Typography variant="h6" component="h2" color="error.main" gutterBottom>
          Eliminar mi cuenta
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Borra tus datos personales y tus métodos de acceso — no vas a poder volver a entrar.
          Tus posteos, comentarios y mensajes se quedan (son también parte de conversaciones de
          otras personas), pero dejan de mostrar quién los escribió. <strong>No se puede deshacer.</strong>
        </Typography>
        <Stack spacing={1.5} sx={{ maxWidth: 360 }}>
          <TextField
            label={`Escribe tu handle ("${user?.handle || ''}") para confirmar`}
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            size="small"
            inputProps={{ autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
          />
          {deleteError && <Alert severity="error" role="alert">{deleteError}</Alert>}
          <Button
            variant="contained" color="error" startIcon={<DeleteForeverIcon />}
            onClick={eliminarCuenta}
            disabled={deleteBusy || confirmText !== user?.handle}
            sx={{ alignSelf: 'flex-start' }}
          >
            {deleteBusy ? 'Eliminando…' : 'Eliminar mi cuenta'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default AccountPrivacy;
