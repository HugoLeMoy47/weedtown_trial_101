import React, { useState } from 'react';
import api from '../services/api';

const Profile = ({ user, setUser }) => {
  const [form, setForm] = useState({
    phone: user?.phone || '',
    fullName: user?.fullName || '',
    bio: user?.bio || '',
    age: user?.age || '',
    birthdate: user?.birthdate || '',
    gender: user?.gender || ''
  });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);

  const validate = () => {
    const errors = [];
    if (form.phone && !/^\+?\d{7,15}$/.test(form.phone)) errors.push('Teléfono inválido');
    if (form.age && (isNaN(form.age) || form.age < 0 || form.age > 120)) errors.push('Edad inválida');
    if (form.birthdate && isNaN(Date.parse(form.birthdate))) errors.push('Fecha de nacimiento inválida');
    if (form.gender && !['masculino','femenino','otro',''].includes(form.gender)) errors.push('Género inválido');
    if (form.fullName && form.fullName.length < 2) errors.push('Nombre completo muy corto');
    return errors;
  };

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors([]);
    const clientErrors = validate();
    if (clientErrors.length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    try {
      const res = await api.post('/profile', form);
      setUser({ ...user, ...form });
      setSuccess('Perfil actualizado correctamente');
    } catch (err) {
      if (err.response && err.response.data && err.response.data.errors) {
        setFieldErrors(err.response.data.errors);
      } else {
        setError('No se pudo actualizar el perfil');
      }
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: '3rem auto', background: '#222', padding: 24, borderRadius: 8 }}>
      <h2>Mi perfil</h2>
      <form onSubmit={handleSubmit}>
        <input name="fullName" placeholder="Nombre completo" value={form.fullName} onChange={handleChange} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
        <input name="phone" placeholder="Teléfono" value={form.phone} onChange={handleChange} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
        <input name="age" placeholder="Edad" value={form.age} onChange={handleChange} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
        <input name="birthdate" type="date" placeholder="Fecha de nacimiento" value={form.birthdate} onChange={handleChange} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
        <select name="gender" value={form.gender} onChange={handleChange} style={{ width: '100%', marginBottom: 12, padding: 8 }}>
          <option value="">Género</option>
          <option value="masculino">Masculino</option>
          <option value="femenino">Femenino</option>
          <option value="otro">Otro</option>
        </select>
        <textarea name="bio" placeholder="Biografía" value={form.bio} onChange={handleChange} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
        {fieldErrors.length > 0 && (
          <ul style={{ color: 'red', marginBottom: 8 }}>
            {fieldErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        )}
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        {success && <div style={{ color: 'green', marginBottom: 8 }}>{success}</div>}
        <button type="submit" style={{ width: '100%', padding: 10, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4 }}>
          Guardar cambios
        </button>
      </form>
    </div>
  );
};

export default Profile;
