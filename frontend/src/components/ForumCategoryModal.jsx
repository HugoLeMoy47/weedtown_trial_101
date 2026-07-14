import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Stack
} from '@mui/material';
import api from '../services/api';

const ForumCategoryModal = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setName('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/forum/categories', { name });
      onCreate(name);
      setName('');
    } catch {
      setError('No se pudo crear la categoría.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" aria-labelledby="forum-category-title">
      <form onSubmit={handleSubmit}>
        <DialogTitle id="forum-category-title">Nueva categoría</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nombre de la categoría"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              fullWidth
              autoFocus
            />
            {error && <Alert severity="error" role="alert">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} color="secondary">Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creando…' : 'Crear'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ForumCategoryModal;
