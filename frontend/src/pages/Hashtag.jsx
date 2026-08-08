import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container, Typography, Stack, Box, CircularProgress, Alert, Pagination, Chip
} from '@mui/material';
import TagIcon from '@mui/icons-material/Tag';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import api from '../services/api';

// Los posteos de un tema (ciclo 10D).
//
// Qué entra aquí lo decide el servidor con la MISMA regla que el feed: un
// posteo de solo-amigos no aparece para quien no lo es, y lo oculto por
// moderación no aparece para nadie. Esta pantalla no filtra nada por su cuenta
// — si lo hiciera, habría dos versiones de la regla y una se quedaría atrás.
const Hashtag = () => {
  const { tag } = useParams();
  const [datos, setDatos] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setPagina(1); }, [tag]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    api.get(`/posts/hashtag/${encodeURIComponent(tag)}?page=${pagina}`)
      .then(res => {
        if (cancelado) return;
        setDatos(res.data.hashtag);
        setPosts(res.data.posts || []);
        setTotalPaginas(res.data.totalPages || 1);
      })
      .catch(err => {
        if (cancelado) return;
        setError(err.response?.status === 404
          ? 'Ese tema todavía no existe.'
          : 'No se pudieron cargar las publicaciones.');
      })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [tag, pagina]);

  // Se pinta la GRAFÍA con que se estrenó el tema, no la llave: #RolarEnLaTarde
  // y no #rolarenlatarde. La llave solo sirve para agrupar y navegar.
  const titulo = datos?.displayTag || tag;

  return (
    <>
      <Navbar />
      <Container maxWidth="sm" component="main" sx={{ py: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <TagIcon color="primary" />
          <Typography variant="h5" component="h1">{titulo}</Typography>
        </Stack>

        {cargando ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }} role="status" aria-label="Cargando publicaciones">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="info">{error}</Alert>
        ) : posts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nada que mostrar por aquí.
          </Typography>
        ) : (
          <>
            <Chip size="small" label={`${posts.length} publicación${posts.length === 1 ? '' : 'es'} en esta página`} sx={{ mb: 2 }} />
            <Stack spacing={2}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onUpdated={(a) => setPosts(ps => ps.map(p => (p.id === a.id ? a : p)))}
                  onDeleted={(id) => setPosts(ps => ps.filter(p => p.id !== id))}
                  onBlocked={() => setPosts([])}
                />
              ))}
            </Stack>
            {totalPaginas > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={totalPaginas} page={pagina} onChange={(_, v) => setPagina(v)} />
              </Box>
            )}
          </>
        )}
      </Container>
    </>
  );
};

export default Hashtag;
