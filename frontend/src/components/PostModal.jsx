import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Stack, Typography
} from '@mui/material';
import api from '../services/api';
import ImagePicker from './ImagePicker';

async function uploadImage(file) {
  const form = new FormData();
  form.append('image', file);
  const res = await api.post('/media/upload', form);
  return res.data.url;
}

const PostModal = ({ open, onClose, onPost }) => {
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [hashtags, setHashtags] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setContent(''); setImageFile(null); setHashtags(''); setError('');
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
      const imageUrl = imageFile ? await uploadImage(imageFile) : undefined;
      const tags = hashtags.split(/[ ,]+/).filter(Boolean);
      const res = await api.post('/posts', { content, image: imageUrl, hashtags: tags });
      onPost(res.data);
      reset();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el posteo.');
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
              label="Hashtags"
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              fullWidth
              helperText="Separados por espacios o comas, sin #. Ej: cultura 420 cdmx"
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <ImagePicker file={imageFile} onChange={setImageFile} disabled={loading} />
              {!imageFile && (
                <Typography variant="caption" color="text.secondary">
                  Imagen opcional — se eliminan los metadatos (EXIF/GPS) antes de subirla
                </Typography>
              )}
            </Stack>
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
