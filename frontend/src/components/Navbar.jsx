import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar" style={{display:'flex',alignItems:'center',gap:24}}>
      <h1 style={{marginRight:32}}>WeedTown</h1>
      <Link to="/feed" style={{color:'#fff'}}>Feed</Link>
      <Link to="/forum" style={{color:'#fff'}}>Foros</Link>
      <Link to="/chat" style={{color:'#fff'}}>Chat</Link>
      {user ? (
        <>
          <Link to="/profile" style={{color:'#fff',marginLeft:'auto'}}>
            {user.displayName || user.name || user.acct}
          </Link>
          <button onClick={handleLogout} style={{background:'#333',color:'#fff',border:'none',borderRadius:4,padding:'6px 12px',cursor:'pointer'}}>
            Salir
          </button>
        </>
      ) : (
        <Link to="/login" style={{color:'#fff',marginLeft:'auto'}}>Entrar con Mastodon</Link>
      )}
    </nav>
  );
};

export default Navbar;
