import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Card, CardContent, CardActions, Typography, Stack, Chip, Button, Box, Avatar, Tooltip
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import { REACTION_SCORE } from '../lib/forum';

const ForumPostCard = ({ post, showSubforum = false, detail = false }) => {
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
    </Card>
  );
};

export default ForumPostCard;
