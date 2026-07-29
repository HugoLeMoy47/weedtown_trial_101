import React, { useState } from 'react';
import {
  Card, CardContent, Typography, List, ListItem, ListItemIcon, ListItemText,
  Button, Alert, Stack, TextField, Chip
} from '@mui/material';
import MastodonIcon from '@mui/icons-material/AlternateEmail';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { startRegistration } from '@simplewebauthn/browser';
import api from '../services/api';

const ICONOS = { MASTODON: MastodonIcon, PASSKEY: VpnKeyIcon, EMAIL: MailOutlineIcon };
const ETIQUETAS = { MASTODON: 'Mastodon', PASSKEY: 'Llave de acceso', EMAIL: 'Correo' };

// Métodos de acceso de la cuenta propia: agregar una llave de acceso o un
// correo de respaldo, y quitar los que ya no se usan. Nunca deja la cuenta
// sin ninguno — el backend rechaza borrar el último (ver DELETE
// /api/auth/identities/:id).
const AccessMethods = ({ identities, onChange }) => {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');

  const eliminar = async (id) => {
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      await api.delete(`/auth/identities/${id}`);
      onChange();
      setSuccess('Método de acceso eliminado');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo eliminar ese método de acceso.');
    } finally {
      setBusyId(null);
    }
  };

  const agregarPasskey = async () => {
    setError('');
    setSuccess('');
    setPasskeyBusy(true);
    try {
      const { data } = await api.post('/auth/passkey/register/options', {});
      const attResp = await startRegistration({ optionsJSON: data.options });
      await api.post('/auth/passkey/register/verify', { attResp, regToken: data.regToken });
      onChange();
      setSuccess('Llave de acceso agregada');
    } catch (e) {
      if (e?.name === 'NotAllowedError') setError('Cancelado.');
      else if (e?.name === 'InvalidStateError') setError('Esa llave ya está registrada en tu cuenta.');
      else setError('No se pudo agregar la llave de acceso.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const agregarEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setEmailMsg('');
    if (!email.trim()) return;
    setEmailBusy(true);
    try {
      const { data } = await api.post('/auth/email/start', { email: email.trim() });
      setEmailMsg(data.message);
      setEmail('');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo enviar el enlace.');
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <VpnKeyIcon color="action" />
          <Typography variant="h6" component="h2">Métodos de acceso</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Cualquiera de estos te lleva a la misma cuenta. Ten al menos dos por si uno deja de estar disponible.
        </Typography>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" role="status" sx={{ mb: 2 }}>{success}</Alert>}

        <List disablePadding sx={{ mb: 2 }}>
          {(identities || []).map(id => {
            const Icono = ICONOS[id.provider] || VpnKeyIcon;
            // Para PASSKEY, originHandle hoy siempre repite la etiqueta ("Llave
            // de acceso"): mostrarla dos veces no aporta nada, así que ahí se
            // muestra cuándo se agregó en su lugar.
            const detalle = id.provider === 'MASTODON'
              ? [id.originHandle, id.instance].filter(Boolean).join(' · ')
              : id.provider === 'PASSKEY'
                ? `Agregada el ${new Date(id.createdAt).toLocaleDateString('es-MX')}`
                : id.originHandle;
            return (
              <ListItem
                key={id.id}
                disableGutters
                secondaryAction={
                  <Button
                    size="small" color="error" onClick={() => eliminar(id.id)}
                    disabled={busyId === id.id || (identities || []).length <= 1}
                  >
                    {busyId === id.id ? 'Quitando…' : 'Quitar'}
                  </Button>
                }
              >
                <ListItemIcon sx={{ minWidth: 40 }}><Icono color="action" /></ListItemIcon>
                <ListItemText
                  primary={<>{ETIQUETAS[id.provider] || id.provider}{' '}
                    {id.lastLoginAt && <Chip label="usado recientemente" size="small" variant="outlined" sx={{ ml: 1 }} />}
                  </>}
                  secondary={detalle}
                />
              </ListItem>
            );
          })}
        </List>

        <Stack spacing={2}>
          <Button variant="outlined" onClick={agregarPasskey} disabled={passkeyBusy} startIcon={<VpnKeyIcon />}>
            {passkeyBusy ? 'Registrando…' : 'Agregar llave de acceso'}
          </Button>

          <Stack component="form" onSubmit={agregarEmail} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              label="Correo de respaldo" type="email" value={email} size="small" fullWidth
              onChange={e => setEmail(e.target.value)}
            />
            <Button type="submit" variant="outlined" disabled={emailBusy} sx={{ whiteSpace: 'nowrap' }}>
              {emailBusy ? 'Enviando…' : 'Agregar correo'}
            </Button>
          </Stack>
          {emailMsg && <Alert severity="success" role="status">{emailMsg}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default AccessMethods;
