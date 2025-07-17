import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import api from '../services/api';
import ForumCategoryModal from '../components/ForumCategoryModal';


const Forum = () => {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/forum/categories')
      .then(res => setCategories(res.data))
      .catch(() => setError('No se pudieron cargar las categorías.'));
  }, []);

  useEffect(() => {
    if(selected) {
      api.get(`/forum?category=${selected}`)
        .then(res => setPosts(res.data))
        .catch(() => setError('No se pudieron cargar los posts del foro.'));
    }
  }, [selected]);

  const handleCreateCategory = (cat) => {
    setCategories([...categories, cat]);
    setShowModal(false);
    setSuccess('¡Categoría creada exitosamente!');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <>
      <Navbar />
      <main>
        <h2>Foros temáticos</h2>
        {error && <div style={{color:'red'}}>{error}</div>}
        {success && <div style={{color:'green'}}>{success}</div>}
        <div style={{marginBottom:16}}>
          <strong>Categorías:</strong>
          <button onClick={()=>setShowModal(true)} style={{marginLeft:8,background:'#2196f3',color:'#fff',border:'none',borderRadius:4,padding:'4px 12px'}}>+ Nueva categoría</button>
          {categories.length === 0 ? <span> Cargando...</span> :
            categories.map(cat => (
              <button key={cat} onClick={() => setSelected(cat)} style={{margin:4,background:selected===cat?'#4caf50':'#333',color:'#fff',border:'none',borderRadius:4,padding:'4px 12px'}}>
                {cat}
              </button>
            ))
          }
        </div>
        <div>
          {selected && posts.length === 0 && <div>No hay publicaciones en esta categoría.</div>}
          {posts.map(post => (
            <div key={post.id} style={{background:'#222',margin:'12px 0',padding:12,borderRadius:8}}>
              <strong>{post.title}</strong>
              <div>{post.content}</div>
              <small>por {post.author} - {post.createdAt}</small>
            </div>
          ))}
        </div>
        {showModal && <ForumCategoryModal onClose={()=>setShowModal(false)} onCreate={handleCreateCategory} />}
      </main>
    </>
  );
};

export default Forum;
