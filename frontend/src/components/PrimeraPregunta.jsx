import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography, Alert
} from '@mui/material';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { tomarPreguntaPendiente } from '../lib/altaNueva';

// UNA pregunta, una sola vez, justo después del alta (ciclo 13B).
//
// Reglas que no se negocian, y conviene leerlas antes de "mejorar" esta
// pantalla:
//
//   · OMITIR ES GRATIS. El botón de omitir tiene el mismo peso visual que el
//     de guardar. Nada de "¿seguro?", nada de gris chiquito abajo a la
//     izquierda. Si el patrón oscuro fuera aceptable aquí, lo sería en
//     cualquier otro lado de esta red.
//   · UN PASO. Si alguien se descubre diseñando el segundo, se salió del
//     alcance: el formulario de nueve campos sigue en /profile para quien lo
//     quiera.
//   · NO CAMBIA NINGÚN VALOR POR DEFECTO DE PRIVACIDAD. Escribir una bio no
//     abre el perfil: `perfilPublico` sigue siendo opt-in explícito, y sus 0
//     adopciones en producción son un dato, no un fallo que haya que corregir
//     empujando.
//
// Es un diálogo y no una ruta propia a propósito: quien llega por una
// invitación aterriza en el perfil de quien la invitó (ese destino lo maneja
// `tomarNextPendiente`), y mandarla antes a otra pantalla rompería el
// recorrido que el 11A construyó. Así la pregunta se pone encima y, al
// cerrarse, la persona está donde iba.
const LIMITE = 300;

const PrimeraPregunta = () => {
  const { user, setUser } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Igual que en PublicProfile: `tomarPreguntaPendiente()` CONSUME la marca, y
  // en desarrollo StrictMode monta dos veces. Sin esta guarda, la segunda
  // pasada leería `false` y el diálogo no aparecería nunca — un fallo que no
  // deja rastro en consola y que ya costó un ciclo en la Ola 3.
  const leida = useRef(false);

  useEffect(() => {
    if (leida.current || !user) return;
    leida.current = true;
    // Si la cuenta ya trae bio (por ejemplo, alguien que se dio de alta y
    // llenó su perfil antes de que esto existiera), no se pregunta.
    if (tomarPreguntaPendiente() && !user.bio) setAbierto(true);
  }, [user]);

  const cerrar = () => setAbierto(false);

  const guardar = async (e) => {
    e.preventDefault();
    const bio = texto.trim();
    if (!bio) return cerrar();
    setGuardando(true);
    setError('');
    try {
      // Se refresca la sesión con lo que responde el servidor, igual que
      // Profile.jsx: si no, el empujón de "Tu enlace" seguiría creyendo que la
      // bio está vacía hasta la siguiente recarga.
      const res = await api.put('/profile/me', { bio });
      setUser(res.data.user);
      cerrar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar. Puedes hacerlo después desde tu perfil.');
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) return null;

  return (
    <Dialog open onClose={cerrar} fullWidth maxWidth="sm" aria-labelledby="primera-pregunta-titulo">
      <form onSubmit={guardar}>
        <DialogTitle id="primera-pregunta-titulo">Preséntate en una línea</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Es lo que va a ver quien llegue a tu perfil o reciba tu solicitud de amistad.
            Puedes cambiarlo o borrarlo cuando quieras.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            value={texto}
            onChange={e => setTexto(e.target.value.slice(0, LIMITE))}
            label="Sobre ti"
            /* Un ejemplo concreto y no una consigna vaga: "cuéntanos de ti"
               produce campos vacíos, y una pregunta demasiado específica
               produce respuestas clonadas. Un ejemplo enseña el largo y el
               tono sin dictar el contenido. */
            placeholder="Cultivo en maceta desde 2021, en Guadalajara. Me gusta hablar de sustratos."
            helperText={`${texto.length}/${LIMITE} · opcional`}
            inputProps={{ maxLength: LIMITE }}
          />
          {error && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        {/* Los dos botones con el MISMO peso visual: ver la regla de arriba. */}
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={cerrar} variant="outlined" color="secondary" disabled={guardando}>
            Ahora no
          </Button>
          <Button type="submit" variant="contained" disabled={guardando || !texto.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default PrimeraPregunta;
