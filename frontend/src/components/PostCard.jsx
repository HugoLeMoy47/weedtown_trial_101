import React, { useState } from 'react';
import {
  Card, CardHeader, CardContent, CardMedia, CardActions, Avatar, Typography, Chip, Stack, Button, Collapse
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import api from '../services/api';
import ReactionBar, { applyReaction, EMPTY_COUNTS } from './ReactionBar';
import CommentSection from './CommentSection';

const PostCard = ({ post }) => {
  const author = typeof post.author === 'string' ? { name: post.author } : (post.author || {});
  const authorName = author.name || author.acct || 'Anónimo';
  const tags = (post.hashtags || [])
    .map(h => (typeof h === 'string' ? h : h.hashtag?.tag))
    .filter(Boolean);
  const date = post.createdAt ? new Date(post.createdAt) : null;

  const [reactions, setReactions] = useState(post.reactions || EMPTY_COUNTS);
  const [myReaction, setMyReaction] = useState(post.myReaction || null);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [showComments, setShowComments] = useState(false);

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
    </Card>
  );
};

export default PostCard;
