import React from 'react';

const PostCard = ({ post }) => {
  const authorName = typeof post.author === 'string'
    ? post.author
    : post.author?.name || post.author?.acct || 'Anónimo';
  const tags = (post.hashtags || [])
    .map(h => (typeof h === 'string' ? h : h.hashtag?.tag))
    .filter(Boolean);

  return (
    <div className="post-card">
      {post.image && <img src={post.image} alt="post" style={{ width: '100%', borderRadius: 8 }} />}
      <div>
        <strong>{authorName}</strong>
        <p>{post.content}</p>
        {tags.length > 0 && (
          <div style={{margin:'4px 0'}}>
            {tags.map((tag, i) => (
              <span key={i} style={{color:'#4caf50',marginRight:6}}>#{tag}</span>
            ))}
          </div>
        )}
        <span>{post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}</span>
      </div>
    </div>
  );
};

export default PostCard;
