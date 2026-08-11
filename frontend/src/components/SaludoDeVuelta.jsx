import React, { useState } from 'react';
import { Stack, Button, Typography, Chip } from '@mui/material';
import WavingHandIcon from '@mui/icons-material/WavingHand';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { datosCuarentena } from '../lib/cuarentena';

// Cerrar el circuito del toque (ciclo 13D).
//
// EL DATO: 14 toques contra 4 mensajes de chat en 7 días. La comunidad eligió
// el gesto barato tres veces y media sobre la conversación — porque en una red
// donde casi nadie se conoce, un mensaje cuesta mucho socialmente y un toque no
// cuesta nada.
//
// El hueco era que el circuito no cerraba: te tocaban, y para contestar tenías
// que ir a la lista de Cerca, encontrar a la persona (si su celda no había
// cambiado) o escribirle — es decir, pagar justo el costo que estabas
// evitando. Aquí se contesta en un gesto.
//
// LO QUE NO SE PUEDE ROMPER, y conviene leerlo antes de agregarle nada: el
// toque funciona PORQUE no cuesta nada. En el momento en que se le pueda
// escribir algo, es mensajería y vuelve a costar lo que cuesta un mensaje.
// Sin campo de texto. Nunca.
const SaludoDeVuelta = ({ notificacion, onSaludado }) => {
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [espera, setEspera] = useState(null);
  const [mutuo, setMutuo] = useState(Boolean(notificacion.saludoMutuo));

  const persona = notificacion.actor;
  if (!persona?.id) return null;

  const saludar = async (e) => {
    e.stopPropagation(); // el <MenuItem> de arriba navega al hacer clic
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post('/nearby/poke/responder', { userId: persona.id });
      setMutuo(Boolean(data?.saludoMutuo));
      onSaludado?.(notificacion.id);
    } catch (err) {
      // Mismo criterio que el 13B: la cuarentena de cuentas nuevas dice CUÁNDO
      // se libera, no un error genérico. Aquí importa el doble — a quien acaba
      // de llegar la saludaron y no puede contestar; sin explicación parece
      // que el sitio está roto.
      const cuarentena = datosCuarentena(err);
      if (cuarentena) setEspera(cuarentena);
      else setError(err.response?.data?.error || 'No se pudo contestar.');
    } finally {
      setEnviando(false);
    }
  };

  const abrirChat = (e) => {
    e.stopPropagation();
    navigate('/chat', { state: { withUser: persona } });
  };

  if (espera) {
    return (
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        Tu cuenta es muy nueva para contestar todavía — vas a poder <strong>{espera.cuando}</strong>.
      </Typography>
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
      {mutuo ? (
        <>
          {/* Se saludaron los dos: AHORA sí ofrecer conversación. Antes de eso,
              empujar el chat es pedirle a alguien que se exponga sin señal de
              reciprocidad. Y es una OFERTA: ignorarla deja todo igual, no crea
              amistad ni abre nada. */}
          <Chip size="small" color="success" variant="outlined" label="Se saludaron 👋" />
          <Button size="small" startIcon={<ChatBubbleOutlineIcon />} onClick={abrirChat}>
            Escríbele
          </Button>
        </>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={<WavingHandIcon />}
          onClick={saludar}
          disabled={enviando}
        >
          {enviando ? 'Saludando…' : 'Saludar de vuelta'}
        </Button>
      )}
      {error && <Typography variant="caption" color="error">{error}</Typography>}
    </Stack>
  );
};

export default SaludoDeVuelta;
