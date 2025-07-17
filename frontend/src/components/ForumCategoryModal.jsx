import React, { useState } from 'react';
import api from '../services/api';

const ForumCategoryModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Aquí deberías llamar a la API para crear la categoría
      await api.post('/forum/categories', { name });
      onCreate(name);
    } catch {
      setError('No se pudo crear la categoría.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <form onSubmit={handleSubmit} style={{background:'#222',padding:24,borderRadius:8,minWidth:300}}>
        <h3>Nueva categoría</h3>
        <input
          type="text"
          placeholder="Nombre de la categoría"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          style={{width:'100%',marginBottom:12,padding:8}}
        />
        {error && <div style={{color:'red',marginBottom:8}}>{error}</div>}
        <button type="submit" disabled={loading} style={{marginRight:8}}>
          {loading ? 'Creando...' : 'Crear'}
        </button>
        <button type="button" onClick={onClose}>Cancelar</button>
      </form>
    </div>
  );
};

export default ForumCategoryModal;
