import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Button, IconButton, Avatar, Box, Tooltip, Container, Badge,
  BottomNavigation, BottomNavigationAction, Menu, MenuItem, ListItemIcon, ListItemText,
  Divider, Typography, GlobalStyles
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import ForumIcon from '@mui/icons-material/Forum';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import GavelIcon from '@mui/icons-material/Gavel';
import PersonIcon from '@mui/icons-material/Person';
import PolicyIcon from '@mui/icons-material/Policy';
import { BrandMark, BrandWordmark } from './BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { useColorMode } from '../theme';
import api from '../services/api';
import { requestFeedRefresh } from '../lib/refresh';
import {
  BAR_HEIGHT_PX, DOCK_SIDE_MARGIN_PX, DOCK_GAP_PX, DOCK_BOTTOM_OFFSET,
  BOTTOM_DOCK_RESERVED_HEIGHT, CHAT_ABIERTO_EVENT
} from '../lib/mobileNav';
import NotificationBell from './NotificationBell';
import SuspensionBanner from './SuspensionBanner';

const POLL_SOLICITUDES_MS = 30000;

const baseLinks = [
  { to: '/feed', label: 'Feed', icon: <DynamicFeedIcon /> },
  { to: '/forum', label: 'Foros', icon: <ForumIcon /> },
  { to: '/chat', label: 'Chat', icon: <ChatBubbleOutlineIcon /> },
  { to: '/cerca', label: 'Cerca', icon: <MyLocationIcon /> },
  { to: '/amigos', label: 'Amigos', icon: <PeopleAltIcon /> }
];

// La entrada al panel solo aparece con rol de moderación. Ocultarla es
// comodidad, no seguridad: quien fuerce la URL igual recibe 403 del servidor.
const linkModeracion = { to: '/admin', label: 'Moderación', icon: <GavelIcon /> };

// Rutas donde Feed.jsx/Subforum.jsx dibujan su propio FAB de "nuevo posteo" —
// ver mobileNav.js. La barra flotante necesita saberlo para dejarle su
// espacio a la derecha; en cualquier otra ruta se estira a todo el ancho.
const tieneFab = (pathname) => pathname === '/feed' || /^\/forum\/[^/]+$/.test(pathname);

