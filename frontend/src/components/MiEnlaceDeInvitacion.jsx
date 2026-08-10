import React, { useState } from 'react';
import { Card, CardContent, Typography, Button, Stack, Box, Chip, Snackbar } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import { compartirEnlace } from '../lib/compartir';

// Tu enlace para invitar (ciclo 11A).
//
// POR QUÉ EXISTE ESTE COMPONENTE, dicho sin adornos: el 11A construyó todo el
// mecanismo de invitación —el recorrido, el contador, la privacidad— y **no
// puso en ninguna parte dónde obtener tu enlace**. La función era inusable: la
// única forma de conseguirlo era saber que tu perfil vive en /@tuhandle y
// escribirlo a mano. Lo señaló el PO al probarlo.
//
// El enlace de invitación NO es una URL aparte. Es tu perfil, y esa es la
// decisión de diseño: tu tarjeta de presentación dentro de la red y tu enlace
// para traer gente son la misma cosa. Una URL de referido con parámetros sería
// otra superficie que validar, se vería como spam al pegarla, y delataría en
// el propio enlace que estás midiendo algo.
//
// El contador exacto se muestra aquí y solo aquí, porque este es tu perfil.
// Hacia afuera viaja una cubeta — ver src/lib/invitaciones.js en el backend.
const MiEnlaceDeInvitacion = ({ handle, invitaciones, bio }) => {
  const [aviso, setAviso] = useState('');
  if (!handle) return null;

  const url = `${window.location.origin}/@${handle}`;
  const n = Number(invitaciones) || 0;
  const sinBio = !bio || !bio.trim();

  const compartir = async () => {
    const mensaje = await compartirEnlace({
      titulo: 'Únete a WeedTown',
      texto: 'Te invito a WeedTown, la red social de la comunidad cannábica de México.',
      url
    });
    if (mensaje) setAviso(mensaje);
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>Tu enlace</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Es tu perfil y tu invitación a la vez. Quien lo abra sin cuenta verá que fuiste tú
          quien lo invitó, y podrá mandarte solicitud de amistad — nunca quedan como amigos
          automáticamente.
        </Typography>

        {/* El enlace se muestra completo y seleccionable: en escritorio mucha
            gente prefiere copiarlo con el mouse antes que confiar en un botón. */}
        <Box
          component="p"
          sx={{
            m: 0, mb: 2, p: 1.5, borderRadius: 1,
            bgcolor: 'action.hover',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 14, wordBreak: 'break-all', userSelect: 'all'
          }}
        >
          {url}
        </Box>

        {/* Ciclo 13B: el empujón va AQUÍ y no en un aviso permanente arriba
            del perfil. Un "completa tu perfil" que aparece siempre se aprende
            a ignorar en dos días. Este momento es distinto: la persona está a
            punto de mandar su enlace a alguien, y lo que ve es exactamente lo
            que va a recibir la otra persona. El vacío deja de ser una
            regañina abstracta y se vuelve una consecuencia visible.

            Con bio no se pinta nada. Un empujón que aparece siempre no es un
            empujón, es decoración. */}
        {sinBio && (
          <Box
            sx={{
              mb: 2, p: 1.5, borderRadius: 1,
              border: 1, borderColor: 'divider', borderStyle: 'dashed'
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Así se ve tu enlace ahora mismo: <strong>@{handle}</strong>, sin nada más.
              Quien lo abra no va a saber quién eres. Una línea en tu biografía —aquí
              arriba— lo cambia.
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button variant="contained" startIcon={<ShareIcon />} onClick={compartir}>
            Compartir mi enlace
          </Button>
          {/* Cero no se pinta como "0": se dice con palabras, porque un cero
              suelto en tu propio perfil se lee como un reproche. */}
          <Chip
            size="small"
            variant="outlined"
            label={n === 0
              ? 'Todavía nadie ha llegado por tu enlace'
              : `${n} ${n === 1 ? 'persona ha llegado' : 'personas han llegado'} por tu enlace`}
          />
        </Stack>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
          Este número solo lo ves tú, salvo que lo abras en «Quién ve qué» — y aun así, a los
          demás se les muestra como un rango («5+»), nunca la cifra exacta. WeedTown no guarda
          quién invitó a quién: solo cuenta.
        </Typography>

        <Snackbar
          open={Boolean(aviso)}
          autoHideDuration={3000}
          onClose={() => setAviso('')}
          message={aviso}
        />
      </CardContent>
    </Card>
  );
};

export default MiEnlaceDeInvitacion;
