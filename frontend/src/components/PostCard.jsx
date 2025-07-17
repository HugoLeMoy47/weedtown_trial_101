import React from 'react';

const PostCard = ({ post }) => (
  <div className="post-card">
    {post.image && <img src={post.image} alt="post" style={{ width: '100%', borderRadius: 8 }} />}
    <div>
      <strong>{post.author}</strong>
      <p>{post.content}</p>
      {post.hashtags && post.hashtags.length > 0 && (
        <div style={{margin:'4px 0'}}>
          {post.hashtags.map((tag, i) => (
            <span key={i} style={{color:'#4caf50',marginRight:6}}># {tag}</span>
          ))}
        </div>
      )}
      <span>{post.createdAt}</span>
    </div>
  </div>
);

export default PostCard;
