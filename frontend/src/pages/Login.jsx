import React, { useState } from 'react';
import { login } from '../services/auth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      // Redirigir a home/feed o guardar token
      window.location.href = '/';
    } catch (err) {
      setError('Credenciales inválidas');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '3rem auto', background: '#222', padding: 24, borderRadius: 8 }}>
      <h2>Iniciar sesión</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
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
        <button type="submit" style={{ width: '100%', padding: 10, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4 }}>
          Entrar
        </button>
      </form>
    </div>
  );
};

export default Login;
