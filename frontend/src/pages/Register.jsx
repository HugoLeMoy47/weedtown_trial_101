import React, { useState } from 'react';
import { register } from '../services/auth';

const Register = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await register({ email, name: username, password });
      setSuccess('¡Registro exitoso! Ahora puedes iniciar sesión.');
      setEmail(''); setUsername(''); setPassword('');
    } catch (err) {
      setError('No se pudo registrar. Intenta con otro correo o usuario.');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '3rem auto', background: '#222', padding: 24, borderRadius: 8 }}>
      <h2>Registro</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, padding: 8 }}
        />
        <input
          type="text"
          placeholder="Nombre de usuario"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, padding: 8 }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, padding: 8 }}
        />
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        {success && <div style={{ color: 'green', marginBottom: 8 }}>{success}</div>}
        <button type="submit" style={{ width: '100%', padding: 10, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4 }}>
          Registrarse
        </button>
      </form>
    </div>
  );
};

export default Register;
