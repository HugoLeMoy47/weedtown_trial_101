import React, { useState, useEffect } from 'react';
import {
  Container, Card, CardContent, Typography, TextField, Button, Alert, Stack,
  MenuItem, CircularProgress, Avatar, Box
} from '@mui/material';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { phone: '', fullName: '', bio: '', age: '', birthdate: '', gender: '' };

const Profile = () => {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);

  useEffect(() => {
    api.get('/profile/me')
      .then(res => {
        const u = res.data;
        setForm({
          phone: u.phone || '',
          fullName: u.fullName || '',
          bio: u.bio || '',
          age: u.age ?? '',
          birthdate: u.birthdate ? u.birthdate.slice(0, 10) : '',
          gender: u.gender || ''
        });
      })
      .catch(() => setError('No se pudo cargar el perfil.'))
      .finally(() => setLoading(false));
  }, []);

  const validate = () => {
    const errors = [];
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
              {user?.acct && (
                <Typography variant="body2" color="text.secondary">
                  @{user.acct}{user.acct.includes('@') ? '' : `@${user.mastodonInstance}`}
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
                  <TextField name="bio" label="Biografía" value={form.bio} onChange={handleChange} multiline minRows={3} fullWidth />

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
      </Container>
    </>
  );
};

export default Profile;
