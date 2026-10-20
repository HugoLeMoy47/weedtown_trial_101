import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Alert
} from '@mui/material';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import {
  decidirAvisoDeTerminos, tomarMarcaDeTerminos, posponerAvisoDeTerminos, avisoDeTerminosPospuesto
} from '../lib/terminos';

// Aviso de actualización de los Términos (ciclo 19.5), y registro silencioso de
// la aceptación hecha en la pantalla de acceso.
//
// DOS CASOS, decididos por `decidirAvisoDeTerminos`:
//   · Quien acaba de entrar marcando la casilla de ESTA versión: se registra sin
//     preguntarle nada. Ya aceptó; pedírselo otra vez sería ruido.
//   · Quien tiene una versión vieja o ninguna —las cuentas anteriores a este
//     ciclo no podían haber aceptado un texto que no existía—: un diálogo, una
//     vez por sesión.
//
// REGLAS, las mismas que PrimeraPregunta:
//   · «Más tarde» pesa lo mismo que «Acepto». Nada de «¿seguro?», nada de gris
//     chiquito. Es un aviso, no un muro: no bloquea nada, solo vuelve en la
//     siguiente sesión.
//   · Va FUERA de <Routes>: tiene que aparecer igual sin importar dónde caiga
//     la persona (un perfil de invitación, el feed, el chat).
const AvisoTerminos = () => {
  const { user, setUser } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // `tomarMarcaDeTerminos()` CONSUME la marca, y en desarrollo StrictMode monta
  // dos veces: sin esta guarda, la segunda pasada vería la marca ya consumida
  // y pediría lo que acaba de registrar. Una decisión por cuenta y sesión.
  const decididoPara = useRef(null);

  const registrar = async (version) => {
    const res = await api.post('/profile/me/terminos', { version });
    setUser(u => (u ? { ...u, terminosVersion: res.data.terminosVersion, terminosAceptadosEn: res.data.terminosAceptadosEn } : u));
  };

  useEffect(() => {
    if (!user?.id || decididoPara.current === user.id) return;
    decididoPara.current = user.id;
    const accion = decidirAvisoDeTerminos(user, tomarMarcaDeTerminos());
    if (accion === 'registrar') {
      // Si falla, no se molesta a nadie: en la siguiente sesión cae en 'avisar'.
      registrar(user.terminosVigentes).catch(() => {});
    } else if (accion === 'avisar' && !avisoDeTerminosPospuesto()) {
      setAbierto(true);
    }
  // `registrar` solo usa `setUser` y `api`, estables; la decisión es por cuenta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const aceptar = async () => {
    setGuardando(true);
    setError('');
    try {
      await registrar(user.terminosVigentes);
      setAbierto(false);
    } catch {
      setError('No se pudo registrar. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const masTarde = () => {
    posponerAvisoDeTerminos();
    setAbierto(false);
  };

  return (
    <Dialog open={abierto} onClose={masTarde} aria-labelledby="titulo-terminos" maxWidth="sm" fullWidth>
      <DialogTitle id="titulo-terminos">Actualizamos los Términos</DialogTitle>
      <DialogContent>
        <Typography variant="body2" paragraph>
          Actualizamos los Términos y la Política de Privacidad (versión {user?.terminosVigentes}). Lo nuevo,
          en una frase: para saber si la comunidad está viva, contamos cuántas personas usan WeedTown cada día.
          Guardamos <strong>solo la fecha del último día en que entraste</strong> —sin hora, sin páginas, sin
          lo que leíste— y esa fecha se sobrescribe cada día: no hay lista de tus visitas.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Puedes leerlos completos cuando quieras. Seguir usando WeedTown no se bloquea: si eliges
          «Más tarde», te lo volvemos a mostrar la próxima vez que entres.
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button component={RouterLink} to="/terms" target="_blank" rel="noopener" variant="outlined">
          Leer los Términos
        </Button>
        <Button onClick={masTarde} variant="outlined" disabled={guardando}>
          Más tarde
        </Button>
        <Button onClick={aceptar} variant="outlined" disabled={guardando}>
          Acepto
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AvisoTerminos;