const Navbar = () => {
  const { user, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [chatAbierto, setChatAbierto] = useState(false);

  const esModerador = ['MOD', 'ADMIN'].includes(user?.role);
  const navLinks = esModerador ? [...baseLinks, linkModeracion] : baseLinks;
  const menuOpen = Boolean(menuAnchor);

  // Cuántas solicitudes de amistad esperan respuesta, para el badge de
  // "Amigos" — mismo criterio de polling que la campana de notificaciones.
  const refreshSolicitudes = useCallback(() => {
    api.get('/friends/requests')
      .then(res => setSolicitudesPendientes(res.data.recibidas?.length || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshSolicitudes();
    const timer = setInterval(refreshSolicitudes, POLL_SOLICITUDES_MS);
    return () => clearInterval(timer);
  }, [user, refreshSolicitudes]);

  // Puente con Chat.jsx (Tarea 3): en móvil, con una conversación abierta, la
  // barra se repliega — fijarla encima del compositor con el teclado abierto
  // es justo el bug de iOS que el ciclo pide esquivar. Se resetea sola al
  // cambiar de ruta por si Chat.jsx se desmonta sin avisar.
  useEffect(() => {
    const onChatAbierto = (e) => setChatAbierto(Boolean(e.detail?.abierto));
    window.addEventListener(CHAT_ABIERTO_EVENT, onChatAbierto);
    return () => window.removeEventListener(CHAT_ABIERTO_EVENT, onChatAbierto);
  }, []);
  useEffect(() => {
    if (pathname !== '/chat') setChatAbierto(false);
  }, [pathname]);

  const handleLogout = () => {
    setMenuAnchor(null);
    logout();
    navigate('/login');
  };

  const irA = (ruta) => {
    setMenuAnchor(null);
    navigate(ruta);
  };

  return (
    <>
    {user && (
      <GlobalStyles
        styles={(theme) => ({
          [theme.breakpoints.down('md')]: {
            // Resuelto una sola vez acá (no página por página, se olvidaría en
            // alguna): compensa el alto de la barra flotante para que ningún
            // contenido quede inalcanzable detrás de ella.
            html: { overscrollBehaviorY: 'contain' },
            body: {
              paddingBottom: chatAbierto ? 0 : BOTTOM_DOCK_RESERVED_HEIGHT,
              overscrollBehaviorY: 'contain'
            }
          }
        })}
      />
    )}
    <AppBar position="sticky" color="inherit" elevation={1} component="nav" aria-label="Navegación principal">
      <Container maxWidth="md" disableGutters>
        <Toolbar sx={{ gap: 1 }}>
          <Box
            component={RouterLink}
            to="/feed"
            onClick={requestFeedRefresh}
            aria-label="WeedTown — ir al feed y actualizarlo"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: { xs: 0, md: 2 } }}
          >
            <BrandMark size={38} />
            <BrandWordmark variant="h6" sx={{ display: { xs: 'none', sm: 'inline' } }} />
          </Box>

          {/* Links inline: solo en escritorio — sin cambios respecto de hoy */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
            {navLinks.map(({ to, label }) => (
              <Button
                key={to}
                component={RouterLink}
                to={to}
                color={pathname === to ? 'primary' : 'secondary'}
                aria-current={pathname === to ? 'page' : undefined}
              >
                {to === '/amigos' ? (
                  <Badge badgeContent={solicitudesPendientes} color="primary" max={99}>
                    <Box sx={{ pr: solicitudesPendientes > 0 ? 1 : 0 }}>{label}</Box>
                  </Badge>
                ) : label}
              </Button>
            ))}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Toggle de tema inline: solo escritorio (en móvil vive en el menú del avatar) */}
          <Tooltip title={mode === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}>
            <IconButton
              onClick={toggle}
              color="secondary"
              aria-label={mode === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
              sx={{ display: { xs: 'none', md: 'inline-flex' } }}
            >
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          {user && (
            <>
              <NotificationBell />

              {/* Escritorio: el avatar sigue siendo el enlace directo a /profile de hoy */}
              <Tooltip title="Mi perfil">
                <IconButton
                  component={RouterLink} to="/profile" aria-label="Ir a mi perfil"
                  sx={{ p: 0.5, display: { xs: 'none', md: 'inline-flex' } }}
                >
                  <Avatar
                    src={user.avatar || undefined}
                    alt={user.displayName || user.name}
                    sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}
                  >
                    {(user.displayName || user.name || '?').charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Tooltip title="Cerrar sesión">
                <IconButton
                  onClick={handleLogout}
                  color="secondary"
                  aria-label="Cerrar sesión"
                  sx={{ display: { xs: 'none', md: 'inline-flex' } }}
                >
                  <LogoutIcon />
                </IconButton>
              </Tooltip>

              {/* Móvil: el avatar deja de ser un enlace directo y pasa a abrir este menú */}
              <Tooltip title="Mi cuenta">
                <IconButton
                  onClick={(e) => setMenuAnchor(e.currentTarget)}
                  aria-label="Abrir menú de cuenta"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  sx={{ p: 0.5, display: { xs: 'inline-flex', md: 'none' } }}
                >
                  <Avatar
                    src={user.avatar || undefined}
                    alt={user.displayName || user.name}
                    sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}
                  >
                    {(user.displayName || user.name || '?').charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={menuOpen}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <Box sx={{ px: 2, py: 1, minWidth: 180 }}>
                  <Typography variant="subtitle2" fontWeight={700} noWrap>{user.displayName || user.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>@{user.handle}</Typography>
                </Box>
                <Divider />
                <MenuItem onClick={() => irA('/profile')}>
                  <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Mi perfil</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { toggle(); setMenuAnchor(null); }}>
                  <ListItemIcon>{mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}</ListItemIcon>
                  <ListItemText>{mode === 'light' ? 'Modo oscuro' : 'Modo claro'}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => irA('/terms')}>
                  <ListItemIcon><PolicyIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Términos y privacidad</ListItemText>
                </MenuItem>
                {esModerador && (
                  <MenuItem onClick={() => irA('/admin')}>
                    <ListItemIcon><GavelIcon fontSize="small" color="primary" /></ListItemIcon>
                    <ListItemText>Moderación</ListItemText>
                  </MenuItem>
                )}
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Cerrar sesión</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </Container>
    </AppBar>
    <SuspensionBanner />

    {/* Barra flotante inferior — solo móvil, variante C (barra + FAB como dos
        piezas separadas en la misma fila). Se repliega con una conversación
        de chat abierta (ver el puente de CHAT_ABIERTO_EVENT arriba). */}
    {user && (
      <Box
        sx={{
          display: { xs: chatAbierto ? 'none' : 'flex', md: 'none' },
          position: 'fixed',
          left: `${DOCK_SIDE_MARGIN_PX}px`,
          right: tieneFab(pathname)
            ? `${DOCK_SIDE_MARGIN_PX + BAR_HEIGHT_PX + DOCK_GAP_PX}px`
            : `${DOCK_SIDE_MARGIN_PX}px`,
          bottom: DOCK_BOTTOM_OFFSET,
          zIndex: (t) => t.zIndex.appBar
        }}
      >
        <BottomNavigation
          showLabels
          value={pathname}
          onChange={() => {}}
          sx={{
            width: '100%',
            height: `${BAR_HEIGHT_PX}px`,
            borderRadius: '18px',
            border: 1,
            borderColor: 'divider',
            boxShadow: 4,
            bgcolor: 'background.paper',
            '& .MuiBottomNavigationAction-root': { minWidth: 0, minHeight: 48, padding: '6px 0' }
          }}
        >
          {baseLinks.map(({ to, label, icon }) => (
            <BottomNavigationAction
              key={to}
              component={RouterLink}
              to={to}
              value={to}
              label={label}
              aria-current={pathname === to ? 'page' : undefined}
              icon={to === '/amigos' ? (
                <Badge badgeContent={solicitudesPendientes} color="primary" max={99}>{icon}</Badge>
              ) : icon}
            />
          ))}
        </BottomNavigation>
      </Box>
    )}
    </>
  );
};

export default Navbar;
