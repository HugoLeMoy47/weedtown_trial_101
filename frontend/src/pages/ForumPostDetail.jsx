import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Container, Alert, CircularProgress, Box, Breadcrumbs, Link, Typography
} from '@mui/material';
import Navbar from '../components/Navbar';
import ForumPostCard from '../components/ForumPostCard';
import ForumComments from '../components/ForumComments';
import api from '../services/api';

const ForumPostDetail = () => {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/forum/posts/${id}`)
      .then(res => setPost(res.data))
      .catch(() => setError('No se encontró el post.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDeleted = useCallback(() => navigate(`/forum/${slug}`, { replace: true }), [navigate, slug]);
  const handleCountChange = useCallback(() => {}, []);

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
            <ForumPostCard post={post} detail onUpdated={setPost} onDeleted={handleDeleted} />
            <ForumComments postId={post.id} onCountChange={handleCountChange} />
          </>
        )}
      </Container>
    </>
  );
};

export default ForumPostDetail;
