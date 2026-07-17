import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Container, Typography, Button, Alert, Stack, CircularProgress, Box, Tabs, Tab,
  Select, MenuItem, Pagination, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Breadcrumbs, Link, Fab, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import Navbar from '../components/Navbar';
import ForumPostCard from '../components/ForumPostCard';
import ImagePicker from '../components/ImagePicker';
import api from '../services/api';
import { SORT_OPTIONS, PERIOD_OPTIONS } from '../lib/forum';

const NewForumPostDialog = ({ open, onClose, slug, onCreated }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => { setTitle(''); setContent(''); setImageFile(null); setError(''); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let imageUrl;
      if (imageFile) {
        const form = new FormData();
        form.append('image', imageFile);
        const up = await api.post('/media/upload', form);
        imageUrl = up.data.url;
      }
      const res = await api.post(`/forum/subforums/${slug}/posts`, { title, content, image: imageUrl });
      onCreated(res.data);
      setTitle(''); setContent(''); setImageFile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo publicar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="new-forum-post-title">
      <form onSubmit={handleSubmit}>
        <DialogTitle id="new-forum-post-title">Nuevo post</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Título"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required fullWidth autoFocus
              inputProps={{ maxLength: 200 }}
            />
            <TextField
              label="Contenido"
              value={content}
              onChange={e => setContent(e.target.value)}
              required fullWidth multiline minRows={4}
            />
            <ImagePicker file={imageFile} onChange={setImageFile} disabled={loading} />
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

const Subforum = () => {
  const { slug } = useParams();
  const [subforum, setSubforum] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sort, setSort] = useState('hot');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    api.get(`/forum/subforums/${slug}`)
      .then(res => setSubforum(res.data))
      .catch(() => setError('No se encontró el subforo.'));
  }, [slug]);

  const loadPosts = useCallback(() => {
    setLoading(true);
    api.get(`/forum/subforums/${slug}/posts?sort=${sort}&period=${period}&page=${page}`)
      .then(res => {
        setPosts(res.data.posts);
        setTotalPages(res.data.totalPages || 1);
      })
      .catch(() => setError('No se pudieron cargar los posts.'))
      .finally(() => setLoading(false));
  }, [slug, sort, period, page]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleCreated = (post) => {
    setShowDialog(false);
    setSort('new');
    setPage(1);
    setPosts(prev => [post, ...prev]);
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3, pb: 12 }}>
        <Breadcrumbs sx={{ mb: 1 }} aria-label="Ruta de navegación">
          <Link component={RouterLink} to="/forum" underline="hover" color="inherit">Foros</Link>
          <Typography color="text.primary">{subforum?.name || slug}</Typography>
        </Breadcrumbs>

        {subforum && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap' }}>
              <Typography variant="h5" component="h1">{subforum.name}</Typography>
              <Button
                size="small"
                variant={subforum.following ? 'outlined' : 'contained'}
                onClick={async () => {
                  const method = subforum.following ? 'delete' : 'post';
                  try {
                    const res = await api[method](`/forum/subforums/${slug}/follow`);
                    setSubforum(prev => ({
                      ...prev,
                      following: res.data.following,
                      _count: { ...prev._count, followers: res.data.followers }
                    }));
                  } catch { /* sin cambios si falla */ }
                }}
                aria-pressed={subforum.following}
              >
                {subforum.following ? 'Siguiendo ✓' : 'Seguir'}
              </Button>
            </Stack>
            {subforum.description && (
              <Typography variant="body2" color="text.secondary">{subforum.description}</Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {subforum._count?.posts ?? 0} posts · {subforum._count?.followers ?? 0} siguiendo
            </Typography>
          </Box>
        )}

        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
          <Tabs
            value={sort}
            onChange={(_, v) => { setSort(v); setPage(1); }}
            aria-label="Orden de los posts"
            variant="scrollable"
            allowScrollButtonsMobile
          >
            {SORT_OPTIONS.map(o => <Tab key={o.value} value={o.value} label={o.label} />)}
          </Tabs>
          {sort === 'top' && (
            <Select
              size="small"
              value={period}
              onChange={e => { setPeriod(e.target.value); setPage(1); }}
              aria-label="Periodo del top"
            >
              {PERIOD_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          )}
        </Stack>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }} role="status" aria-label="Cargando posts">
            <CircularProgress />
          </Box>
        ) : posts.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No hay posts todavía. ¡Publica el primero!
          </Typography>
        ) : (
          <Stack spacing={2}>
            {posts.map(post => <ForumPostCard key={post.id} post={post} />)}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, v) => setPage(v)}
                  color="primary"
                  aria-label="Paginación de posts"
                />
              </Box>
            )}
          </Stack>
        )}

        <Tooltip title="Nuevo post">
          <Fab
            color="primary"
            onClick={() => setShowDialog(true)}
            aria-label="Crear post en este subforo"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
          >
            <AddIcon />
          </Fab>
        </Tooltip>

        <NewForumPostDialog open={showDialog} onClose={() => setShowDialog(false)} slug={slug} onCreated={handleCreated} />
      </Container>
    </>
  );
};

export default Subforum;
