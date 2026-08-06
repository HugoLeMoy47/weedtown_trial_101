import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Stack, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import PostCard from '../components/PostCard';
import CommentSection from '../components/CommentSection';
import InviteBlock from '../components/InviteBlock';

const PublicPost = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotFound(false);
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
        setNotFound(err.response?.status === 404);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  // HU-CTA-003 + Trampa 9: la API responde 404 igual para "no existe" y para
  // "es de amistades" — a propósito, no se toca. Por eso esta redirección
  // también dispara con un id inexistente; lo que no puede pasar es un
  // bucle, así que solo redirige sin sesión y nunca a quien ya tiene una
  // (si hay sesión y sigue sin acceso, se queda en la página de error).
  useEffect(() => {
    if (!loading && !authLoading && notFound && !user) {
      navigate(`/login?ref=post&next=${encodeURIComponent(`/p/${id}`)}`, { replace: true });
    }
  }, [loading, authLoading, notFound, user, id, navigate]);

  if (loading || (notFound && !user)) {
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
            {/* HU-CTA-001: debajo del posteo, encima de comentarios — nunca
                al revés, y nunca si ya hay sesión. */}
            {!user && (
              <InviteBlock authorId={post.author?.id} authorHandle={post.author?.handle} />
            )}
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>Comentarios</Typography>
              <CommentSection
                postId={post.id}
                commentCount={commentCount}
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
