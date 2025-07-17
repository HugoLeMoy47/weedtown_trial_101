import React, { useState } from 'react';
import api from '../services/api';

const PostModal = ({ onClose, onPost }) => {
  const [content, setContent] = useState('');
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Aquí deberías manejar la subida de imagen real
      const res = await api.post('/posts', { content, image });
      onPost(res.data);
    } catch {
      setError('No se pudo crear el posteo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <form onSubmit={handleSubmit} style={{background:'#222',padding:24,borderRadius:8,minWidth:300}}>
        <h3>Nuevo posteo</h3>
        <textarea
          placeholder="¿Qué quieres compartir?"
          value={content}
          onChange={e => setContent(e.target.value)}
          required
          style={{width:'100%',marginBottom:12,padding:8}}
        />
        <input
          type="text"
          placeholder="URL de imagen (opcional)"
          value={image}
          onChange={e => setImage(e.target.value)}
          style={{width:'100%',marginBottom:12,padding:8}}
        />
        {error && <div style={{color:'red',marginBottom:8}}>{error}</div>}
        <button type="submit" disabled={loading} style={{marginRight:8}}>
          {loading ? 'Publicando...' : 'Publicar'}
        </button>
        <button type="button" onClick={onClose}>Cancelar</button>
      </form>
    </div>
  );
};

export default PostModal;
