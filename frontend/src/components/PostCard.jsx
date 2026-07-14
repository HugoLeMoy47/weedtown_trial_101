import React from 'react';
import { Card, CardHeader, CardContent, CardMedia, Avatar, Typography, Chip, Stack } from '@mui/material';

const PostCard = ({ post }) => {
  const author = typeof post.author === 'string' ? { name: post.author } : (post.author || {});
  const authorName = author.name || author.acct || 'Anónimo';
  const tags = (post.hashtags || [])
    .map(h => (typeof h === 'string' ? h : h.hashtag?.tag))
    .filter(Boolean);
  const date = post.createdAt ? new Date(post.createdAt) : null;

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
      <CardContent sx={{ pt: post.image ? 2 : 0 }}>
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{post.content}</Typography>
        {tags.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
            {tags.map((tag, i) => (
              <Chip key={i} label={`#${tag}`} size="small" color="primary" variant="outlined" />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default PostCard;
