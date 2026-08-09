import React, { useState, useEffect } from 'react';
import {
  Container, Card, CardContent, Typography, TextField, Button, Alert, Stack,
  MenuItem, CircularProgress, Avatar, Box
} from '@mui/material';
import api from '../services/api';
import Navbar from '../components/Navbar';
import BlockedAccounts from '../components/BlockedAccounts';
import AvatarStudio from '../components/AvatarStudio';
import MiEnlaceDeInvitacion from '../components/MiEnlaceDeInvitacion';
import PrivacidadPerfil, { CAMPOS as CAMPOS_PRIVACIDAD } from '../components/PrivacidadPerfil';
import AccessMethods from '../components/AccessMethods';
import AccountPrivacy from '../components/AccountPrivacy';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { handle: '', phone: '', fullName: '', bio: '', aboutMe: '', age: '', birthdate: '', gender: '' };

// Extrae de una respuesta de perfil solo las preferencias de privacidad.
// Se arma recorriendo la lista de campos del propio componente, en vez de
// nombrarlos a mano: cuando el 11A agregó el quinto, esto ya lo incluía sin
// tocar nada — antes había que acordarse de dos lugares distintos de este
// archivo, y olvidar uno deja un control que se pinta pero no se guarda.
const preferenciasDe = (u) => ({
  ...Object.fromEntries(CAMPOS_PRIVACIDAD.map(c => [c.clave, u[c.clave]])),
  perfilPublico: u.perfilPublico
});

