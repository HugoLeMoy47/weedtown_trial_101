import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Typography, Link, Stack, Chip } from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import SpaIcon from '@mui/icons-material/Spa';

const Footer = () => {
  return (
    <Box component="footer" sx={{ py: 3, px: 2, mt: 'auto', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
      <Container maxWidth="md">
        <Stack spacing={2} alignItems="center" textAlign="center">
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="center">
            <Chip icon={<SpaIcon fontSize="small" />} label="18+ Únicamente" size="small" color="primary" variant="outlined" />
            <Chip icon={<ShieldIcon fontSize="small" />} label="Privacidad Máxima" size="small" color="secondary" variant="outlined" />
          </Stack>
          
          <Typography variant="body2" color="text.secondary">
            WeedTown 🇲🇽🌿 — Espacio digital libre de estigma, de seguridad y respeto para la comunidad cannábica en México.
          </Typography>

          <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
            <Link component={RouterLink} to="/terms" color="primary" variant="body2" underline="hover">
              Términos y Condiciones
            </Link>
            <Typography variant="body2" color="text.secondary">•</Typography>
            <Link component={RouterLink} to="/terms" color="primary" variant="body2" underline="hover">
              Política de Privacidad (LFPDPPP)
            </Link>
            <Typography variant="body2" color="text.secondary">•</Typography>
            <Link component={RouterLink} to="/terms" color="primary" variant="body2" underline="hover">
              Normas de Convivencia
            </Link>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            © {new Date().getFullYear()} WeedTown Colectivo. Operación autónoma comunitaria.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
};

export default Footer;
