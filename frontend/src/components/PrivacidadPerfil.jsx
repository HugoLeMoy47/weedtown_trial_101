import React, { useState } from 'react';
import {
  Box, Typography, Stack, Divider, MenuItem, TextField, Switch, FormControlLabel,
  Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Chip
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import api from '../services/api';

// Visibilidad del perfil, dato por dato, más el interruptor de "también fuera
// de la red" (ciclo 10B).
//
// Solo aparecen los campos configurables. `email`, `phone`, `fullName` y
// `birthdate` NO están aquí a propósito: son contacto, autenticación e
// identificación real, y ofrecerlos como interruptor sería ofrecer un disparo
// al pie en una comunidad con estigma. El servidor tampoco los expone nunca.
//
// Se EXPORTA porque `Profile.jsx` arma con ella el objeto de preferencias que
// le pasa a este componente. Antes lo listaba a mano, en dos lugares distintos:
// agregar el campo del 11A habría exigido acordarse de los dos, y olvidar uno
// deja un control que se pinta pero no se guarda.
export const CAMPOS = [
  { clave: 'visibilidadBio', etiqueta: 'Biografía' },
  { clave: 'visibilidadAboutMe', etiqueta: 'Sobre mí' },
  { clave: 'visibilidadAge', etiqueta: 'Edad' },
  { clave: 'visibilidadGender', etiqueta: 'Género' },
  // 11A. Este es el único campo cuyo NOMBRE no basta para entender qué se
  // publica, así que es el único con texto de ayuda. Dos cosas hay que decir y
  // ninguna se deduce de la etiqueta: que se muestra como rango y no como
  // número, y que se refiere a gente que llegó por tu enlace, no a mensajes
  // que mandaste. La primera redacción decía "A cuánta gente he invitado" y se
  // leía como un contador de invitaciones enviadas.
  {
    clave: 'visibilidadInvitaciones',
    etiqueta: 'Gente que llegó a WeedTown por mi enlace',
    ayuda: 'Se muestra como un rango («5+»), nunca el número exacto. Tú sí ves el número.'
  }
];

const OPCIONES = [
  { valor: 'TODOS', etiqueta: 'Cualquiera en WeedTown' },
  { valor: 'AMIGOS', etiqueta: 'Solo mis amistades' },
  { valor: 'NADIE', etiqueta: 'Nadie' }
];

const PrivacidadPerfil = ({ valores, onCambio }) => {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  // Solo se manda lo que cambió: `PUT /me` respeta los envíos parciales y deja
  // en paz lo que no viene.
  const guardar = async (parcial) => {
    setGuardando(true);
    setError('');
    try {
      const res = await api.put('/profile/me', parcial);
      onCambio(res.data.user);
    } catch (e) {
      setError(e.response?.data?.errors?.[0] || 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarCampo = (clave) => (e) => guardar({ [clave]: e.target.value });

  // Apagarlo es inmediato; encenderlo pasa por el aviso. La asimetría es a
  // propósito: reducir exposición nunca debería costar un clic extra.
  const cambiarPublico = (e) => {
    if (e.target.checked) setConfirmar(true);
    else guardar({ perfilPublico: false });
  };

  const confirmarPublico = () => {
    setConfirmar(false);
    guardar({ perfilPublico: true });
  };

  // Qué quedaría visible hacia afuera: solo lo que ya está en TODOS. Es la
  // regla de composición, dicha con los nombres que la persona reconoce en vez
  // de en abstracto.
  const haciaAfuera = CAMPOS.filter(c => valores[c.clave] === 'TODOS').map(c => c.etiqueta);

  return (
    <Box sx={{ mt: 4 }}>
      <Divider sx={{ mb: 3 }} />
      <Typography variant="h6" component="h2" gutterBottom>Quién ve qué</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tu handle, tu nombre y tu avatar los ve cualquiera: son tu identidad en la red.
        Lo demás lo decides tú. Tu correo, teléfono, nombre completo y fecha de nacimiento
        nunca se muestran a nadie.
      </Typography>

      <Stack spacing={2}>
        {CAMPOS.map(campo => (
          <TextField
            key={campo.clave}
            select
            size="small"
            label={campo.etiqueta}
            value={valores[campo.clave] || 'NADIE'}
            onChange={cambiarCampo(campo.clave)}
            disabled={guardando}
            fullWidth
            helperText={campo.ayuda}
          >
            {OPCIONES.map(o => <MenuItem key={o.valor} value={o.valor}>{o.etiqueta}</MenuItem>)}
          </TextField>
        ))}
      </Stack>

      <Divider sx={{ my: 3 }} />

      <FormControlLabel
        control={
          <Switch
            checked={Boolean(valores.perfilPublico)}
            onChange={cambiarPublico}
            disabled={guardando}
            inputProps={{ 'aria-label': 'Mostrar mi perfil fuera de WeedTown' }}
          />
        }
        label={
          <Stack direction="row" spacing={1} alignItems="center">
            <PublicIcon fontSize="small" color={valores.perfilPublico ? 'primary' : 'disabled'} />
            <Typography variant="body2">Mostrar mi perfil también fuera de WeedTown</Typography>
          </Stack>
        }
      />
      <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6 }}>
        {valores.perfilPublico
          ? 'Cualquiera con el enlace puede ver tu perfil, sin tener cuenta.'
          : 'Hoy tu perfil solo lo ve quien tenga cuenta en WeedTown.'}
      </Typography>

      {valores.perfilPublico && (
        <Box sx={{ ml: 6, mt: 1 }}>
          <Typography variant="caption" color="text.secondary">Visible desde afuera:</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" label="Handle, nombre y avatar" />
            {haciaAfuera.map(e => <Chip key={e} size="small" label={e} />)}
          </Stack>
          {haciaAfuera.length === 0 && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Nada más: todo lo que marcaste como “solo mis amistades” o “nadie” sigue oculto,
              porque fuera de la red no hay amistades.
            </Typography>
          )}
        </Box>
      )}

      {error && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{error}</Alert>}

      {/* El aviso es parte del entregable, no un adorno: tiene que ser honesto
          sobre qué queda visible, quién puede verlo, y qué NO deshace apagarlo. */}
      <Dialog open={confirmar} onClose={() => setConfirmar(false)} aria-labelledby="titulo-perfil-publico">
        <DialogTitle id="titulo-perfil-publico">Tu perfil saldría de WeedTown</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body2" paragraph>
              Cualquier persona podrá verlo <strong>sin tener cuenta</strong>, y los buscadores
              podrán encontrarlo e indexarlo.
            </Typography>
            <Typography variant="body2" component="div" paragraph>
              Quedaría visible:
              <ul style={{ margin: '8px 0' }}>
                <li>Tu handle, tu nombre y tu avatar</li>
                {haciaAfuera.map(e => <li key={e}>{e}</li>)}
                <li>Tus publicaciones públicas</li>
              </ul>
              Lo que marcaste como “solo mis amistades” o “nadie” <strong>no sale</strong>:
              fuera de la red no hay amistades.
            </Typography>
            <Typography variant="body2" color="warning.main">
              <strong>Apagarlo después no deshace todo.</strong> La ficha que se ve al pegar
              tu enlace deja de mostrar tus datos en menos de una hora, pero los buscadores
              tardan más en quitarlo, WhatsApp y las demás apps guardan su propia copia por
              días, y quien ya haya hecho una captura la conserva.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmar(false)}>Mejor no</Button>
          <Button onClick={confirmarPublico} variant="contained">Entiendo, hazlo público</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PrivacidadPerfil;
