import React from 'react';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';

const mockPosts = [
  { id: 1, author: 'Usuario1', content: '¡Hola WeedTown!', image: '', createdAt: '2025-07-17' },
  { id: 2, author: 'Usuario2', content: 'Primera publicación', image: '', createdAt: '2025-07-17' },
];

const Feed = () => (
  <>
    <Navbar />
    <main>
      <h2>Feed de Posteos</h2>
      {mockPosts.map(post => <PostCard key={post.id} post={post} />)}
    </main>
  </>
);

export default Feed;
