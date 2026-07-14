import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Card, CardContent, CardActions, Typography, Stack, Chip, Button, Box, Avatar, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import OwnerActions from './OwnerActions';
import { useAuth } from '../hooks/useAuth';
import { REACTION_SCORE } from '../lib/forum';

const ForumPostCard = ({ post, showSubforum = false, detail = false, onUpdated, onDeleted }) => {
  const { user } = useAuth();
  const isMine = user && post.author?.id === user.id;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditError('');
    try {
      const res = await api.put(`/forum/posts/${post.id}`, { title: editTitle, content: editContent });
      onUpdated?.(res.data);
      setEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };
  const [reactions, setReactions] = useState(post.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(post.myReaction || null);
  const [score, setScore] = useState(post.score ?? 0);
  const date = post.createdAt ? new Date(post.createdAt) : null;

  const handleReact = async (type) => {
    const prev = { reactions, myReaction, score };
    const next = applyReaction(reactions, myReaction, type);
    const delta = (next.myReaction ? REACTION_SCORE[next.myReaction] : 0) - (myReaction ? REACTION_SCORE[myReaction] : 0);
    setReactions(next.counts);
    setMyReaction(next.myReaction);
    setScore(s => s + delta);
    try {
      const res = await api.post(`/forum/posts/${post.id}/reaction`, { type });
      setReactions(res.data.reactions);
      setMyReaction(res.data.myReaction);
      setScore(res.data.score);
    } catch {
      setReactions(prev.reactions);
      setMyReaction(prev.myReaction);
      setScore(prev.score);
    }
  };

  const detailPath = `/forum/${post.subforum?.slug}/post/${post.id}`;

  return (
    <Card component="article">
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }}>
          <Tooltip title="Puntaje: reacciones positivas suman, Me molesta resta">
            <Chip
              icon={<WhatshotIcon />}
              label={score}
              size="small"
              color={score > 0 ? 'primary' : 'default'}
              variant={score > 0 ? 'filled' : 'outlined'}
              aria-label={`Puntaje ${score}`}
            />
          </Tooltip>
          {showSubforum && post.subforum && (
            <Chip
              label={post.subforum.name}
              size="small"
              variant="outlined"
              component={RouterLink}
              to={`/forum/${post.subforum.slug}`}
              clickable
            />
          )}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Avatar src={post.author?.avatar || undefined} sx={{ width: 20, height: 20, fontSize: 11, bgcolor: 'secondary.main' }}>
              {(post.author?.name || '?').charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              {post.author?.name || 'Anónimo'}
              {date && <> · <time dateTime={date.toISOString()}>{date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</time></>}
            </Typography>
          </Stack>
          {detail && isMine && (
            <Box sx={{ ml: 'auto' }}>
              <OwnerActions
                deleteLabel="este post y todo su hilo"
                onEdit={() => { setEditTitle(post.title); setEditContent(post.content); setEditing(true); }}
                onDelete={async () => {
                  await api.delete(`/forum/posts/${post.id}`);
                  onDeleted?.();
                }}
              />
            </Box>
          )}
        </Stack>

        {detail ? (
          <Typography variant="h5" component="h1" gutterBottom>{post.title}</Typography>
        ) : (
          <Typography
            variant="h6"
            component={RouterLink}
            to={detailPath}
            sx={{ color: 'text.primary', textDecoration: 'none', display: 'block', '&:hover': { color: 'primary.main' } }}
          >
            {post.title}
          </Typography>
        )}

        <Typography
          variant="body1"
          sx={detail ? { whiteSpace: 'pre-wrap', mt: 1 } : {
            whiteSpace: 'pre-wrap', mt: 0.5,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
          }}
        >
          {post.content}
        </Typography>

        {post.image && (
          <Box
            component="img"
            src={post.image}
            alt=""
            loading="lazy"
            sx={{ maxWidth: '100%', maxHeight: detail ? 480 : 280, borderRadius: 2, mt: 1.5, border: 1, borderColor: 'divider' }}
          />
        )}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 1.5, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <ReactionBar reactions={reactions} myReaction={myReaction} onReact={handleReact} />
        {!detail && (
          <Button
            size="small"
            color="secondary"
            component={RouterLink}
            to={detailPath}
            startIcon={<ChatBubbleOutlineIcon />}
            aria-label={`Ver discusión, ${post.commentCount || 0} comentarios`}
          >
            {post.commentCount || 0}
          </Button>
        )}
      </CardActions>

      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="sm" aria-labelledby="edit-forum-post-title">
        <form onSubmit={handleEditSave}>
          <DialogTitle id="edit-forum-post-title">Editar post</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Título" value={editTitle} onChange={e => setEditTitle(e.target.value)} required fullWidth inputProps={{ maxLength: 200 }} />
              <TextField label="Contenido" value={editContent} onChange={e => setEditContent(e.target.value)} required fullWidth multiline minRows={4} />
              {editError && <Alert severity="error" role="alert">{editError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditing(false)} color="secondary">Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Card>
  );
};

export default ForumPostCard;
