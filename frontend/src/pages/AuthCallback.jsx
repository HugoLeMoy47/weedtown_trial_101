import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      navigate('/login?error=oauth', { replace: true });
      return;
    }
    // Limpiar el token de la barra de direcciones
    window.history.replaceState(null, '', window.location.pathname);
    loginWithToken(token)
      .then(() => navigate('/feed', { replace: true }))
      .catch(() => setError('No se pudo validar la sesión. Intenta iniciar sesión de nuevo.'));
  }, [navigate, loginWithToken]);

  return (
    <div style={{ maxWidth: 400, margin: '3rem auto', background: '#222', padding: 24, borderRadius: 8, textAlign: 'center' }}>
      {error ? (
        <>
          <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>
          <button onClick={() => navigate('/login')}>Volver al login</button>
        </>
      ) : (
        <div>Conectando con tu cuenta…</div>
      )}
    </div>
  );
};

export default AuthCallback;
