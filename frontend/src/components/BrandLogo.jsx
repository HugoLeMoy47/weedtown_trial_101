import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import SpaIcon from '@mui/icons-material/Spa';

// Logo oficial servido desde public/logo.png; si el archivo no existe aún,
// cae al ícono de hoja para no romper la UI.
const LOGO_SRC = `${process.env.PUBLIC_URL || ''}/logo.png`;

// Isotipo: el logo va recortado en círculo sobre fondo blanco (el PNG tiene
// fondo blanco), así se ve intencional también en modo oscuro.
export function BrandMark({ size = 36, sx = {} }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <SpaIcon color="primary" sx={{ fontSize: size, ...sx }} aria-hidden="true" />;
  }

  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: '#ffffff',
        objectFit: 'cover',
        boxShadow: 1,
        flexShrink: 0,
        ...sx
      }}
    />
  );
}

// Wordmark de dos tonos como el logo: "Weed" en degradado lima→verde, "Town" en el color de texto.
export function BrandWordmark({ variant = 'h6', component = 'span', sx = {}, ...props }) {
  return (
    <Typography
      variant={variant}
      component={component}
      {...props}
      sx={{ fontWeight: 800, fontStyle: 'italic', letterSpacing: 0.5, lineHeight: 1, ...sx }}
    >
      <Box
        component="span"
        sx={{
          background: 'linear-gradient(90deg, #8bc34a 0%, #388e3c 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent'
        }}
      >
        Weed
      </Box>
      <Box component="span" sx={{ color: 'text.primary' }}>Town</Box>
    </Typography>
  );
}
