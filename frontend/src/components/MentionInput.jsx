import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, TextField, Paper, List, ListItemButton, ListItemAvatar, Avatar,
  ListItemText, Typography, Chip, ClickAwayListener
} from '@mui/material';
import api from '../services/api';

/**
 * Detecta si el cursor está sobre un token de mención (@handle).
 * @param {string} texto
 * @param {number} cursorPos
 */
export function detectarMencion(texto, cursorPos) {
  if (!texto || cursorPos === undefined || cursorPos === null) {
    return { activo: false, query: '', inicio: 0, fin: 0 };
  }
  const pos = Math.min(cursorPos, texto.length);
  const antes = texto.slice(0, pos);

  const match = /(?:^|\s)@([a-z0-9_]*)$/i.exec(antes);
  if (!match) {
    return { activo: false, query: '', inicio: 0, fin: 0 };
  }

  const query = match[1];
  const arrobaOffset = match[0].indexOf('@');
  const inicio = match.index + arrobaOffset;

  const despues = texto.slice(pos);
  const finMatch = /^[a-z0-9_]*/i.exec(despues);
  const fin = pos + (finMatch ? finMatch[0].length : 0);

  return {
    activo: query.length >= 1,
    query,
    inicio,
    fin
  };
}

const MentionInput = ({
  value = '',
  onChange,
  label,
  placeholder,
  minRows = 3,
  maxRows,
  multiline = true,
  required = false,
  disabled = false,
  autoFocus = false,
  fullWidth = true,
  size,
  inputProps = {},
  sx = {}
}) => {
  const inputRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionState, setMentionState] = useState({ activo: false, query: '', inicio: 0, fin: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  const checkMention = useCallback((texto, pos) => {
    const estado = detectarMencion(texto, pos);
    setMentionState(estado);
    if (!estado.activo) {
      setSuggestions([]);
      setMenuOpen(false);
    }
  }, []);

  // Debounce de búsqueda de sugerencias
  useEffect(() => {
    if (!mentionState.activo || mentionState.query.length < 1) {
      setSuggestions([]);
      setMenuOpen(false);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(() => {
      api.get(`/profile/mention-suggestions?q=${encodeURIComponent(mentionState.query)}`)
        .then(res => {
          if (!cancelado) {
            const list = res.data.suggestions || [];
            setSuggestions(list);
            setSelectedIndex(0);
            setMenuOpen(list.length > 0);
          }
        })
        .catch(() => {
          if (!cancelado) {
            setSuggestions([]);
            setMenuOpen(false);
          }
        });
    }, 180);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [mentionState.activo, mentionState.query]);

  const aplicarSugerencia = (sugerencia) => {
    if (!sugerencia || !sugerencia.handle) return;
    const textoActual = value || '';
    const { inicio, fin } = mentionState;

    const reemplazo = `@${sugerencia.handle} `;
    const nuevoTexto = textoActual.slice(0, inicio) + reemplazo + textoActual.slice(fin);

    onChange?.({ target: { value: nuevoTexto } });
    setMenuOpen(false);
    setSuggestions([]);
    setMentionState({ activo: false, query: '', inicio: 0, fin: 0 });

    // Reposicionar cursor tras el autocompletado
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nuevaPos = inicio + reemplazo.length;
        inputRef.current.setSelectionRange(nuevaPos, nuevaPos);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!menuOpen || !suggestions.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[selectedIndex]) {
        e.preventDefault();
        aplicarSugerencia(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setMenuOpen(false);
    }
  };

  const handleTextChange = (e) => {
    onChange?.(e);
    checkMention(e.target.value, e.target.selectionStart);
  };

  const handleCursorMove = (e) => {
    checkMention(e.target.value, e.target.selectionStart);
  };

  return (
    <ClickAwayListener onClickAway={() => setMenuOpen(false)}>
      <Box sx={{ position: 'relative', width: fullWidth ? '100%' : 'auto' }}>
        <TextField
          inputRef={inputRef}
          value={value}
          onChange={handleTextChange}
          onKeyUp={handleCursorMove}
          onClick={handleCursorMove}
          onKeyDown={handleKeyDown}
          label={label}
          placeholder={placeholder}
          minRows={minRows}
          maxRows={maxRows}
          multiline={multiline}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          fullWidth={fullWidth}
          size={size}
          inputProps={inputProps}
          sx={sx}
        />

        {menuOpen && suggestions.length > 0 && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1400,
              mt: 0.5,
              maxHeight: 240,
              overflowY: 'auto',
              borderRadius: 2,
              border: 1,
              borderColor: 'divider'
            }}
          >
            <List dense disablePadding>
              {suggestions.map((s, idx) => {
                const nombre = s.displayName || s.name || s.handle;
                const isSelected = idx === selectedIndex;
                return (
                  <ListItemButton
                    key={s.id}
                    selected={isSelected}
                    onClick={() => aplicarSugerencia(s)}
                    sx={{
                      py: 0.75,
                      px: 1.5,
                      '&.Mui-selected': { bgcolor: 'action.selected' }
                    }}
                  >
                    <ListItemAvatar sx={{ minWidth: 36 }}>
                      <Avatar
                        src={s.avatar || undefined}
                        alt={nombre}
                        sx={{ width: 26, height: 26, fontSize: 12, bgcolor: 'primary.main' }}
                      >
                        {(nombre || '?').charAt(0).toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {nombre}
                          </Typography>
                          {s.isFriend && (
                            <Chip size="small" label="Amigo ✓" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          @{s.handle}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Paper>
        )}
      </Box>
    </ClickAwayListener>
  );
};

export default MentionInput;
