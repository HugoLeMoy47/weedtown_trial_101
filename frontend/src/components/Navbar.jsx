import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => (
  <nav className="navbar" style={{display:'flex',alignItems:'center',gap:24}}>
    <h1 style={{marginRight:32}}>WeedTown</h1>
    <Link to="/login" style={{color:'#fff'}}>Login</Link>
    <Link to="/register" style={{color:'#fff'}}>Registro</Link>
    <Link to="/feed" style={{color:'#fff'}}>Feed</Link>
    <Link to="/forum" style={{color:'#fff'}}>Foros</Link>
    <Link to="/chat" style={{color:'#fff'}}>Chat</Link>
  </nav>
);

export default Navbar;
