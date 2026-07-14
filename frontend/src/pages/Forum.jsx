import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container, Typography, Button, Alert, Stack, Card, CardActionArea, CardContent,
  CircularProgress, Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import Navbar from '../components/Navbar';
import api from '../services/api';

const NewSubforumDialog = ({ open, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => { setName(''); setDescription(''); setError(''); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/forum/subforums', { name, description });
      onCreated(res.data);
      setName(''); setDescription('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el subforo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" aria-labelledby="new-subforum-title">
      <form onSubmit={handleSubmit}>
        <DialogTitle id="new-subforum-title">Nuevo subforo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nombre"
              value={name}
              onChange={e => setName(e.target.value)}
              required fullWidth autoFocus
              inputProps={{ maxLength: 40 }}
              helperText="Entre 3 y 40 caracteres. Ej: Cultivo, Legal MX, Arte 420"
            />
            <TextField
              label="Descripción (opcional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              fullWidth multiline minRows={2}
              inputProps={{ maxLength: 280 }}
            />
            {error && <Alert severity="error" role="alert">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} color="secondary">Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creando…' : 'Crear subforo'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const Forum = () => {
  const [subforums, setSubforums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    api.get('/forum/subforums')
      .then(res => setSubforums(res.data.subforums || []))
      .catch(() => setError('No se pudieron cargar los subforos.'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (subforum) => {
    setSubforums(prev => [subforum, ...prev]);
    setShowDialog(false);
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h5" component="h1">Foros</Typography>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setShowDialog(true)}>
            Nuevo subforo
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Espacios temáticos creados por la comunidad. Entra a uno para leer, publicar y votar con tus reacciones.
        </Typography>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }} role="status" aria-label="Cargando subforos">
            <CircularProgress />
          </Box>
        ) : subforums.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            Aún no hay subforos. ¡Crea el primero para tu tema favorito!
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {subforums.map(sf => (
              <Card key={sf.id}>
                <CardActionArea component={RouterLink} to={`/forum/${sf.slug}`}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      <Typography variant="h6" component="h2">{sf.name}</Typography>
                      {sf.following && <Chip label="Siguiendo" size="small" color="primary" variant="outlined" />}
                    </Stack>
                    {sf.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {sf.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={2} sx={{ mt: 1 }} color="text.secondary">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <ArticleOutlinedIcon fontSize="inherit" />
                        <Typography variant="caption">{sf._count?.posts ?? 0} posts</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PeopleAltOutlinedIcon fontSize="inherit" />
                        <Typography variant="caption">{sf._count?.followers ?? 0} siguiendo</Typography>
                      </Stack>
                      <Typography variant="caption">creado por {sf.creator?.name}</Typography>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        )}

        <NewSubforumDialog open={showDialog} onClose={() => setShowDialog(false)} onCreated={handleCreated} />
      </Container>
    </>
  );
};

export default Forum;
