import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardHeader, CardContent, CardMedia, CardActions, Avatar, Typography, Chip, Stack, Button, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon from '@mui/icons-material/Share';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import CommentSection from './CommentSection';
import OwnerActions from './OwnerActions';
import ContentActions from './ContentActions';
import { useAuth } from '../hooks/useAuth';

const PostCard = ({ post, onUpdated, onDeleted, onBlocked, disableReactions = false, commentCount: externalCommentCount }) => {
  const { user } = useAuth();
  const author = typeof post.author === 'string' ? { name: post.author } : (post.author || {});
  const isMine = user && author.id === user.id;
  const authorName = author.name || author.handle || 'Anónimo';
  // Ciclo 9C: un hashtag son DOS cosas y hay que no confundirlas.
  //   llave  — minúsculas, es lo que agrupa (#Rolar y #rolar son el mismo
  //            tema) y lo que usará el enlace de la vista por hashtag (Ola 2).
  //   grafia — cómo se escribió, que es lo único que se pinta.
  // `displayTag` puede faltar en dos casos legítimos: un hashtag que llega
  // como cadena suelta (forma vieja de la API, que este componente ya
  // toleraba) y las filas anteriores a la migración. En ambos se cae a la
  // llave, que es exactamente lo que se veía antes.
  const tags = (post.hashtags || [])
    .map(h => {
      if (typeof h === 'string') return { llave: h, grafia: h };
      const llave = h.hashtag?.tag;
      return llave ? { llave, grafia: h.hashtag.displayTag || llave } : null;
    })
    .filter(Boolean);
  const date = post.createdAt ? new Date(post.createdAt) : null;
  const perfilHref = author.id ? (isMine ? '/profile' : `/perfil/${author.id}`) : null;

  const [reactions, setReactions] = useState(post.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(post.myReaction || null);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  // El cuadro de edición se llena con la GRAFÍA, no con la llave: si mostrara
  // "rolarenlatarde", editar el posteo por cualquier otra razón obligaría a
  // reescribir a mano las mayúsculas propias. Guardar sin tocarlo no cambia
  // nada — la llave se recalcula igual en el servidor y la grafía ya está
  // fijada desde la primera vez que se usó el tag.
  const [editHashtags, setEditHashtags] = useState(tags.map(t => t.grafia).join(' '));
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof externalCommentCount === 'number') {
      setCommentCount(externalCommentCount);
    }
  }, [externalCommentCount]);

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
    if (disableReactions) return;
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

  const shareUrl = `${window.location.origin}/p/${post.id}`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Ver post en WeedTown', text: post.content.slice(0, 120), url: shareUrl });
        setShareStatus('Compartido.');
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus('Enlace copiado al portapapeles.');
        setTimeout(() => setShareStatus(''), 3000);
        return;
      }
    } catch (e) {
      // Ignorar, usaremos el prompt como respaldo.
    }
    window.prompt('Copia este enlace para compartirlo:', shareUrl);
  };

  return (
    <Card component="article">
      <CardHeader
        avatar={
          <Avatar
            src={author.avatar || undefined}
            alt={authorName}
            component={perfilHref ? RouterLink : 'div'}
            to={perfilHref || undefined}
            sx={{ bgcolor: 'primary.main' }}
          >
            {authorName.charAt(0).toUpperCase()}
          </Avatar>
        }
        title={perfilHref ? (
          <Typography
            component={RouterLink}
            to={perfilHref}
            variant="body1"
            sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            {authorName}
          </Typography>
        ) : authorName}
        titleTypographyProps={perfilHref ? undefined : { fontWeight: 600 }}
        subheader={date ? (
          <time dateTime={date.toISOString()}>
            {date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        ) : null}
        action={isMine ? (
          <OwnerActions
            deleteLabel="este posteo y sus comentarios"
            onEdit={() => { setEditContent(post.content); setEditHashtags(tags.map(t => t.grafia).join(' ')); setEditing(true); }}
            onDelete={async () => {
              await api.delete(`/posts/${post.id}`);
              onDeleted?.(post.id);
            }}
              onShare={post.visibility === 'PUBLIC' ? handleShare : undefined}
            />
          ) : (user && author.id ? (
            <ContentActions
              user={author}
              report={{ targetType: 'POST', targetId: post.id }}
              onBlocked={onBlocked}
              onShare={post.visibility === 'PUBLIC' ? handleShare : undefined}
            />
          ) : undefined)}
      />
      {post.image && (
        <CardMedia component="img" image={post.image} alt="" sx={{ maxHeight: 420, objectFit: 'cover' }} />
      )}
      <CardContent sx={{ pt: post.image ? 2 : 0, pb: 1 }}>
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{post.content}</Typography>
        {tags.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
            {tags.map(t => (
              <Chip key={t.llave} label={`#${t.grafia}`} size="small" color="primary" variant="outlined" />
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
        {post.visibility === 'PUBLIC' && (
          <Button
            size="small"
            color="secondary"
            startIcon={<ShareIcon />}
            onClick={handleShare}
            aria-label="Compartir publicación"
          >
            Compartir
          </Button>
        )}
      </CardActions>
      {shareStatus && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography variant="caption" color="text.secondary">{shareStatus}</Typography>
        </Box>
      )}
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
