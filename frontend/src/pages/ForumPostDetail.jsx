import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Container, Alert, CircularProgress, Box, Breadcrumbs, Link, Typography
} from '@mui/material';
import Navbar from '../components/Navbar';
import ForumPostCard from '../components/ForumPostCard';
import api from '../services/api';

const ForumPostDetail = () => {
  const { slug, id } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/forum/posts/${id}`)
      .then(res => setPost(res.data))
      .catch(() => setError('No se encontró el post.'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Breadcrumbs sx={{ mb: 2 }} aria-label="Ruta de navegación">
          <Link component={RouterLink} to="/forum" underline="hover" color="inherit">Foros</Link>
          <Link component={RouterLink} to={`/forum/${slug}`} underline="hover" color="inherit">
            {post?.subforum?.name || slug}
          </Link>
          <Typography color="text.primary" noWrap sx={{ maxWidth: 220 }}>
            {post?.title || `Post #${id}`}
          </Typography>
        </Breadcrumbs>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }} role="status" aria-label="Cargando post">
            <CircularProgress />
          </Box>
        ) : post && (
          <>
            <ForumPostCard post={post} detail />
            <Alert severity="info" sx={{ mt: 2 }}>
              Los hilos de discusión llegan en la siguiente entrega de este hito.
            </Alert>
          </>
        )}
      </Container>
    </>
  );
};

export default ForumPostDetail;
