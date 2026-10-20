import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Typography, Link, Stack, Chip } from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import SpaIcon from '@mui/icons-material/Spa';
import { API_ORIGIN } from '../services/api';
import { VERSION, etiquetaDeVersion, etiquetaDeApi } from '../lib/version';

// Versión publicada (ciclo 19B). La línea del frontend sale del bundle y no
// cuesta nada. La del backend NO se pide al cargar la página: el backend de
// Render duerme y una petición por visita lo despertaría solo para pintar un
// pie. Solo se consulta si alguien toca la versión — que es quien la quiere.
const VersionPublicada = () => {
  const [api, setApi] = useState(null); // null = sin pedir · string = respuesta · false = no responde
  const [cargando, setCargando] = useState(false);

  const consultar = async () => {
    if (cargando) return;
    setCargando(true);
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), 8000);
    try {
      const res = await fetch(`${API_ORIGIN}/health`, { signal: control.signal });
      const datos = await res.json();
      setApi(etiquetaDeApi(datos) || 'api · sin versión (no corre en Render)');
    } catch {
      setApi(false);
    } finally {
      clearTimeout(t);
      setCargando(false);
    }
  };

  return (
    <Stack spacing={0.25} alignItems="center">
      <Typography
        component="button"
        type="button"
        variant="caption"
        color="text.secondary"
        onClick={consultar}
        title={VERSION.construidoEn ? `Compilado el ${VERSION.construidoEn}. Toca para ver también la versión del servidor.` : 'Toca para ver la versión del servidor.'}
        aria-label={`Versión publicada: ${etiquetaDeVersion()}. Activar para ver también la versión del servidor.`}
        sx={{ background: 'none', border: 0, p: 0, cursor: 'pointer', font: 'inherit', opacity: 0.7, '&:hover': { opacity: 1, textDecoration: 'underline' } }}
      >
        {etiquetaDeVersion()}
      </Typography>
      {(cargando || api !== null) && (
        <Typography variant="caption" color="text.secondary" role="status" sx={{ opacity: 0.7 }}>
          {cargando ? 'consultando…' : api === false ? 'el servidor no respondió' : api}
        </Typography>
      )}
    </Stack>
  );
};

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

          <VersionPublicada />
        </Stack>
      </Container>
    </Box>
  );
};

export default Footer;
