import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Avatar, Typography, TextField, IconButton, CircularProgress, Alert, Divider
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';

const CommentItem = ({ comment }) => {
  const [reactions, setReactions] = useState(comment.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(comment.myReaction || null);
  const date = comment.createdAt ? new Date(comment.createdAt) : null;

  const handleReact = async (type) => {
    const prev = { reactions, myReaction };
    const next = applyReaction(reactions, myReaction, type);
    setReactions(next.counts);
    setMyReaction(next.myReaction);
    try {
      const res = await api.post(`/comments/${comment.id}/reaction`, { type });
      setReactions(res.data.reactions);
      setMyReaction(res.data.myReaction);
    } catch {
      setReactions(prev.reactions);
      setMyReaction(prev.myReaction);
    }
  };

  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1 }}>
      <Avatar
        src={comment.author?.avatar || undefined}
        alt={comment.author?.name}
        sx={{ width: 30, height: 30, bgcolor: 'secondary.main', fontSize: 14 }}
      >
        {(comment.author?.name || '?').charAt(0).toUpperCase()}
      </Avatar>
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography variant="subtitle2">{comment.author?.name || 'Anónimo'}</Typography>
          {date && (
            <Typography variant="caption" color="text.secondary">
              <time dateTime={date.toISOString()}>
                {date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </Typography>
          )}
        </Stack>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 0.5 }}>{comment.content}</Typography>
        <ReactionBar reactions={reactions} myReaction={myReaction} onReact={handleReact} size="small" />
      </Box>
    </Stack>
  );
};

const CommentSection = ({ postId, onCountChange }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/posts/${postId}/comments`)
      .then(res => setComments(res.data.comments || []))
      .catch(() => setError('No se pudieron cargar los comentarios.'))
      .finally(() => setLoading(false));
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    setSending(true);
    setError('');
    try {
      const res = await api.post(`/posts/${postId}/comment`, { content });
      setComments(prev => [...prev, res.data]);
      setInput('');
      onCountChange?.(comments.length + 1);
    } catch {
      setError('No se pudo publicar el comentario.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Divider sx={{ mb: 1 }} />
      {error && <Alert severity="error" role="alert" sx={{ my: 1 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }} role="status" aria-label="Cargando comentarios">
          <CircularProgress size={22} />
        </Box>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          Aún no hay comentarios. Sé quien abra la conversación.
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />}>
          {comments.map(c => <CommentItem key={c.id} comment={c} />)}
        </Stack>
      )}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Escribe un comentario…"
          value={input}
          onChange={e => setInput(e.target.value)}
          inputProps={{ 'aria-label': 'Escribir comentario' }}
          disabled={sending}
        />
        <IconButton type="submit" color="primary" aria-label="Publicar comentario" disabled={sending || !input.trim()}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default CommentSection;
