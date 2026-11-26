import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Stack, Typography, Chip, Button, Paper, Link } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import BlockIcon from '@mui/icons-material/Block';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Ciclo 24: presentación de WeedTown en /login para quien llega sin conocerla.
//
// REGLA DE CONTENIDO: aquí solo va lo que ya funciona en producción (ver la
// tabla de estado del README). Nada de "próximamente", nada de cifras de
// comunidad: un número fijo envejece y uno en vivo despertaría al backend de
// Render en cada visita (misma razón que el pie de versión en Footer.jsx).
// El mercado comunitario sigue en fase posterior y por eso no aparece.

const DIFERENCIALES = [
  {
    Icono: LockOutlinedIcon,
    titulo: 'Sin contraseñas y con seudónimo',
    texto: 'Entras con un enlace por correo, una llave de acceso o Mastodon. Tu perfil no pide nombre real, y cada dato decide quién lo ve: todos, tus amistades o nadie.'
  },
  {
    Icono: PhotoCameraOutlinedIcon,
    titulo: 'Tus fotos, sin rastro',
    texto: 'Quitamos la ubicación, el modelo del teléfono y la fecha de cada imagen: primero en tu navegador y otra vez en el servidor.'
  },
  {
    Icono: TuneIcon,
    titulo: 'Tú decides para qué se usan tus datos',
    texto: 'Cada uso se autoriza por separado y se puede apagar. Puedes descargar tus datos o eliminar tu cuenta cuando quieras.'
  },
  {
    Icono: BlockIcon,
    titulo: 'Respeto con dientes',
    texto: 'Bloquear tiene efecto inmediato en feed, foros, chat y mapa. Reportar no revela quién reporta, y hay moderación activa. Solo mayores de 18.'
  }
];

const FUNCIONES = [
  { Icono: DynamicFeedIcon, titulo: 'Feed', texto: 'Posteos con foto, temas y reacciones propias: 👍 Me gusta, 🌿 Me rola, 👀 Me interesa, 😒 Me molesta.' },
  { Icono: ForumOutlinedIcon, titulo: 'Foros', texto: 'Subforos por tema con hilos de conversación.' },
  { Icono: ChatBubbleOutlineIcon, titulo: 'Chat', texto: 'Mensajes 1 a 1 en tiempo real.' },
  { Icono: PlaceOutlinedIcon, titulo: 'Cerca', texto: 'Mapa por zonas de unos 2 km: nunca tu ubicación exacta. Saluda con un toque 👋.' },
  { Icono: PeopleOutlineIcon, titulo: 'Amistades', texto: 'Solicitud mutua y posteos solo para amistades.' },
  { Icono: FaceRetouchingNaturalIcon, titulo: 'Avatar pixel art', texto: 'Arma el tuyo por piezas, sin subir tu foto.' }
];

// Mismos nombres que siembra backend/scripts/subforos.js.
const SUBFOROS = [
  'Reducción de riesgos y daños',
  'Cultivo de cannabis',
  'Situación legal de la cannabis en México',
  'Protocolo ciudadano y autoridad',
  'Métodos de extracción',
  'Historia de la cannabis',
  'Economía de la cannabis',
  'Noticias cannábicas'
];

const Encabezado = ({ children, id }) => (
  <Typography variant="overline" component="h2" id={id} color="primary" sx={{ fontWeight: 700, letterSpacing: 1.2, lineHeight: 1.6 }}>
    {children}
  </Typography>
);

const PresentacionWeedTown = ({ onCrearCuenta }) => (
  <Stack component="section" aria-labelledby="presentacion-titulo" spacing={4} sx={{ width: '100%' }}>
    <Box>
      <Typography variant="h4" component="h2" id="presentacion-titulo" fontWeight={800} sx={{ lineHeight: 1.15, mb: 1.5, fontSize: { xs: '1.6rem', md: '2.125rem' }, pr: { xs: 5, md: 0 } }}>
        Comparte, aprende y conecta sin estigma.
      </Typography>
      <Typography variant="body1" color="text.secondary">
        WeedTown es la red social de la comunidad cannábica mexicana: un espacio seguro, con respeto y
        con la privacidad como base, no como opción. Hecha en México, por y para la comunidad.
      </Typography>
    </Box>

    <Box>
      <Encabezado id="presentacion-diferenciales">Por qué es distinta</Encabezado>
      <Box
        component="ul"
        aria-labelledby="presentacion-diferenciales"
        sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}
      >
        {DIFERENCIALES.map(({ Icono, titulo, texto }) => (
          <Box component="li" key={titulo} sx={{ display: 'flex', gap: 1.5 }}>
            <Icono color="primary" sx={{ mt: 0.25, flexShrink: 0 }} aria-hidden="true" />
            <Box>
              <Typography variant="subtitle2" component="h3" fontWeight={700}>{titulo}</Typography>
              <Typography variant="body2" color="text.secondary">{texto}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>

    <Box>
      <Encabezado id="presentacion-funciones">Qué puedes hacer</Encabezado>
      <Box
        component="ul"
        aria-labelledby="presentacion-funciones"
        sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' } }}
      >
        {FUNCIONES.map(({ Icono, titulo, texto }) => (
          <Paper component="li" key={titulo} variant="outlined" sx={{ p: 1.5, bgcolor: 'transparent' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Icono fontSize="small" color="secondary" aria-hidden="true" />
              <Typography variant="subtitle2" component="h3" fontWeight={700}>{titulo}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">{texto}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>

    <Paper
      variant="outlined"
      sx={{ p: { xs: 2, sm: 2.5 }, borderColor: 'primary.main', borderWidth: 2, bgcolor: 'action.hover' }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LocalOfferOutlinedIcon color="primary" aria-hidden="true" />
          <Typography variant="h6" component="h2" fontWeight={700} sx={{ lineHeight: 1.25 }}>
            Estudio de etiquetado artesanal
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Si haces tópicos, tinturas o comestibles, arma su etiqueta con una guía en vivo de las normas
          mexicanas (NOM-141, NOM-072 y NOM-051) y un apartado de reducción de riesgos. Es una referencia
          para orientarte, no una certificación.
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label="Pruébalo sin cuenta" variant="outlined" color="primary" />
          <Chip size="small" label="Con cuenta: edita, imprime y comparte" variant="outlined" />
        </Stack>
        <Box>
          <Button
            component={RouterLink}
            to="/etiquetas"
            variant="contained"
            color="primary"
            endIcon={<ArrowForwardIcon />}
            sx={{ mt: 0.5 }}
          >
            Ver el estudio de etiquetas
          </Button>
        </Box>
      </Stack>
    </Paper>

    <Box>
      <Encabezado id="presentacion-comunidad">La comunidad</Encabezado>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
        Educación, cultura, arte y reducción de riesgos. Algunos de los foros donde ya se conversa:
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap aria-labelledby="presentacion-comunidad">
        {SUBFOROS.map(nombre => (
          <Chip key={nombre} label={nombre} size="small" />
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
        Aquí no se ofrecen ni se venden sustancias. Las Normas de Convivencia están en los{' '}
        <Link component={RouterLink} to="/terms" color="primary">Términos y Condiciones</Link>.
      </Typography>
    </Box>

    {onCrearCuenta && (
      <Box sx={{ textAlign: 'center' }}>
        <Button variant="outlined" size="large" onClick={onCrearCuenta}>
          Crear mi cuenta
        </Button>
      </Box>
    )}
  </Stack>
);

export default PresentacionWeedTown;
