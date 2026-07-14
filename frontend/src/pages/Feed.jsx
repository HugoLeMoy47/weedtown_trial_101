import React, { useState, useEffect } from 'react';
import {
  Container, Typography, TextField, Button, Box, Stack, Alert, CircularProgress,
  Pagination, InputAdornment, IconButton, Fab, Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';
import api from '../services/api';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import PostModal from '../components/PostModal';

function Feed() {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = sin búsqueda activa
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get(`/posts?page=${page}`)
      .then(res => {
        setPosts(res.data.posts);
        setTotalPages(res.data.totalPages || 1);
      })
      .catch(() => setError('No se pudo cargar el feed.'))
      .finally(() => setLoading(false));
  }, [page]);

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
              showing.map(post => <PostCard key={post.id} post={post} />)
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
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
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
