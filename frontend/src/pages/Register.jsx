import React, { useState } from 'react';
import { register } from '../services/auth';

const Register = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);

  const validate = () => {
    const errors = [];
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Correo inválido');
    if (!username || username.length < 2) errors.push('Nombre de usuario muy corto');
    if (!password || password.length < 6) errors.push('La contraseña debe tener al menos 6 caracteres');
    return errors;
  };

  const handleSubmit = async (e) => {
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
      await register({ email, name: username, password });
      setSuccess('¡Registro exitoso! Ahora puedes iniciar sesión.');
      setEmail(''); setUsername(''); setPassword('');
    } catch (err) {
      if (err.response && err.response.data && err.response.data.errors) {
        setFieldErrors(err.response.data.errors);
      } else {
        setError('No se pudo registrar. Intenta con otro correo o usuario.');
      }
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
        {fieldErrors.length > 0 && (
          <ul style={{ color: 'red', marginBottom: 8 }}>
            {fieldErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        )}
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
