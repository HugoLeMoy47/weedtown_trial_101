import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Stack
} from '@mui/material';
import api from '../services/api';

const PostModal = ({ open, onClose, onPost }) => {
  const [content, setContent] = useState('');
  const [image, setImage] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setContent(''); setImage(''); setHashtags(''); setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tags = hashtags.split(/[ ,]+/).filter(Boolean);
      const res = await api.post('/posts', { content, image: image || undefined, hashtags: tags });
      onPost(res.data);
      reset();
    } catch {
      setError('No se pudo crear el posteo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="post-modal-title">
      <form onSubmit={handleSubmit}>
        <DialogTitle id="post-modal-title">Nuevo posteo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="¿Qué quieres compartir?"
              value={content}
              onChange={e => setContent(e.target.value)}
              required
              multiline
              minRows={3}
              fullWidth
              autoFocus
            />
            <TextField
              label="URL de imagen (opcional)"
              type="url"
              value={image}
              onChange={e => setImage(e.target.value)}
              fullWidth
            />
            <TextField
              label="Hashtags"
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              fullWidth
              helperText="Separados por espacios o comas, sin #. Ej: viaje nomada cdmx"
            />
            {error && <Alert severity="error" role="alert">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} color="secondary">Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Publicando…' : 'Publicar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default PostModal;
