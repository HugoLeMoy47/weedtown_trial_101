import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import SpaIcon from '@mui/icons-material/Spa';

import { useMesPatrio } from '../lib/mesPatrio';

// Marca en orden de preferencia: el PNG oficial (si existe en public/) y,
// si no, la versión vectorial SVG del logo. El ícono de hoja es el último recurso.
// `BASE_URL` es el equivalente en Vite de PUBLIC_URL (12B). Vale '/' salvo que
// el sitio se sirva bajo un subdirectorio, así que se recorta la barra final
// para no terminar con '//logo.png'.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const LOGO_SOURCES = [`${BASE}/logo.png`, `${BASE}/logo.svg`];

/**
 * Doodle patrio: un sombrerito charro mexicano en miniatura con su copa,
 * ala ancha ribeteada en dorado y su cinta tricolor (verde, blanco y rojo).
 */
export function SombreritoCharro({ size = 26, sx = {} }) {
  const width = size;
  const height = (size * 36) / 48;
  return (
    <Box
      component="svg"
      viewBox="0 0 48 36"
      aria-hidden="true"
      sx={{
        width,
        height,
        position: 'absolute',
        top: -height * 0.45,
        right: -width * 0.28,
        transform: 'rotate(15deg)',
        filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.4))',
        pointerEvents: 'none',
        zIndex: 3,
        ...sx
      }}
    >
      {/* Copa del sombrero */}
      <path
        d="M17 22 C17 10, 21 4, 24 4 C27 4, 31 10, 31 22 Z"
        fill="#dfb170"
        stroke="#795548"
        strokeWidth="1"
      />
      {/* Hendidura charra superior */}
      <path
        d="M22 5 C23 7, 25 7, 26 5"
        stroke="#795548"
        strokeWidth="1"
        fill="none"
      />
      {/* Cinta tricolor en la base de la copa */}
      <path d="M17 20 L21.7 20 L21.7 22 L17 22 Z" fill="#006847" />
      <path d="M21.7 20 L26.3 20 L26.3 22 L21.7 22 Z" fill="#ffffff" />
      <path d="M26.3 20 L31 20 L31 22 L26.3 22 Z" fill="#ce1126" />
      {/* Ala ancha charra curvada hacia arriba en los extremos */}
      <path
        d="M3 25 C14 18, 34 18, 45 25 C39 28.5, 9 28.5, 3 25 Z"
        fill="#cf9c58"
        stroke="#795548"
        strokeWidth="1"
      />
      {/* Ribete bordado charro en el contorno del ala */}
      <path
        d="M5 25 C15 19.5, 33 19.5, 43 25"
        fill="none"
        stroke="#ffeb3b"
        strokeWidth="1.2"
        strokeDasharray="2,1.2"
      />
    </Box>
  );
}

// Isotipo: el logo va recortado en círculo sobre fondo blanco,
// así se ve intencional también en modo oscuro. En septiembre o cuando esté
// activo el ambiente patrio, se corona con el doodle de sombrerito charro.
export function BrandMark({ size = 36, sx = {} }) {
  const [srcIndex, setSrcIndex] = useState(0);
  const { esMesPatrio } = useMesPatrio();

  const contenido = srcIndex >= LOGO_SOURCES.length ? (
    <SpaIcon color="primary" sx={{ fontSize: size }} aria-hidden="true" />
  ) : (
    <Box
      component="img"
      src={LOGO_SOURCES[srcIndex]}
      alt=""
      aria-hidden="true"
      onError={() => setSrcIndex(i => i + 1)}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: '#ffffff',
        objectFit: 'cover',
        boxShadow: 1,
        flexShrink: 0
      }}
    />
  );

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...sx
      }}
    >
      {contenido}
      {esMesPatrio && <SombreritoCharro size={size * 0.8} />}
    </Box>
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
