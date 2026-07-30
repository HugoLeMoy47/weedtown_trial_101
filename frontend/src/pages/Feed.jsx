import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container, Typography, TextField, Button, Box, Stack, Alert, CircularProgress,
  Pagination, InputAdornment, IconButton, Fab, Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../services/api';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import PostModal from '../components/PostModal';
import { FEED_REFRESH_EVENT } from '../lib/refresh';
import { DOCK_BOTTOM_OFFSET, DOCK_SIDE_MARGIN_PX } from '../lib/mobileNav';

// Cada cuánto se revisa si hay posts más nuevos que el que está arriba (solo
// una consulta ligera a la página 1, no recarga nada todavía) — mismo orden
// de magnitud que el resto del polling de la app (campana, badge de amigos).
const CHECK_NUEVOS_MS = 20000;

function Feed() {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = sin búsqueda activa
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reload, setReload] = useState(0);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const topPostIdRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/posts?page=${page}`)
      .then(res => {
        setPosts(res.data.posts);
        setTotalPages(res.data.totalPages || 1);
      })
      .catch(() => setError('No se pudo cargar el feed.'))
      .finally(() => setLoading(false));
  }, [page, reload]);

  useEffect(() => {
    topPostIdRef.current = posts[0]?.id ?? null;
  }, [posts]);

  // Vuelve a la página 1 con contenido fresco — lo usan el botón "Ver
  // publicaciones nuevas" y el logo del header (vía FEED_REFRESH_EVENT).
  // Si ya estás en la página 1, cambiar `page` a 1 no dispara el efecto de
  // arriba (no hay cambio), así que se empuja `reload` en su lugar.
  const irAlInicio = useCallback(() => {
    setSearch('');
    setSearchResults(null);
    setNewPostsAvailable(false);
    if (page === 1) setReload(n => n + 1);
    else setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // El feed es contenido generado por la comunidad: sin esto, un post nuevo
  // de alguien más solo aparece si recargas la página a mano. Se revisa cada
  // rato y al volver a la pestaña, y en vez de reordenar el feed por debajo
  // de quien está leyendo, se avisa con un botón — igual que el resto de
  // redes sociales, para no mover el contenido bajo el cursor de nadie.
  const checkNuevos = useCallback(() => {
    if (page !== 1 || searchResults !== null || !topPostIdRef.current) return;
    api.get('/posts?page=1')
      .then(res => {
        const topId = res.data.posts?.[0]?.id;
        if (topId && topId !== topPostIdRef.current) setNewPostsAvailable(true);
      })
      .catch(() => {});
  }, [page, searchResults]);

  useEffect(() => {
    const t = setInterval(checkNuevos, CHECK_NUEVOS_MS);
    return () => clearInterval(t);
  }, [checkNuevos]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') checkNuevos(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [checkNuevos]);

  useEffect(() => {
    window.addEventListener(FEED_REFRESH_EVENT, irAlInicio);
    return () => window.removeEventListener(FEED_REFRESH_EVENT, irAlInicio);
  }, [irAlInicio]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/posts/search?q=${encodeURIComponent(search)}`);
      setSearchResults(res.data.results);
    } catch {
      setError('No se pudo realizar la búsqueda.');
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearch('');
    setSearchResults(null);
  };

  const handleNewPost = (nuevoPost) => {
    setPosts(prev => [nuevoPost, ...prev]);
    setShowModal(false);
  };

  const handleUpdated = (updated) => {
    const apply = list => list.map(p => (p.id === updated.id ? updated : p));
    setPosts(apply);
    setSearchResults(prev => (prev === null ? prev : apply(prev)));
  };

  const handleDeleted = (id) => {
    const apply = list => list.filter(p => p.id !== id);
    setPosts(apply);
    setSearchResults(prev => (prev === null ? prev : apply(prev)));
  };

  // Bloquear oculta TODO el contenido de esa persona, no solo el post desde el
  // que se bloqueó: se recarga el feed en vez de quitar una sola tarjeta.
  const handleBlocked = () => {
    setSearchResults(null);
    setSearch('');
    setReload(n => n + 1);
  };

  const showing = searchResults !== null ? searchResults : posts;

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3, pb: 12 }}>
        <Typography variant="h5" component="h1" gutterBottom>Feed</Typography>

        <Box component="form" onSubmit={handleSearch} role="search" sx={{ mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar en posteos o usuarios…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            inputProps={{ 'aria-label': 'Buscar en posteos o usuarios' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="secondary" aria-hidden="true" />
                </InputAdornment>
              ),
              endAdornment: searchResults !== null && (
                <InputAdornment position="end">
                  <IconButton onClick={clearSearch} size="small" aria-label="Limpiar búsqueda">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </Box>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        {newPostsAvailable && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={irAlInicio}
              aria-live="polite"
            >
              Hay publicaciones nuevas — actualizar
            </Button>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }} role="status" aria-label="Cargando posteos">
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {searchResults !== null && (
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para “{search}”
              </Typography>
            )}
            {showing.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                {searchResults !== null ? 'Sin resultados.' : 'No hay posteos aún. ¡Sé quien inicie la conversación!'}
              </Typography>
            ) : (
              showing.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                  onBlocked={handleBlocked}
                />
              ))
            )}
            {searchResults === null && totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                  aria-label="Paginación del feed"
                />
              </Box>
            )}
          </Stack>
        )}

        <Tooltip title="Crear posteo">
          <Fab
            color="primary"
            onClick={() => setShowModal(true)}
            aria-label="Crear posteo"
            sx={{
              position: 'fixed',
              // Móvil: en la misma fila que la barra flotante (variante C, ver
              // Navbar.jsx/mobileNav.js) — mismos números para que quede
              // pixel-alineada con ella. Escritorio: sin cambios.
              bottom: { xs: DOCK_BOTTOM_OFFSET, md: 24 },
              right: { xs: `${DOCK_SIDE_MARGIN_PX}px`, md: 24 },
              borderRadius: { xs: '18px', md: '50%' }
            }}
          >
            <AddIcon />
          </Fab>
        </Tooltip>

        <PostModal open={showModal} onClose={() => setShowModal(false)} onPost={handleNewPost} />
      </Container>
    </>
  );
}

export default Feed;
