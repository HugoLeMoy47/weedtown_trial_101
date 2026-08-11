import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Container, Box, Paper, Typography, TextField, IconButton, List, ListItemButton,
  ListItemAvatar, ListItemText, Avatar, Alert, Stack, InputAdornment, CircularProgress
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { io } from 'socket.io-client';
import Navbar from '../components/Navbar';
import ContentActions from '../components/ContentActions';
import api, { API_ORIGIN } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { mensajeCuarentena } from '../lib/cuarentena';
import { avisarChatAbierto, BOTTOM_DOCK_RESERVED_HEIGHT } from '../lib/mobileNav';
import { etiquetaDeDia, fechaCompleta } from '../lib/fechas';

const SOCKET_URL = API_ORIGIN;

const Chat = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null); // conversación activa (objeto)
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selected?.id ?? null;

  // Avisa a Navbar cuándo hay una conversación abierta, para que la barra
  // flotante se repliegue en móvil (Tarea 3 del ciclo 3 — ver mobileNav.js).
  useEffect(() => { avisarChatAbierto(Boolean(selected)); }, [selected]);
  useEffect(() => () => avisarChatAbierto(false), []); // al salir de /chat

  // Actualiza la lista de conversaciones con el último mensaje y la reordena
  const bumpConversation = useCallback((chatId, message) => {
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === chatId
          ? { ...c, lastMessage: { id: message.id, content: message.content, senderId: message.senderId, createdAt: message.createdAt } }
          : c
      );
      return updated.sort((a, b) => {
        const ta = new Date(a.lastMessage?.createdAt || a.createdAt).getTime();
        const tb = new Date(b.lastMessage?.createdAt || b.createdAt).getTime();
        return tb - ta;
      });
    });
  }, []);

  // Cargar conversaciones al entrar
  useEffect(() => {
    api.get('/chat/conversations')
      .then(res => setConversations(res.data.conversations || []))
      .catch(() => setError('No se pudieron cargar las conversaciones.'));
  }, []);

  // Si llegamos desde "Cerca" (u otra página) con un usuario, abrir su conversación directo
  const routedUser = location.state?.withUser;
  useEffect(() => {
    if (!routedUser?.id) return;
    api.post('/chat/conversations', { userId: routedUser.id })
      .then(res => {
        setConversations(prev => (prev.some(c => c.id === res.data.id) ? prev : [res.data, ...prev]));
        setSelected(res.data);
      })
      .catch(e => setError(mensajeCuarentena(e) || 'No se pudo abrir la conversación.'));
  }, [routedUser?.id]);

  // Socket autenticado: recibe mensajes en vivo de todas mis conversaciones
  useEffect(() => {
    const token = localStorage.getItem('weedtown_token');
    if (!token) return undefined;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('chat:message', ({ chatId, message }) => {
      // Mi propio POST ya pinta el mensaje; solo agrego los de otras personas
      if (chatId === selectedIdRef.current && message.senderId !== user?.id) {
        setMessages(prev => [...prev, message]);
      }
      bumpConversation(chatId, message);
    });
    return () => socket.disconnect();
  }, [user?.id, bumpConversation]);

  // Cargar hilo al seleccionar conversación
  useEffect(() => {
    if (!selected) return;
    setLoadingThread(true);
    setMessages([]);
    api.get(`/chat/conversations/${selected.id}/messages`)
      .then(res => setMessages(res.data.messages || []))
      .catch(() => setError('No se pudieron cargar los mensajes.'))
      .finally(() => setLoadingThread(false));
  }, [selected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Búsqueda de usuarios para abrir nueva conversación
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api.get('/chat/users', { params: { q } })
        .then(res => setSearchResults(res.data.users || []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const openConversation = async (otherUser) => {
    setError('');
    try {
      const res = await api.post('/chat/conversations', { userId: otherUser.id });
      setConversations(prev => (prev.some(c => c.id === res.data.id) ? prev : [res.data, ...prev]));
      setSelected(res.data);
      setSearch('');
      setSearchResults([]);
    } catch (e) {
      setError(mensajeCuarentena(e) || 'No se pudo abrir la conversación.');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || !selected) return;
    setInput('');
    try {
      const res = await api.post(`/chat/conversations/${selected.id}/messages`, { content });
      setMessages(prev => [...prev, res.data]);
      bumpConversation(selected.id, res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el mensaje.');
      setInput(content); // no perder lo escrito
    }
  };

  const title = (c) => c?.with?.displayName || c?.with?.name || 'Conversación';

  // Al bloquear, la conversación deja de existir para ambas partes: se quita de
  // la lista y se cierra el hilo abierto.
  const handleBlocked = () => {
    const chatId = selected?.id;
    setConversations(prev => prev.filter(c => c.id !== chatId));
    setSelected(null);
    setMessages([]);
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>Chat</Typography>
        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {/* Alto consciente del estado (Tarea 3): con la lista visible, la barra
            flotante sigue ahí abajo y hay que restarle su espacio; con una
            conversación abierta la barra se repliega (avisarChatAbierto) y
            ese espacio se le devuelve al hilo — nunca queda una franja fija
            reservada de más para una barra que no está. */}
        <Paper
          sx={{
            display: 'flex',
            height: {
              xs: selected ? 'calc(100dvh - 170px)' : `calc(100dvh - 170px - ${BOTTOM_DOCK_RESERVED_HEIGHT})`,
              sm: '70vh'
            },
            overflow: 'hidden'
          }}
        >
          {/* Columna izquierda: buscador + conversaciones (en móvil, solo cuando no hay hilo abierto) */}
          <Box
            sx={{
              width: { xs: '100%', sm: 264 },
              borderRight: { sm: 1 },
              borderColor: { sm: 'divider' },
              display: { xs: selected ? 'none' : 'flex', sm: 'flex' },
              flexDirection: 'column'
            }}
            component="aside"
            aria-label="Conversaciones"
          >
            <Box sx={{ p: 1.5, pb: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Buscar personas…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                  )
                }}
                inputProps={{ 'aria-label': 'Buscar personas para chatear' }}
              />
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {searchResults.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ px: 2, pt: 1 }} color="text.secondary">Personas</Typography>
                  <List dense disablePadding>
                    {searchResults.map(u => (
                      <ListItemButton key={u.id} onClick={() => openConversation(u)}>
                        <ListItemAvatar>
                          <Avatar src={u.avatar || undefined} sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                            {(u.displayName || u.name || '?').charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText primary={u.displayName || u.name} secondary={`@${u.handle}`} />
                      </ListItemButton>
                    ))}
                  </List>
                </>
              )}
              <Typography variant="subtitle2" sx={{ px: 2, pt: 1 }} color="text.secondary">Conversaciones</Typography>
              {conversations.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Aún no tienes conversaciones. Busca a alguien arriba para empezar 🌿
                </Typography>
              ) : (
                <List dense disablePadding>
                  {conversations.map(c => (
                    <ListItemButton key={c.id} selected={selected?.id === c.id} onClick={() => setSelected(c)}>
                      <ListItemAvatar>
                        <Avatar src={c.with?.avatar || undefined} sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                          {title(c).charAt(0).toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={title(c)}
                        secondary={c.lastMessage ? c.lastMessage.content : 'Sin mensajes aún'}
                        secondaryTypographyProps={{ noWrap: true }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </Box>

          {/* Columna derecha: hilo (en móvil, solo cuando hay conversación abierta) */}
          <Stack sx={{ flex: 1, display: { xs: selected ? 'flex' : 'none', sm: 'flex' } }}>
            {selected ? (
              <>
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton
                    onClick={() => setSelected(null)}
                    aria-label="Volver a la lista de conversaciones"
                    sx={{ display: { xs: 'inline-flex', sm: 'none' }, ml: -1 }}
                  >
                    <ArrowBackIcon />
                  </IconButton>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>{title(selected)}</Typography>
                  {selected.with?.id && <ContentActions user={selected.with} report={{ targetType: 'USER', targetId: selected.with.id }} onBlocked={handleBlocked} />}
                </Box>
                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }} aria-live="polite">
                  {loadingThread ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box>
                  ) : (
                    messages.map((msg, i) => {
                      const mine = msg.senderId === user?.id;
                      // Ciclo 13E. Dentro de una conversación la hora es lo que
                      // se lee, así que cada burbuja conserva su "14:32". Lo
                      // que faltaba era el DÍA: sin separadores, un "14:32" no
                      // distingue entre hoy y hace dos semanas, y en un chat
                      // con poca actividad —4 mensajes en la última semana—
                      // esa confusión es lo normal, no la excepción.
                      const anterior = messages[i - 1];
                      const cambiaDeDia = !anterior ||
                        new Date(anterior.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                      return (
                        <React.Fragment key={msg.id}>
                        {cambiaDeDia && (
                          <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.5 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              component="time"
                              dateTime={new Date(msg.createdAt).toISOString().slice(0, 10)}
                              title={fechaCompleta(msg.createdAt)}
                              sx={{ px: 1.5, py: 0.25, borderRadius: 4, bgcolor: 'action.hover' }}
                            >
                              {etiquetaDeDia(msg.createdAt)}
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', mb: 1 }}>
                          <Paper
                            elevation={0}
                            sx={{
                              px: 2, py: 1, maxWidth: '75%', borderRadius: 4,
                              bgcolor: mine ? 'primary.main' : 'action.hover',
                              color: mine ? 'primary.contrastText' : 'text.primary'
                            }}
                          >
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>
                              {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                          </Paper>
                        </Box>
                        </React.Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </Box>
              </>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                <Typography color="text.secondary" textAlign="center">
                  Elige una conversación o busca a alguien para empezar a platicar.
                </Typography>
              </Box>
            )}
            <Box component="form" onSubmit={sendMessage} sx={{ display: 'flex', gap: 1, p: 2, borderTop: 1, borderColor: 'divider' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Escribe un mensaje…"
                value={input}
                onChange={e => setInput(e.target.value)}
                inputProps={{ 'aria-label': 'Escribir mensaje', maxLength: 1000 }}
                disabled={!selected}
              />
              <IconButton type="submit" color="primary" aria-label="Enviar mensaje" disabled={!selected || !input.trim()}>
                <SendIcon />
              </IconButton>
            </Box>
          </Stack>
        </Paper>
      </Container>
    </>
  );
};

export default Chat;
