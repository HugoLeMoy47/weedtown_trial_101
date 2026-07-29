import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Feed from './pages/Feed';
import Login from './pages/Login';
import Forum from './pages/Forum';
import Subforum from './pages/Subforum';
import ForumPostDetail from './pages/ForumPostDetail';
import Chat from './pages/Chat';
import Nearby from './pages/Nearby';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Terms from './pages/Terms';
import AuthCallback from './pages/AuthCallback';
import RequireAuth from './components/RequireAuth';
import RequireRole from './components/RequireRole';

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
            <Route path="/terms" element={<Terms />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/feed" element={<RequireAuth><Feed /></RequireAuth>} />
            <Route path="/forum" element={<RequireAuth><Forum /></RequireAuth>} />
            <Route path="/forum/:slug" element={<RequireAuth><Subforum /></RequireAuth>} />
            <Route path="/forum/:slug/post/:id" element={<RequireAuth><ForumPostDetail /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
            <Route path="/cerca" element={<RequireAuth><Nearby /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            {/* Misma URL que el resto de la app: el panel no es otro despliegue,
                es una sección más protegida por rol */}
            <Route path="/admin" element={<RequireRole><Admin /></RequireRole>} />
            <Route path="*" element={<Navigate to="/feed" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ColorModeProvider>
  );
}

export default App;