const Profile = () => {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [identities, setIdentities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);
  const [privacidad, setPrivacidad] = useState(null);
  // El conteo EXACTO de invitaciones. Solo llega por /profile/me — hacia
  // terceros el servidor manda una cubeta.
  const [invitaciones, setInvitaciones] = useState(0);

  const cargarPerfil = () => api.get('/profile/me')
    .then(res => {
      const u = res.data;
      setForm({
        handle: u.handle || '',
        phone: u.phone || '',
        fullName: u.fullName || '',
        bio: u.bio || '',
        aboutMe: u.aboutMe || '',
        age: u.age ?? '',
        birthdate: u.birthdate ? u.birthdate.slice(0, 10) : '',
        gender: u.gender || ''
      });
      setIdentities(u.identities || []);
      setInvitaciones(u.invitaciones ?? 0);
      setPrivacidad(preferenciasDe(u));
    })
    .catch(() => setError('No se pudo cargar el perfil.'));

  useEffect(() => {
    cargarPerfil().finally(() => setLoading(false));
  }, []);

  const validate = () => {
    const errors = [];
    if (!/^[a-z0-9][a-z0-9_]{2,19}$/.test(form.handle)) {
      errors.push('El handle debe tener entre 3 y 20 caracteres: minúsculas, números y guion bajo, empezando con letra o número');
    }
    if (form.phone && !/^\+?\d{7,15}$/.test(form.phone)) errors.push('Teléfono inválido');
    if (form.age && (isNaN(form.age) || form.age < 0 || form.age > 120)) errors.push('Edad inválida');
    if (form.birthdate && isNaN(Date.parse(form.birthdate))) errors.push('Fecha de nacimiento inválida');
    if (form.fullName && form.fullName.length < 2) errors.push('Nombre completo muy corto');
    return errors;
  };

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors([]);
    const clientErrors = validate();
    if (clientErrors.length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    setSaving(true);
    try {
      const res = await api.put('/profile/me', form);
      setUser(res.data.user);
      setSuccess('Perfil actualizado correctamente');
    } catch (err) {
      if (err.response?.data?.errors) {
        setFieldErrors(err.response.data.errors);
      } else {
        setError('No se pudo actualizar el perfil');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="sm" component="main" sx={{ py: 3 }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={1} alignItems="center" sx={{ mb: 3 }}>
              <Avatar
                src={user?.avatar || undefined}
                alt={user?.displayName || user?.name}
                sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: 28 }}
              >
                {(user?.displayName || user?.name || '?').charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="h5" component="h1">{user?.displayName || user?.name}</Typography>
              {user?.handle && (
                <Typography variant="body2" color="text.secondary">
                  @{user.handle}
                </Typography>
              )}
            </Stack>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }} role="status" aria-label="Cargando perfil">
                <CircularProgress />
              </Box>
            ) : (
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  {/* El handle es lo único de este formulario que ve el resto de
                      la comunidad; el resto son datos opcionales y privados. */}
                  <TextField
                    name="handle"
                    label="Handle"
                    value={form.handle}
                    onChange={handleChange}
                    fullWidth
                    required
                    InputProps={{ startAdornment: <Box sx={{ color: 'text.secondary', mr: 0.5 }}>@</Box> }}
                    inputProps={{ maxLength: 20, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                    helperText="Tu nombre público en WeedTown: aparece en el feed, foros, chat y Cerca. Minúsculas, números y guion bajo."
                  />
                  <TextField name="fullName" label="Nombre completo" value={form.fullName} onChange={handleChange} fullWidth />
                  <TextField name="phone" label="Teléfono" value={form.phone} onChange={handleChange} fullWidth
                    placeholder="+521234567890" inputProps={{ inputMode: 'tel' }} />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField name="age" label="Edad" value={form.age} onChange={handleChange} fullWidth
                      inputProps={{ inputMode: 'numeric' }} />
                    <TextField name="birthdate" label="Fecha de nacimiento" type="date" value={form.birthdate}
                      onChange={handleChange} fullWidth InputLabelProps={{ shrink: true }} />
                  </Stack>
                  <TextField name="gender" label="Género" value={form.gender} onChange={handleChange} select fullWidth>
                    <MenuItem value="">Prefiero no decir</MenuItem>
                    <MenuItem value="masculino">Masculino</MenuItem>
                    <MenuItem value="femenino">Femenino</MenuItem>
                    <MenuItem value="otro">Otro</MenuItem>
                  </TextField>
                  {/* Ciclo 10B: quién ve estos dos ya no es fijo, se configura
                      abajo en "Quién ve qué". Los textos de ayuda decían
                      "pública" y "solo tus amigos" como si fueran hechos. */}
                  <TextField name="bio" label="Biografía" value={form.bio} onChange={handleChange} multiline minRows={3} fullWidth
                    helperText="Quién la ve se configura abajo, en “Quién ve qué”" />
                  <TextField name="aboutMe" label="Sobre mí" value={form.aboutMe} onChange={handleChange} multiline minRows={3} fullWidth
                    inputProps={{ maxLength: 1000 }}
                    helperText={`Quién lo ve se configura abajo — ${form.aboutMe.length}/1000`} />

                  {fieldErrors.length > 0 && (
                    <Alert severity="error" role="alert">
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {fieldErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </Alert>
                  )}
                  {error && <Alert severity="error" role="alert">{error}</Alert>}
                  {success && <Alert severity="success" role="status">{success}</Alert>}

                  <Button type="submit" variant="contained" size="large" disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>

        {privacidad && (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 4, pt: 2 }}>
              <PrivacidadPerfil
                valores={privacidad}
                onCambio={(u) => setPrivacidad(preferenciasDe(u))}
              />
            </CardContent>
          </Card>
        )}

        {/* Va ANTES del estudio del avatar y de los métodos de acceso: es lo
            que alguien viene a buscar cuando quiere invitar a alguien, y
            enterrarlo al final del perfil fue justo el error de la primera
            versión del 11A — el mecanismo existía y no había dónde tomarlo. */}
        <MiEnlaceDeInvitacion handle={form.handle} invitaciones={invitaciones} />

        <AvatarStudio user={user} onSaved={setUser} />
        <AccessMethods identities={identities} onChange={cargarPerfil} />
        <BlockedAccounts />
        <AccountPrivacy />
      </Container>
    </>
  );
};

export default Profile;
