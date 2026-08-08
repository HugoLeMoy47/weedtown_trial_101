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
import PublicProfile from './pages/PublicProfile';
import PublicPost from './pages/PublicPost';
import Friends from './pages/Friends';
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
            <Route path="/amigos" element={<RequireAuth><Friends /></RequireAuth>} />
            {/* Perfil ajeno (ciclo 10A). `/@handle` es la forma compartible;
                `/perfil/:id` se conserva porque hay enlaces viejos, y los dos
                caen en el mismo componente.

                NINGUNO va detrás de RequireAuth, a propósito: la API ya exige
                sesión, y el componente manda al login recordando a dónde iba
                para volver tras el alta. Con RequireAuth el enlace compartido
                mandaría al login y ahí se perdería el destino — el mismo
                motivo por el que /p/:id tampoco está protegido aquí. */}
            <Route path="/perfil/:id" element={<PublicProfile />} />
            <Route path="/p/:id" element={<PublicPost />} />
            {/* Misma URL que el resto de la app: el panel no es otro despliegue,
                es una sección más protegida por rol */}
            <Route path="/admin" element={<RequireRole><Admin /></RequireRole>} />
            {/* `/@handle` — la forma compartible del perfil.
                POR QUÉ EL PARÁMETRO SE LLAMA `arrobaHandle` Y NO `handle`:
                React Router v6 no permite mezclar texto estático y parámetro
                dentro de un MISMO segmento, así que `path="/@:handle"` no hace
                match nunca y la URL termina cayendo en el catch-all de abajo —
                sin ningún error, que es lo peor de este caso: se ve como si el
                enlace simplemente no funcionara. El workaround es capturar el
                segmento completo (`@luna`) y quitarle la arroba en el
                componente, que además valida que venga.
                Va al final y antes del catch-all por legibilidad: v6 ordena por
                especificidad, así que /feed, /login y todas las rutas estáticas
                le ganan igual sin importar dónde esté escrita. */}
            <Route path="/:arrobaHandle" element={<PublicProfile />} />
            <Route path="*" element={<Navigate to="/feed" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ColorModeProvider>
  );
}

export default App;
