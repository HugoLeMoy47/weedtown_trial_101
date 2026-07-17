import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton, Badge, Menu, MenuItem, Typography, Box, CircularProgress, Tooltip, ListItemAvatar, Avatar, ListItemText
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import api from '../services/api';

const POLL_MS = 30000;

function describe(n) {
  const actor = n.actor?.name || 'Alguien';
  const title = n.forumPost?.title ? `«${n.forumPost.title}»` : 'tu publicación';
  switch (n.type) {
    case 'REPLY_POST': return `${actor} respondió a tu post ${title}`;
    case 'REPLY_COMMENT': return `${actor} respondió a tu comentario en ${title}`;
    case 'NEW_SUBFORUM_POST': return `Nuevo post en ${n.subforum?.name || 'un subforo que sigues'}: ${title}`;
    case 'POKE': return `${actor} te mandó un toque 👋 desde Cerca`;
    default: return `${actor} interactuó contigo`;
  }
}

function targetPath(n) {
  if (n.type === 'POKE') return '/cerca';
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
                secondary={new Date(n.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;
