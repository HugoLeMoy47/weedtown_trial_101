import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const ERROR_MESSAGES = {
  instance: 'No se pudo conectar con esa instancia de Mastodon. Verifica el dominio.',
  denied: 'Autorización cancelada en Mastodon.',
  state: 'La sesión de autorización expiró. Intenta de nuevo.',
  oauth: 'No se pudo completar el inicio de sesión con Mastodon.'
};

const Login = () => {
  const [instance, setInstance] = useState('');
  const [searchParams] = useSearchParams();
  const error = ERROR_MESSAGES[searchParams.get('error')] || '';

  const handleSubmit = (e) => {
    e.preventDefault();
    const domain = instance.trim();
    if (!domain) return;
    window.location.href = `${API_URL}/auth/mastodon/start?instance=${encodeURIComponent(domain)}`;
  };

  return (
    <div style={{ maxWidth: 400, margin: '3rem auto', background: '#222', padding: 24, borderRadius: 8 }}>
      <h2>Iniciar sesión</h2>
      <p style={{ color: '#aaa', marginBottom: 16 }}>
        WeedTown usa tu identidad del fediverso. Escribe tu instancia de Mastodon para continuar.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="mastodon.social"
          value={instance}
          onChange={e => setInstance(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, padding: 8 }}
        />
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <button type="submit" style={{ width: '100%', padding: 10, background: '#6364ff', color: '#fff', border: 'none', borderRadius: 4 }}>
          Entrar con Mastodon
        </button>
      </form>
    </div>
  );
};

export default Login;
