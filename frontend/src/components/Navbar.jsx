import React, { useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Button, IconButton, Avatar, Box, Tooltip, Container,
  Drawer, List, ListItemButton, ListItemIcon, ListItemText, Divider
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import ForumIcon from '@mui/icons-material/Forum';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { BrandMark, BrandWordmark } from './BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { useColorMode } from '../theme';
import NotificationBell from './NotificationBell';

const navLinks = [
  { to: '/feed', label: 'Feed', icon: <DynamicFeedIcon /> },
  { to: '/forum', label: 'Foros', icon: <ForumIcon /> },
  { to: '/chat', label: 'Chat', icon: <ChatBubbleOutlineIcon /> },
  { to: '/cerca', label: 'Cerca', icon: <MyLocationIcon /> }
];

const Navbar = () => {
  const { user, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    setDrawerOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <AppBar position="sticky" color="inherit" elevation={1} component="nav" aria-label="Navegación principal">
      <Container maxWidth="md" disableGutters>
        <Toolbar sx={{ gap: 1 }}>
          {/* Hamburguesa: solo en móvil */}
          <IconButton
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú de navegación"
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Box
            component={RouterLink}
            to="/feed"
            aria-label="WeedTown — ir al feed"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: { xs: 0, md: 2 } }}
          >
            <BrandMark size={38} />
            <BrandWordmark variant="h6" sx={{ display: { xs: 'none', sm: 'inline' } }} />
          </Box>

          {/* Links inline: solo en escritorio */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
            {navLinks.map(({ to, label }) => (
              <Button
                key={to}
                component={RouterLink}
                to={to}
                color={pathname === to ? 'primary' : 'secondary'}
                aria-current={pathname === to ? 'page' : undefined}
              >
                {label}
              </Button>
            ))}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Toggle de tema inline: solo escritorio (en móvil vive en el drawer) */}
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
              <Tooltip title="Mi perfil">
                <IconButton component={RouterLink} to="/profile" aria-label="Ir a mi perfil" sx={{ p: 0.5 }}>
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
            </>
          )}
        </Toolbar>
      </Container>

      {/* Menú móvil */}
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260 }} role="presentation">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
            <BrandMark size={34} />
            <BrandWordmark variant="h6" />
          </Box>
          <Divider />
          <List>
            {navLinks.map(({ to, label, icon }) => (
              <ListItemButton
                key={to}
                component={RouterLink}
                to={to}
                selected={pathname === to}
                onClick={() => setDrawerOpen(false)}
                aria-current={pathname === to ? 'page' : undefined}
              >
                <ListItemIcon>{icon}</ListItemIcon>
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <List>
            <ListItemButton onClick={toggle}>
              <ListItemIcon>{mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}</ListItemIcon>
              <ListItemText primary={mode === 'light' ? 'Modo oscuro' : 'Modo claro'} />
            </ListItemButton>
            {user && (
              <ListItemButton onClick={handleLogout}>
                <ListItemIcon><LogoutIcon /></ListItemIcon>
                <ListItemText primary="Cerrar sesión" />
              </ListItemButton>
            )}
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
};

export default Navbar;
