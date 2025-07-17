import React from 'react';

const PostCard = ({ post }) => (
  <div className="post-card">
    <img src={post.image} alt="post" style={{ width: '100%', borderRadius: 8 }} />
    <div>
      <strong>{post.author}</strong>
      <p>{post.content}</p>
      <span>{post.createdAt}</span>
    </div>
  </div>
);

export default PostCard;
