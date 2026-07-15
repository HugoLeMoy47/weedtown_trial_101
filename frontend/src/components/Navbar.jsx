import React from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Button, IconButton, Avatar, Box, Tooltip, Container
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import SpaIcon from '@mui/icons-material/Spa';
import { useAuth } from '../hooks/useAuth';
import { useColorMode } from '../theme';
import NotificationBell from './NotificationBell';

const navLinks = [
  { to: '/feed', label: 'Feed' },
  { to: '/forum', label: 'Foros' },
  { to: '/chat', label: 'Chat' }
];

const Navbar = () => {
  const { user, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppBar position="sticky" color="inherit" elevation={1} component="nav" aria-label="Navegación principal">
      <Container maxWidth="md" disableGutters>
        <Toolbar sx={{ gap: 1 }}>
          <SpaIcon color="primary" aria-hidden="true" />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/feed"
            sx={{ color: 'text.primary', textDecoration: 'none', mr: 2 }}
          >
            WeedTown
          </Typography>

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

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title={mode === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}>
            <IconButton onClick={toggle} color="secondary" aria-label={mode === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}>
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
                <IconButton onClick={handleLogout} color="secondary" aria-label="Cerrar sesión">
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default Navbar;
