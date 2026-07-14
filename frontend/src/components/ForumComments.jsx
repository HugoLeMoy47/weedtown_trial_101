import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Stack, Avatar, Typography, TextField, Button, IconButton, CircularProgress,
  Alert, Chip, Collapse
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import ImagePicker from './ImagePicker';
import OwnerActions from './OwnerActions';
import { useAuth } from '../hooks/useAuth';

const MAX_DEPTH = 2;

// Compositor inline (comentario raíz o respuesta)
const Composer = ({ onSubmit, placeholder, autoFocus = false, onCancel }) => {
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setError('');
    try {
      await onSubmit(content.trim(), imageFile);
      setContent('');
      setImageFile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo publicar.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
        <TextField
          fullWidth size="small" multiline maxRows={6}
          placeholder={placeholder}
          value={content}
          onChange={e => setContent(e.target.value)}
          inputProps={{ 'aria-label': placeholder }}
          disabled={sending}
          autoFocus={autoFocus}
        />
        <ImagePicker file={imageFile} onChange={setImageFile} disabled={sending} size="small" />
        <IconButton type="submit" color="primary" aria-label="Publicar" disabled={sending || !content.trim()}>
          <SendIcon />
        </IconButton>
      </Box>
      {onCancel && (
        <Button size="small" color="secondary" onClick={onCancel} sx={{ mt: 0.5 }}>Cancelar</Button>
      )}
      {error && <Alert severity="error" role="alert" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
};

const CommentNode = ({ comment, childrenNodes, onReply, onEdited, onDeleted, renderChildren }) => {
  const { user } = useAuth();
  const [reactions, setReactions] = useState(comment.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(comment.myReaction || null);
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const date = comment.createdAt ? new Date(comment.createdAt) : null;
  const isMine = user && comment.author?.id === user.id;
  const flattened = comment.depth === MAX_DEPTH && comment.parent && comment.parent.id !== undefined;

  const handleReact = async (type) => {
    const prev = { reactions, myReaction };
    const next = applyReaction(reactions, myReaction, type);
    setReactions(next.counts);
    setMyReaction(next.myReaction);
    try {
      const res = await api.post(`/forum/comments/${comment.id}/reaction`, { type });
      setReactions(res.data.reactions);
      setMyReaction(res.data.myReaction);
    } catch {
      setReactions(prev.reactions);
      setMyReaction(prev.myReaction);
    }
  };

  const handleEditSave = async () => {
    const res = await api.put(`/forum/comments/${comment.id}`, { content: editText });
    onEdited(res.data);
    setEditing(false);
  };

  const totalReplies = childrenNodes.length;

  return (
    <Box sx={{ ml: comment.depth > 0 ? 2 : 0, borderLeft: comment.depth > 0 ? 2 : 0, borderColor: 'divider', pl: comment.depth > 0 ? 1.5 : 0, mt: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {totalReplies > 0 && (
          <IconButton size="small" onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? `Expandir rama (${totalReplies} respuestas)` : 'Colapsar rama'} sx={{ mt: 0.25 }}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
        <Avatar src={comment.author?.avatar || undefined} sx={{ width: 26, height: 26, fontSize: 12, bgcolor: 'secondary.main', mt: 0.25 }}>
          {(comment.author?.name || '?').charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography variant="subtitle2">{comment.deleted ? '—' : (comment.author?.name || 'Anónimo')}</Typography>
            {date && (
              <Typography variant="caption" color="text.secondary">
                <time dateTime={date.toISOString()}>{date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </Typography>
            )}
            {flattened && comment.parent?.author?.name && (
              <Chip label={`en respuesta a @${comment.parent.author.name}`} size="small" variant="outlined" />
            )}
            {isMine && !comment.deleted && (
              <OwnerActions
                deleteLabel="este comentario"
                onEdit={() => { setEditText(comment.content); setEditing(true); }}
                onDelete={async () => {
                  const res = await api.delete(`/forum/comments/${comment.id}`);
                  onDeleted(comment.id, res.data.soft);
                }}
              />
            )}
          </Stack>

          {comment.deleted ? (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>Comentario eliminado</Typography>
          ) : editing ? (
            <Box sx={{ mt: 0.5 }}>
              <TextField fullWidth size="small" multiline value={editText} onChange={e => setEditText(e.target.value)} />
              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                <Button size="small" variant="contained" onClick={handleEditSave} disabled={!editText.trim()}>Guardar</Button>
                <Button size="small" color="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
              </Stack>
            </Box>
          ) : (
            <>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{comment.content}</Typography>
              {comment.image && (
                <Box component="img" src={comment.image} alt="Imagen adjunta al comentario" loading="lazy"
                  sx={{ maxWidth: '100%', maxHeight: 280, borderRadius: 2, mt: 0.5, border: 1, borderColor: 'divider', display: 'block' }} />
              )}
            </>
          )}

          {!comment.deleted && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              <ReactionBar reactions={reactions} myReaction={myReaction} onReact={handleReact} size="small" />
              <Button size="small" color="secondary" onClick={() => setReplying(r => !r)}>Responder</Button>
            </Stack>
          )}

          {replying && (
            <Composer
              placeholder={`Responder a ${comment.author?.name || 'este comentario'}…`}
              autoFocus
              onCancel={() => setReplying(false)}
              onSubmit={async (content, imageFile) => {
                await onReply(comment.id, content, imageFile);
                setReplying(false);
              }}
            />
          )}
        </Box>
      </Stack>
      <Collapse in={!collapsed} timeout="auto" unmountOnExit>
        {renderChildren(childrenNodes)}
      </Collapse>
    </Box>
  );
};

const ForumComments = ({ postId, onCountChange }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/forum/posts/${postId}/comments`)
      .then(res => setComments(res.data.comments || []))
      .catch(() => setError('No se pudieron cargar los comentarios.'))
      .finally(() => setLoading(false));
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    onCountChange?.(comments.filter(c => !c.deleted).length);
  }, [comments, onCountChange]);

  // Árbol: hijos por parentId; cada nivel ordenado por puntaje (los mejores arriba)
  const byParent = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      const key = c.parentId || 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.score - a.score) || (new Date(a.createdAt) - new Date(b.createdAt)));
    }
    return map;
  }, [comments]);

  const submit = async (parentId, content, imageFile) => {
    let imageUrl;
    if (imageFile) {
      const form = new FormData();
      form.append('image', imageFile);
      const up = await api.post('/media/upload', form);
      imageUrl = up.data.url;
    }
    const res = await api.post(`/forum/posts/${postId}/comments`, { content, image: imageUrl, parentId });
    setComments(prev => [...prev, res.data]);
  };

  const handleEdited = (updated) => {
    setComments(prev => prev.map(c => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

  const handleDeleted = (id, soft) => {
    setComments(prev => soft
      ? prev.map(c => (c.id === id ? { ...c, deleted: true, content: '', image: null } : c))
      : prev.filter(c => c.id !== id));
  };

  const renderLevel = (nodes) => nodes.map(c => (
    <CommentNode
      key={c.id}
      comment={c}
      childrenNodes={byParent.get(c.id) || []}
      onReply={(parentId, content, img) => submit(parentId, content, img)}
      onEdited={handleEdited}
      onDeleted={handleDeleted}
      renderChildren={renderLevel}
    />
  ));

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>Discusión</Typography>
      <Composer placeholder="Aporta al hilo…" onSubmit={(content, img) => submit(null, content, img)} />
      {error && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }} role="status" aria-label="Cargando comentarios">
          <CircularProgress size={24} />
        </Box>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Nadie ha comentado aún. Abre la conversación.
        </Typography>
      ) : (
        renderLevel(byParent.get(0) || [])
      )}
    </Box>
  );
};

export default ForumComments;
