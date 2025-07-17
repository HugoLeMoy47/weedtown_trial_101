import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Home from './pages/Home';
import Feed from './pages/Feed';
import Login from './pages/Login';
import Forum from './pages/Forum';
import Chat from './pages/Chat';
import Register from './pages/Register';
import Profile from './pages/Profile';

import { useAuth } from './hooks/useAuth';

function App() {
  const auth = useAuth();
  return (
    <Router>
      <authContext.Provider value={auth}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile user={auth.user} setUser={auth.setUser} />} />
        </Routes>
      </authContext.Provider>
    </Router>
  );
}

export default App;
