import React, { useState, useRef, useEffect } from 'react';
import { Stack, Chip, Tooltip } from '@mui/material';
import { usePrefiereMenosMovimiento, DURACION } from '../lib/movimiento';

// Set de reacciones cannábicas (HU-RC-001)
export const REACTIONS = [
  { type: 'LIKE', emoji: '👍', label: 'Me gusta', tip: 'Me gusta' },
  { type: 'ROLA', emoji: '🌿', label: 'Me rola', tip: 'Me rola — me vibra, me late, me identifica' },
  { type: 'INTERESA', emoji: '👀', label: 'Me interesa', tip: 'Me interesa — quiero saber más' },
  { type: 'MOLESTA', emoji: '😒', label: 'Me molesta', tip: 'Me molesta — no me late, me incomoda' }
];

export const EMPTY_COUNTS = { LIKE: 0, ROLA: 0, INTERESA: 0, MOLESTA: 0 };

// Calcula el estado optimista tras pulsar una reacción (mismo => quitar, otro => reemplazar)
export function applyReaction(counts, myReaction, type) {
  const next = { ...counts };
  if (myReaction === type) {
    next[type] = Math.max(0, next[type] - 1);
    return { counts: next, myReaction: null };
  }
  if (myReaction) next[myReaction] = Math.max(0, next[myReaction] - 1);
  next[type] = (next[type] || 0) + 1;
  return { counts: next, myReaction: type };
}

// Reaccionar es LA interacción más frecuente de la red, así que es donde una
// micro-respuesta rinde más — y también donde más rápido cansa si se pasa. El
// pulso es un solo `scale` con un rebote mínimo, 220 ms, y termina; no hay
// color que parpadee, ni emoji que gire, ni contador que salte.
//
// SOLO al ACTIVAR, nunca al quitar: retirar una reacción no es un logro, y
// festejarlo sería felicitar a alguien por arrepentirse.
//
// El pulso NO BLOQUEA NADA. El conteo ya se actualiza de forma optimista en
// quien llama (`applyReaction` corre antes del `await`, ver PostCard y
// CommentSection): esto es un estado visual aparte, encima de un número que
// ya cambió. Si el servidor tarda o falla, el conteo se corrige solo y el
// pulso ni se entera.
const ReactionBar = ({ reactions = EMPTY_COUNTS, myReaction = null, onReact, size = 'medium', disabled = false }) => {
  const menosMovimiento = usePrefiereMenosMovimiento();
  const [pulsando, setPulsando] = useState(null);
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const manejarClic = (type) => {
    // Primero la reacción, siempre. La animación va después y en su propia
    // línea: si algún día `onReact` tarda o truena, el pulso no puede ser lo
    // que impida que se registre.
    onReact(type);
    if (menosMovimiento || myReaction === type) return;
    clearTimeout(temporizador.current);
    setPulsando(type);
    temporizador.current = setTimeout(() => setPulsando(null), DURACION.pulso);
  };

  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }} role="group" aria-label="Reacciones">
      {REACTIONS.map(({ type, emoji, label, tip }) => {
        const active = myReaction === type;
        const count = reactions[type] || 0;
        return (
          <Tooltip key={type} title={tip}>
            <Chip
              label={`${emoji} ${count > 0 ? count : ''}`.trim()}
              size={size === 'small' ? 'small' : 'medium'}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={disabled ? undefined : () => manejarClic(type)}
              clickable={!disabled}
              aria-pressed={active}
              aria-label={`${label}${count > 0 ? `, ${count}` : ''}${active ? ' (tu reacción)' : ''}`}
              sx={{
                // Un solo efecto de escala, no dos. Antes convivían el
                // `:active` del dedo y —en la primera versión de este ciclo—
                // el pulso; encimados daban un doble brinco que se veía como
                // un error de la interfaz, no como una respuesta.
                transform: pulsando === type ? 'scale(1.18)' : 'scale(1)',
                // La curva se pasa un poco de 1 y regresa: es lo que hace que
                // se lea como "resorte" y no como "se infló". Solo `transform`
                // — nada que obligue a recalcular layout.
                transition: `transform ${DURACION.pulso}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
                '&:active': { transform: 'scale(1.12)' }
              }}
            />
          </Tooltip>
        );
      })}
    </Stack>
  );
};

export default ReactionBar;
