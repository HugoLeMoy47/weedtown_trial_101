import React from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Button, IconButton, Avatar, Box, Tooltip, Container
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import { BrandMark, BrandWordmark } from './BrandLogo';
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
          <Box
            component={RouterLink}
            to="/feed"
            aria-label="WeedTown — ir al feed"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: 2 }}
          >
            <BrandMark size={38} />
            <BrandWordmark variant="h6" />
          </Box>

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
