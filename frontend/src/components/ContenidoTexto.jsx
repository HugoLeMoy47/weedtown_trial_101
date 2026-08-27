import React from 'react';
import { Typography, Link, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

// Tokenizador: URLs completas y menciones @handle
const TOKEN_REGEX = /(https?:\/\/[^\s]+)|(@[a-z0-9][a-z0-9_]{1,19})/gi;

export function extraerYoutubeId(texto) {
  if (!texto) return null;
  const match = YOUTUBE_REGEX.exec(texto);
  return match ? match[1] : null;
}

export function parsearContenido(texto) {
  if (!texto) return [];

  const elementos = [];
  let ultimoIndice = 0;
  let match;

  while ((match = TOKEN_REGEX.exec(texto)) !== null) {
    const indiceInicio = match.index;
    if (indiceInicio > ultimoIndice) {
      elementos.push(texto.slice(ultimoIndice, indiceInicio));
    }

    const token = match[0];
    if (match[1]) {
      // URL web
      elementos.push(
        <Link
          key={indiceInicio}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ wordBreak: 'break-all' }}
        >
          {token}
        </Link>
      );
    } else if (match[2]) {
      // Mención @handle
      const handle = token.slice(1);
      elementos.push(
        <Link
          key={indiceInicio}
          component={RouterLink}
          to={`/@${handle}`}
          sx={{
            fontWeight: 600,
            color: 'primary.main',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' }
          }}
        >
          {token}
        </Link>
      );
    }

    ultimoIndice = TOKEN_REGEX.lastIndex;
  }

  if (ultimoIndice < texto.length) {
    elementos.push(texto.slice(ultimoIndice));
  }

  return elementos;
}

const ContenidoTexto = ({ texto, variant = 'body1', sx = {} }) => {
  if (!texto) return null;

  const youtubeId = extraerYoutubeId(texto);
  const contenidoParseado = parsearContenido(texto);

  return (
    <Box>
      <Typography variant={variant} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...sx }}>
        {contenidoParseado}
      </Typography>

      {youtubeId && (
        <Box
          sx={{
            mt: 1.5,
            mb: 1,
            position: 'relative',
            width: '100%',
            pt: '56.25%', // 16:9 ratio
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: 'black'
          }}
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
            title="Video de YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0
            }}
          />
        </Box>
      )}
    </Box>
  );
};

export default ContenidoTexto;
