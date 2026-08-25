import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Snackbar, Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { API_ORIGIN } from '../services/api';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [unreadDelta, setUnreadDelta] = useState(0);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  useEffect(() => {
    const activeToken = token || localStorage.getItem('weedtown_token');
    if (!activeToken || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }

    const s = io(API_ORIGIN, {
      auth: { token: activeToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    s.on('connect', () => {
      // Conectado exitosamente
    });

    s.on('notification:new', (notif) => {
      setUnreadDelta(prev => prev + 1);

      // Mostrar toast in-app si no estamos en la vista de ese chat o acción
      const actorName = notif.actor?.name || (notif.actor?.handle ? '@' + notif.actor.handle : 'Alguien');
      let mensaje = 'Nueva notificación';
      let ruta = '/';

      switch (notif.type) {
        case 'CHAT_MESSAGE':
          mensaje = '💬 ' + actorName + ' te envió un mensaje';
          ruta = '/chat';
          break;
        case 'POKE':
          mensaje = '🌿 ' + actorName + ' te mandó un toque 👋';
          ruta = '/cerca';
          break;
        case 'FRIEND_REQUEST':
          mensaje = '👥 ' + actorName + ' te mandó solicitud de amistad';
          ruta = '/amigos';
          break;
        case 'FRIEND_ACCEPTED':
          mensaje = '🌿 ' + actorName + ' aceptó tu solicitud de amistad';
          ruta = '/amigos';
          break;
        case 'REPLY_POST':
          mensaje = actorName + ' comentó en tu publicación';
          ruta = notif.forumPost?.subforum?.slug
            ? '/forum/' + notif.forumPost.subforum.slug + '/post/' + notif.forumPost.id
            : '/feed';
          break;
        case 'REPLY_COMMENT':
          mensaje = actorName + ' respondió a tu comentario';
          ruta = notif.forumPost?.subforum?.slug
            ? '/forum/' + notif.forumPost.subforum.slug + '/post/' + notif.forumPost.id
            : '/feed';
          break;
        case 'REACTION':
          mensaje = '🌿 A ' + actorName + ' le gustó tu publicación';
          ruta = notif.forumPost?.subforum?.slug
            ? '/forum/' + notif.forumPost.subforum.slug + '/post/' + notif.forumPost.id
            : '/feed';
          break;
        case 'NEW_SUBFORUM_POST':
          mensaje = 'Nuevo post en ' + (notif.subforum?.name || 'un subforo');
          ruta = notif.subforum?.slug ? '/forum/' + notif.subforum.slug : '/forum';
          break;
      }

      setToast({ mensaje, ruta });
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user, token]);

  const resetUnreadDelta = useCallback(() => {
    setUnreadDelta(0);
  }, []);

  const handleToastClick = () => {
    if (toast?.ruta) {
      navigate(toast.ruta);
    }
    setToast(null);
  };

  return (
    <SocketContext.Provider value={{ socket, unreadDelta, resetUnreadDelta }}>
      {children}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ mb: { xs: 8, sm: 2 } }}
      >
        <Alert
          onClose={() => setToast(null)}
          severity="info"
          variant="filled"
          sx={{ width: '100%', bgcolor: 'primary.dark', color: 'common.white', cursor: 'pointer' }}
          onClick={handleToastClick}
          action={
            <Button color="inherit" size="small" onClick={handleToastClick}>
              Ver
            </Button>
          }
        >
          {toast?.mensaje}
        </Alert>
      </Snackbar>
    </SocketContext.Provider>
  );
};
