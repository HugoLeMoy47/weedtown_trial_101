import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Avatar, Typography, TextField, IconButton, CircularProgress, Alert, Divider, Button
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import ImagePicker from './ImagePicker';
import OwnerActions from './OwnerActions';
import ContentActions from './ContentActions';
import AparicionSuave from './AparicionSuave';
import { useAuth } from '../hooks/useAuth';
import FechaRelativa from './FechaRelativa';

const CommentItem = ({ comment, onEdited, onDeleted, onBlocked, disabled = false }) => {
  const { user } = useAuth();
  const [reactions, setReactions] = useState(comment.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(comment.myReaction || null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const date = comment.createdAt ? new Date(comment.createdAt) : null;
  const isMine = user && comment.author?.id === user.id;

  const handleReact = async (type) => {
    if (disabled) return;
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
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2">{comment.author?.name || 'Anónimo'}</Typography>
          {date && (
            <Typography variant="caption" color="text.secondary">
              <FechaRelativa fecha={date} />
            </Typography>
          )}
          {isMine ? (
            <OwnerActions
              deleteLabel="este comentario"
              onEdit={() => { setEditText(comment.content); setEditing(true); }}
              onDelete={async () => {
                await api.delete(`/comments/${comment.id}`);
                onDeleted(comment.id);
              }}
            />
          ) : (user && comment.author?.id && (
            <ContentActions user={comment.author} report={{ targetType: 'COMMENT', targetId: comment.id }} onBlocked={onBlocked} />
          ))}
        </Stack>
        {editing ? (
          <Box sx={{ mb: 0.5 }}>
            <TextField fullWidth size="small" multiline value={editText} onChange={e => setEditText(e.target.value)} />
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Button size="small" variant="contained" disabled={!editText.trim()} onClick={async () => {
                const res = await api.put(`/comments/${comment.id}`, { content: editText });
                onEdited(res.data);
                setEditing(false);
              }}>Guardar</Button>
              <Button size="small" color="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            </Stack>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 0.5 }}>{comment.content}</Typography>
        )}
        {comment.image && (
          <Box
            component="img"
            src={comment.image}
            alt="Imagen adjunta al comentario"
            loading="lazy"
            sx={{
              maxWidth: '100%', maxHeight: 320, borderRadius: 2, display: 'block', mb: 0.5,
              border: 1, borderColor: 'divider'
            }}
          />
        )}
        <ReactionBar reactions={reactions} myReaction={myReaction} onReact={handleReact} size="small" />
      </Box>
    </Stack>
  );
};

const CommentSection = ({ postId, commentCount = 0, onCountChange, readOnly = false }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [sending, setSending] = useState(false);
  // Ciclo 9E: el id del comentario que ACABA de escribir esta persona, para
  // que se integre a la conversación en vez de aparecer de golpe al final.
  // Solo ese: la lista entera no se anima al cargar ni al recargarse tras un
  // bloqueo.
  const [recienEnviado, setRecienEnviado] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/posts/${postId}/comments`)
      .then(res => setComments(res.data.comments || []))
      .catch(() => setError('No se pudieron cargar los comentarios.'))
      .finally(() => setLoading(false));
  }, [postId]);

  // HU-PRV-001: sin sesión, la API ya no trae contenido (backend recortado en
  // postRoutes.js) — ni siquiera vale la pena pedirlo. El conteo se muestra
  // con lo que ya trajo el posteo (`commentCount`), no con esta lista.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [load, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    setSending(true);
    setError('');
    try {
      let imageUrl;
      if (imageFile) {
        const form = new FormData();
        form.append('image', imageFile);
        const up = await api.post('/media/upload', form);
        imageUrl = up.data.url;
      }
      const res = await api.post(`/posts/${postId}/comment`, { content, image: imageUrl });
      setComments(prev => [...prev, res.data]);
      setRecienEnviado(res.data.id);
      setInput('');
      setImageFile(null);
      onCountChange?.(comments.length + 1);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo publicar el comentario.');
    } finally {
      setSending(false);
    }
  };

  // HU-PRV-001: sin sesión no hay lista que mostrar (el backend no la manda),
  // así que no se finge un estado "sin comentarios" — sería falso si sí los
  // hay, y el conteo real ya viaja en `commentCount` desde el posteo.
  if (!user) {
    return (
      <Box sx={{ px: 2, pb: 2 }}>
        <Divider sx={{ mb: 1 }} />
        <Alert severity="info" sx={{ mt: 1 }}>
          {commentCount > 0
            ? `${commentCount} comentario${commentCount === 1 ? '' : 's'} — inicia sesión para leerlos`
            : 'Inicia sesión para comentar'}
        </Alert>
      </Box>
    );
  }

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
          {comments.map(c => (
            <AparicionSuave key={c.id} activo={c.id === recienEnviado}>
              <CommentItem
                comment={c}
                onEdited={(updated) => setComments(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)))}
                onDeleted={(id) => setComments(prev => {
                  const next = prev.filter(x => x.id !== id);
                  onCountChange?.(next.length);
                  return next;
                })}
                onBlocked={load}
                disabled={readOnly || !user}
              />
            </AparicionSuave>
          ))}
        </Stack>
      )}
      {readOnly || !user ? (
        <Alert severity="info" sx={{ mt: 1 }}>
          Inicia sesión o regístrate para comentar.
        </Alert>
      ) : (
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Escribe un comentario…"
              value={input}
              onChange={e => setInput(e.target.value)}
              inputProps={{ 'aria-label': 'Escribir comentario' }}
              disabled={sending}
            />
            <ImagePicker file={imageFile} onChange={setImageFile} disabled={sending} size="small" />
            <IconButton type="submit" color="primary" aria-label="Publicar comentario" disabled={sending || !input.trim()}>
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default CommentSection;
