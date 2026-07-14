import React, { useState } from 'react';
import {
  Card, CardHeader, CardContent, CardMedia, CardActions, Avatar, Typography, Chip, Stack, Button, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import CommentSection from './CommentSection';
import OwnerActions from './OwnerActions';
import { useAuth } from '../hooks/useAuth';

const PostCard = ({ post, onUpdated, onDeleted }) => {
  const { user } = useAuth();
  const author = typeof post.author === 'string' ? { name: post.author } : (post.author || {});
  const isMine = user && author.id === user.id;
  const authorName = author.name || author.acct || 'Anónimo';
  const tags = (post.hashtags || [])
    .map(h => (typeof h === 'string' ? h : h.hashtag?.tag))
    .filter(Boolean);
  const date = post.createdAt ? new Date(post.createdAt) : null;

  const [reactions, setReactions] = useState(post.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(post.myReaction || null);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editHashtags, setEditHashtags] = useState(tags.join(' '));
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditError('');
    try {
      const tagList = editHashtags.split(/[ ,]+/).filter(Boolean);
      const res = await api.put(`/posts/${post.id}`, { content: editContent, hashtags: tagList });
      onUpdated?.(res.data);
      setEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleReact = async (type) => {
    const prev = { reactions, myReaction };
    const next = applyReaction(reactions, myReaction, type);
    setReactions(next.counts);
    setMyReaction(next.myReaction);
    try {
      const res = await api.post(`/posts/${post.id}/reaction`, { type });
      setReactions(res.data.reactions);
      setMyReaction(res.data.myReaction);
    } catch {
      setReactions(prev.reactions);
      setMyReaction(prev.myReaction);
    }
  };

  return (
    <Card component="article">
      <CardHeader
        avatar={
          <Avatar src={author.avatar || undefined} alt={authorName} sx={{ bgcolor: 'primary.main' }}>
            {authorName.charAt(0).toUpperCase()}
          </Avatar>
        }
        title={authorName}
        titleTypographyProps={{ fontWeight: 600 }}
        subheader={date ? (
          <time dateTime={date.toISOString()}>
            {date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        ) : null}
        action={isMine ? (
          <OwnerActions
            deleteLabel="este posteo y sus comentarios"
            onEdit={() => { setEditContent(post.content); setEditHashtags(tags.join(' ')); setEditing(true); }}
            onDelete={async () => {
              await api.delete(`/posts/${post.id}`);
              onDeleted?.(post.id);
            }}
          />
        ) : undefined}
      />
      {post.image && (
        <CardMedia component="img" image={post.image} alt="" sx={{ maxHeight: 420, objectFit: 'cover' }} />
      )}
      <CardContent sx={{ pt: post.image ? 2 : 0, pb: 1 }}>
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{post.content}</Typography>
        {tags.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
            {tags.map((tag, i) => (
              <Chip key={i} label={`#${tag}`} size="small" color="primary" variant="outlined" />
            ))}
          </Stack>
        )}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 1.5, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <ReactionBar reactions={reactions} myReaction={myReaction} onReact={handleReact} />
        <Button
          size="small"
          color="secondary"
          startIcon={<ChatBubbleOutlineIcon />}
          onClick={() => setShowComments(v => !v)}
          aria-expanded={showComments}
          aria-label={`${showComments ? 'Ocultar' : 'Ver'} comentarios${commentCount > 0 ? `, ${commentCount}` : ''}`}
        >
          {commentCount > 0 ? commentCount : 'Comentar'}
        </Button>
      </CardActions>
      <Collapse in={showComments} timeout="auto" unmountOnExit>
        <CommentSection postId={post.id} onCountChange={setCommentCount} />
      </Collapse>

      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="sm" aria-labelledby="edit-post-title">
        <form onSubmit={handleEditSave}>
          <DialogTitle id="edit-post-title">Editar posteo</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Contenido" value={editContent} onChange={e => setEditContent(e.target.value)} required fullWidth multiline minRows={3} />
              <TextField label="Hashtags" value={editHashtags} onChange={e => setEditHashtags(e.target.value)} fullWidth helperText="Separados por espacios o comas, sin #" />
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

export default PostCard;
