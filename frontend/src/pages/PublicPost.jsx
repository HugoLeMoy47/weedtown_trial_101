import React, { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Box, Stack, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import PostCard from '../components/PostCard';
import CommentSection from '../components/CommentSection';

const PublicPost = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPost(null);
    api.get(`/posts/${id}`)
      .then(res => {
        if (cancelled) return;
        setPost(res.data);
        setCommentCount(res.data.commentCount || 0);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'No se pudo cargar la publicación.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }} role="status" aria-label="Cargando publicación">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', py: 4, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">Publicación pública</Typography>
        {error ? (
          <Box>
            <Alert severity="error">{error}</Alert>
            <Button component={RouterLink} to="/feed" sx={{ mt: 2 }}>Ir al feed</Button>
          </Box>
        ) : post ? (
          <>
            {!user && (
              <Alert severity="info">
                Puedes ver esta publicación sin iniciar sesión. Para comentar o reaccionar, inicia sesión o regístrate.
              </Alert>
            )}
            <PostCard
              post={post}
              onUpdated={setPost}
              onDeleted={() => setPost(null)}
              disableReactions={!user}
              commentCount={commentCount}
            />
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>Comentarios</Typography>
              <CommentSection
                postId={post.id}
                onCountChange={setCommentCount}
                readOnly={!user}
              />
            </Box>
          </>
        ) : null}
      </Stack>
    </Box>
  );
};

export default PublicPost;
