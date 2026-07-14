import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Feed from './pages/Feed';
import Login from './pages/Login';
import Forum from './pages/Forum';
import Subforum from './pages/Subforum';
import ForumPostDetail from './pages/ForumPostDetail';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import AuthCallback from './pages/AuthCallback';
import RequireAuth from './components/RequireAuth';

import { AuthProvider } from './hooks/useAuth';
import { ColorModeProvider } from './theme';

function App() {
  return (
    <ColorModeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/home" element={<Navigate to="/feed" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/feed" element={<RequireAuth><Feed /></RequireAuth>} />
            <Route path="/forum" element={<RequireAuth><Forum /></RequireAuth>} />
            <Route path="/forum/:slug" element={<RequireAuth><Subforum /></RequireAuth>} />
            <Route path="/forum/:slug/post/:id" element={<RequireAuth><ForumPostDetail /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/feed" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ColorModeProvider>
  );
}

export default App;
