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
      {posts.length === 0 ? <div>No hay posteos aún.</div> :
        <>
          {posts.map(post => <PostCard key={post.id} post={post} />)}
          <div style={{marginTop:16,display:'flex',gap:8,justifyContent:'center'}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>Anterior</button>
            <span style={{color:'#fff'}}>Página {page} de {totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Siguiente</button>
          </div>
        </>
      }
    </main>
  </>
);

export default Feed;
