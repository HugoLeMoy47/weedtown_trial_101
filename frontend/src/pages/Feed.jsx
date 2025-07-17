import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';

const mockPosts = [
  { id: 1, author: 'Usuario1', content: '¡Hola WeedTown!', image: '', createdAt: '2025-07-17' },
  { id: 2, author: 'Usuario2', content: 'Primera publicación', image: '', createdAt: '2025-07-17' },
];


function Feed() {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get(`/posts?page=${page}`)
      .then(res => {
        setPosts(res.data.posts);
        setTotalPages(res.data.totalPages);
      })
      .catch(() => setError('No se pudo cargar el feed.'))
      .finally(() => setLoading(false));
  }, [page]);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/posts/search?q=${encodeURIComponent(search)}`);
      setSearchResults(res.data.results);
    } catch {
      setError('No se pudo realizar la búsqueda.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPost = (nuevoPost) => {
    setPosts([nuevoPost, ...posts]);
    setShowModal(false);
  };

  return (
    <>
      <Navbar />
      <main>
        <h2>Feed de Posteos</h2>
        <form onSubmit={handleSearch} style={{marginBottom:16,display:'flex',gap:8}}>
          <input
            type="text"
            placeholder="Buscar en posteos, usuarios o #hashtag"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{flex:1,padding:8}}
          />
          <button type="submit">Buscar</button>
        </form>
        <button onClick={() => setShowModal(true)} style={{marginBottom: 16}}>Crear posteo</button>
        {error && <div style={{color:'red'}}>{error}</div>}
        {loading ? <div>Cargando...</div> : (
          (search && searchResults.length > 0) ? (
            <>
              <div style={{marginBottom:8}}>Resultados de búsqueda:</div>
              {searchResults.map(post => <PostCard key={post.id} post={post} />)}
            </>
          ) : posts.length === 0 ? <div>No hay posteos aún.</div> :
          <>
            {posts.map(post => <PostCard key={post.id} post={post} />)}
            <div style={{marginTop:16,display:'flex',gap:8,justifyContent:'center'}}>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>Anterior</button>
              <span style={{color:'#fff'}}>Página {page} de {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Siguiente</button>
            </div>
          </>
        )}
        {showModal && <PostModal onClose={() => setShowModal(false)} onPost={handleNewPost} />}
      </main>
    </>
  );
}

export default Feed;
