import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Navbar = () => {
  const { user } = useAuth();
  return (
    <nav className="navbar" style={{display:'flex',alignItems:'center',gap:24}}>
      <h1 style={{marginRight:32}}>WeedTown</h1>
      {user ? (
        <>
          <Link to="/profile" style={{color:'#fff'}}>{user.name || user.username || 'Perfil'}</Link>
        </>
      ) : (
        <>
          <Link to="/login" style={{color:'#fff'}}>Login</Link>
          <Link to="/register" style={{color:'#fff'}}>Registro</Link>
        </>
      )}
      <Link to="/feed" style={{color:'#fff'}}>Feed</Link>
      <Link to="/forum" style={{color:'#fff'}}>Foros</Link>
      <Link to="/chat" style={{color:'#fff'}}>Chat</Link>
    </nav>
  );
};

export default Navbar;
