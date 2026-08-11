import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton, Badge, Menu, MenuItem, Typography, Box, CircularProgress, Tooltip, ListItemAvatar, Avatar, ListItemText
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import api from '../services/api';
import FechaRelativa from './FechaRelativa';
import SaludoDeVuelta from './SaludoDeVuelta';

const POLL_MS = 30000;

// Recorte corto del contenido de un post/comentario del feed principal, para
// darle contexto a la notificación sin tener página de detalle a la que
// enlazar (a diferencia del foro, que sí tiene permalink).
function recorte(texto, max = 40) {
  if (!texto) return null;
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

function describe(n) {
  const actor = n.actor?.name || 'Alguien';
  const title = n.forumPost?.title ? `«${n.forumPost.title}»` : 'tu publicación';
  switch (n.type) {
    case 'REPLY_POST': {
      if (n.forumPost) return `${actor} respondió a tu post ${title}`;
      const fragmento = recorte(n.post?.content);
      return fragmento ? `${actor} comentó tu post: «${fragmento}»` : `${actor} comentó tu post`;
    }
    case 'REPLY_COMMENT': return `${actor} respondió a tu comentario en ${title}`;
    case 'NEW_SUBFORUM_POST': return `Nuevo post en ${n.subforum?.name || 'un subforo que sigues'}: ${title}`;
    case 'POKE': return `${actor} te mandó un toque 👋 desde Cerca`;
    case 'FRIEND_REQUEST': return `${actor} te mandó una solicitud de amistad`;
    case 'FRIEND_ACCEPTED': return `${actor} aceptó tu solicitud de amistad`;
    case 'REACTION': {
      const sobre = n.comment ? 'tu comentario' : 'tu post';
      const fragmento = recorte((n.post || n.comment)?.content);
      return fragmento ? `A ${actor} le gustó ${sobre}: «${fragmento}»` : `A ${actor} le gustó ${sobre}`;
    }
    case 'CHAT_MESSAGE': return `${actor} te mandó un mensaje`;
    // Moderación: el actor viene vacío a propósito — se dice qué pasó y por qué,
    // no quién lo decidió.
    case 'CONTENIDO_OCULTO':
      return `Moderación retiró contenido tuyo — ${n.reasonText || 'incumple las normas de la comunidad'}`;
    case 'CUENTA_SUSPENDIDA':
      return `Tu cuenta fue suspendida temporalmente — ${n.reasonText || 'incumple las normas de la comunidad'}`;
    default: return `${actor} interactuó contigo`;
  }
}

function targetPath(n) {
  if (n.type === 'POKE') return '/cerca';
  if (n.type === 'CONTENIDO_OCULTO' || n.type === 'CUENTA_SUSPENDIDA') return '/profile';
  if (n.type === 'FRIEND_REQUEST' || n.type === 'FRIEND_ACCEPTED') return '/amigos';
  if (n.type === 'CHAT_MESSAGE') return '/chat';
  // REPLY_POST/REACTION del feed principal: no hay página de detalle de un
  // post suelto (a diferencia del foro), así que el destino es el feed.
  if ((n.type === 'REPLY_POST' && !n.forumPost) || (n.type === 'REACTION' && !n.forumPost)) return '/feed';
  const slug = n.forumPost?.subforum?.slug || n.subforum?.slug;
  if (n.forumPost && slug) return `/forum/${slug}/post/${n.forumPost.id}`;
  if (slug) return `/forum/${slug}`;
  return '/forum';
}

const NotificationBell = () => {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(() => {
    api.get('/notifications/unread-count')
      .then(res => setUnread(res.data.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  const handleOpen = async (e) => {
    setAnchor(e.currentTarget);
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setItems(res.data.notifications || []);
      if (res.data.unread > 0) {
        await api.post('/notifications/read-all');
      }
      setUnread(0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (n) => {
    setAnchor(null);
    navigate(targetPath(n));
  };

  return (
    <>
      <Tooltip title="Notificaciones">
        <IconButton onClick={handleOpen} color="secondary" aria-label={`Notificaciones${unread > 0 ? `, ${unread} sin leer` : ''}`}>
          <Badge badgeContent={unread} color="primary" max={99}>
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { width: 'min(360px, calc(100vw - 32px))', maxHeight: 420 } }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={22} />
          </Box>
        ) : items.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">Sin notificaciones por ahora.</Typography>
          </MenuItem>
        ) : (
          items.map(n => (
            <MenuItem
              key={n.id}
              onClick={() => handleClick(n)}
              sx={{ whiteSpace: 'normal', alignItems: 'flex-start', bgcolor: n.readAt ? 'transparent' : 'action.hover' }}
            >
              <ListItemAvatar sx={{ minWidth: 40 }}>
                <Avatar src={n.actor?.avatar || undefined} sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 13 }}>
                  {(n.actor?.name || '?').charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={describe(n)}
                secondary={
                  <>
                    <FechaRelativa fecha={n.createdAt} />
                    {/* 13D: el toque se contesta desde aquí, que es donde la
                        persona se entera. Antes este clic llevaba a /cerca —
                        a la lista, no a quien saludó. */}
                    {n.type === 'POKE' && n.actor?.id && <SaludoDeVuelta notificacion={n} />}
                  </>
                }
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption', component: 'div' }}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;
