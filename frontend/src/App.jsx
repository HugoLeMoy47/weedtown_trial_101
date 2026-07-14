import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Feed from './pages/Feed';
import Login from './pages/Login';
import Forum from './pages/Forum';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import AuthCallback from './pages/AuthCallback';

import { AuthProvider } from './hooks/useAuth';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<Feed />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
