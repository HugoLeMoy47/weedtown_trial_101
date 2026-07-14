import React from 'react';
import { Stack, Chip, Tooltip } from '@mui/material';

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

const ReactionBar = ({ reactions = EMPTY_COUNTS, myReaction = null, onReact, size = 'medium', disabled = false }) => (
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
            onClick={disabled ? undefined : () => onReact(type)}
            clickable={!disabled}
            aria-pressed={active}
            aria-label={`${label}${count > 0 ? `, ${count}` : ''}${active ? ' (tu reacción)' : ''}`}
            sx={{
              transition: 'transform 0.15s ease',
              '&:active': { transform: 'scale(1.15)' }
            }}
          />
        </Tooltip>
      );
    })}
  </Stack>
);

export default ReactionBar;
