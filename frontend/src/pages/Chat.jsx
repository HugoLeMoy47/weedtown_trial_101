import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container, Box, Paper, Typography, TextField, IconButton, List, ListItemButton,
  ListItemAvatar, ListItemText, Avatar, Alert, Stack, InputAdornment, CircularProgress,
  Badge, Chip, Button
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import Navbar from '../components/Navbar';
import ContentActions from '../components/ContentActions';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../context/SocketContext';
import { mensajeCuarentena } from '../lib/cuarentena';
import { avisarChatAbierto, BOTTOM_DOCK_RESERVED_HEIGHT } from '../lib/mobileNav';
import { etiquetaDeDia, fechaCompleta, fechaConversacion } from '../lib/fechas';
import { rutaPerfil } from '../lib/rutaPerfil';

const EMOJIS_COMUNITARIOS = ['🌿', '💨', '🔥', '👍', '👋', '👀'];

const Chat = () => {
  const { user } = useAuth();
  const socketContext = useSocket();
  const socket = socketContext?.socket;
  const location = useLocation();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null); // conversación activa (objeto)
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [error, setError] = useState('');

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selected?.id ?? null;

  const prevScrollHeightRef = useRef(0);
  const isPaginatingRef = useRef(false);

  // Avisa a Navbar cuándo hay una conversación abierta, para que la barra
  // flotante se repliegue en móvil (Tarea 3 del ciclo 3 — ver mobileNav.js).
  useEffect(() => { avisarChatAbierto(Boolean(selected)); }, [selected]);
  useEffect(() => () => avisarChatAbierto(false), []); // al salir de /chat

  // Soporte de navegación atrás en móvil: cerrar chat sin salir de la página
  useEffect(() => {
    const handlePopState = () => {
      if (selectedIdRef.current) {
        setSelected(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Actualiza la lista de conversaciones con el último mensaje y la reordena
  const bumpConversation = useCallback((chatId, message, deltaUnread = 0) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== chatId) return c;
        const currentUnread = c.unreadCount || 0;
        const nextUnread = deltaUnread === 0 ? 0 : Math.max(0, currentUnread + deltaUnread);
        return {
          ...c,
          unreadCount: nextUnread,
          lastMessage: {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            createdAt: message.createdAt,
            readAt: message.readAt || null
          }
        };
      });
      return updated.sort((a, b) => {
        const ta = new Date(a.lastMessage?.createdAt || a.createdAt).getTime();
        const tb = new Date(b.lastMessage?.createdAt || b.createdAt).getTime();
        return tb - ta;
      });
    });
  }, []);

  // Cargar conversaciones al entrar
  const fetchConversations = useCallback(() => {
    api.get('/chat/conversations')
      .then(res => setConversations(res.data.conversations || []))
      .catch(() => setError('No se pudieron cargar las conversaciones.'));
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Si llegamos desde "Cerca", "Amigos" o una notificación con usuario o chatId
  const routedUser = location.state?.withUser;
  const routedChatId = location.state?.chatId;

  useEffect(() => {
    if (routedChatId && conversations.length > 0) {
      const encontrada = conversations.find(c => c.id === routedChatId);
      if (encontrada) {
        setSelected(encontrada);
        return;
      }
    }
    if (!routedUser?.id) return;
    api.post('/chat/conversations', { userId: routedUser.id })
      .then(res => {
        setConversations(prev => (prev.some(c => c.id === res.data.id) ? prev : [res.data, ...prev]));
        setSelected(res.data);
      })
      .catch(e => setError(mensajeCuarentena(e) || 'No se pudo abrir la conversación.'));
  }, [routedUser?.id, routedChatId, conversations]);

  const targetUserId = selected?.with?.id;
  // Consulta y actualización de presencia en tiempo real del interlocutor
  const consultarPresencia = useCallback(() => {
    if (!socket || !targetUserId) {
      setIsOtherOnline(false);
      return;
    }
    socket.emit('chat:query_presence', { targetUserId }, (res) => {
      if (res && typeof res.isOnline === 'boolean') {
        setIsOtherOnline(res.isOnline);
      }
    });
  }, [socket, targetUserId]);

  useEffect(() => {
    consultarPresencia();
    const interval = setInterval(consultarPresencia, 15000);
    return () => clearInterval(interval);
  }, [consultarPresencia]);

  // Marcar conversación activa como leída tanto en cliente como en backend
  const marcarComoLeida = useCallback((chatId) => {
    if (!chatId) return;
    api.post(`/chat/conversations/${chatId}/read`)
      .then(() => {
        setConversations(prev => prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
      })
      .catch(() => {});
  }, []);

  // Socket: escucha mensajes en vivo, lectura (visto) y sincronización multi-pestaña
  useEffect(() => {
    if (!socket) return undefined;

    const handleChatMessage = ({ chatId, message }) => {
      const esChatAbierto = chatId === selectedIdRef.current;
      const esMio = message.senderId === user?.id;

      if (esChatAbierto) {
        setMessages(prev => {
          // Si ya existe (ej. mensaje optimista propio confirmado), reemplazarlo
          if (prev.some(m => m.id === message.id || (m._pending && m.content === message.content && esMio))) {
            return prev.map(m => (m.id === message.id || (m._pending && m.content === message.content && esMio)) ? message : m);
          }
          return [...prev, message];
        });

        // Si es de la otra persona y tenemos el chat abierto, marcar como leído de inmediato
        if (!esMio) {
          marcarComoLeida(chatId);
          // Verificar si el usuario estaba cerca del fondo
          const el = messagesContainerRef.current;
          if (el) {
            const cercaDelFondo = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            if (!cercaDelFondo) {
              setHasNewBelow(true);
            }
          }
        }
      }

      // Si no es el chat abierto y es de otra persona, sube el contador de no leídos
      const delta = (esChatAbierto || esMio) ? 0 : 1;
      bumpConversation(chatId, message, delta);
    };

    const handleChatRead = ({ chatId, readerId, readAt }) => {
      // Actualizar marcas de lectura en el hilo abierto si el lector fue el otro
      if (chatId === selectedIdRef.current) {
        if (readerId !== user?.id) {
          setMessages(prev => prev.map(m => m.senderId === user?.id && !m.readAt ? { ...m, readAt } : m));
        }
      }
      // Actualizar estado en la lista lateral
      setConversations(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        const unread = readerId === user?.id ? 0 : c.unreadCount;
        const lastMsg = c.lastMessage ? { ...c.lastMessage, readAt: (c.lastMessage.senderId === user?.id && readerId !== user?.id) ? readAt : c.lastMessage.readAt } : null;
        return { ...c, unreadCount: unread, lastMessage: lastMsg };
      }));
    };

    socket.on('chat:message', handleChatMessage);
    socket.on('chat:read', handleChatRead);

    return () => {
      socket.off('chat:message', handleChatMessage);
      socket.off('chat:read', handleChatRead);
    };
  }, [socket, user?.id, bumpConversation, marcarComoLeida]);

  // Cargar hilo al seleccionar conversación
  useEffect(() => {
    if (!selected) return;
    setLoadingThread(true);
    setMessages([]);
    setHasMore(false);
    setHasNewBelow(false);

    // Guardar estado en el historial del navegador para soporte del botón atrás
    window.history.pushState({ chatOpen: true, chatId: selected.id }, '');

    api.get(`/chat/conversations/${selected.id}/messages`)
      .then(res => {
        setMessages(res.data.messages || []);
        setHasMore(Boolean(res.data.hasMore));
        marcarComoLeida(selected.id);
      })
      .catch(() => setError('No se pudieron cargar los mensajes.'))
      .finally(() => setLoadingThread(false));
  }, [selected, marcarComoLeida]);

  // Paginación hacia arriba (mensajes anteriores) sin saltos de scroll
  const cargarAnteriores = async () => {
    if (!selected || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);

    const el = messagesContainerRef.current;
    if (el) {
      prevScrollHeightRef.current = el.scrollHeight;
      isPaginatingRef.current = true;
    }

    try {
      const primerId = messages[0].id;
      const res = await api.get(`/chat/conversations/${selected.id}/messages`, {
        params: { before: primerId }
      });
      const anteriores = res.data.messages || [];
      setMessages(prev => [...anteriores, ...prev]);
      setHasMore(Boolean(res.data.hasMore));
    } catch {
      setError('No se pudieron cargar mensajes anteriores.');
    } finally {
      setLoadingMore(false);
    }
  };

  // Mantener la posición exacta de lectura tras paginar
  useLayoutEffect(() => {
    if (isPaginatingRef.current && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop = el.scrollTop + diff;
      isPaginatingRef.current = false;
    }
  }, [messages]);

  // Auto-scroll al fondo inteligente
  useEffect(() => {
    if (isPaginatingRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    // Si es mensaje propio o estamos cerca del fondo, scrollear abajo
    const ultimo = messages[messages.length - 1];
    const esMio = ultimo?.senderId === user?.id;
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 160;

    if (esMio || cerca) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setHasNewBelow(false);
    }
  }, [messages, user?.id]);

  const irAlFondo = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasNewBelow(false);
  };

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

  // Envío optimista de mensajes
  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    const content = input.trim();
    if (!content || !selected) return;

    // Mensaje optimista local
    const tempId = `temp-${Date.now()}`;
    const optimista = {
      id: tempId,
      content,
      senderId: user?.id,
      createdAt: new Date().toISOString(),
      readAt: null,
      _pending: true,
      sender: { id: user?.id, name: user?.name, avatar: user?.avatar }
    };

    setInput('');
    setMessages(prev => [...prev, optimista]);
    bumpConversation(selected.id, optimista);

    try {
      const res = await api.post(`/chat/conversations/${selected.id}/messages`, { content });
      setMessages(prev => prev.map(m => m.id === tempId ? res.data : m));
      bumpConversation(selected.id, res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el mensaje.');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInput(content); // No perder el texto si falló
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // En pantalla táctil/móvil se permite salto de línea libre con Enter
      const esMovil = window.matchMedia('(max-width: 600px)').matches;
      if (!esMovil) {
        e.preventDefault();
        sendMessage();
      }
    }
  };

  const insertarEmoji = (emoji) => {
    setInput(prev => prev + emoji);
  };

  const title = (c) => c?.with?.displayName || c?.with?.name || 'Conversación';

  const handleBlocked = () => {
    const chatId = selected?.id;
    setConversations(prev => prev.filter(c => c.id !== chatId));
    setSelected(null);
    setMessages([]);
  };

  const handleBackToList = () => {
    setSelected(null);
    setMessages([]);
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: { xs: 1.5, sm: 3 } }}>
        <Typography variant="h5" component="h1" gutterBottom sx={{ display: { xs: selected ? 'none' : 'block', sm: 'block' } }}>
          Chat
        </Typography>
        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Paper
          sx={{
            display: 'flex',
            height: {
              xs: selected ? 'calc(100dvh - 110px)' : `calc(100dvh - 160px - ${BOTTOM_DOCK_RESERVED_HEIGHT})`,
              sm: '72vh'
            },
            overflow: 'hidden',
            borderRadius: 2
          }}
        >
          {/* Columna izquierda: buscador + conversaciones */}
          <Box
            sx={{
              width: { xs: '100%', sm: 280 },
              borderRight: { sm: 1 },
              borderColor: { sm: 'divider' },
              display: { xs: selected ? 'none' : 'flex', sm: 'flex' },
              flexDirection: 'column',
              bgcolor: 'background.paper'
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
                          <Avatar src={u.avatar || undefined} sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>
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
                  Aún no tienes conversaciones. Busca a alguien arriba para empezar a platicar 🌿
                </Typography>
              ) : (
                <List dense disablePadding>
                  {conversations.map(c => {
                    const esMio = c.lastMessage?.senderId === user?.id;
                    const prefijo = esMio ? 'Tú: ' : '';
                    const timeStamp = c.lastMessage?.createdAt ? fechaConversacion(c.lastMessage.createdAt) : '';
                    const tieneNoLeidos = (c.unreadCount || 0) > 0;

                    return (
                      <ListItemButton
                        key={c.id}
                        selected={selected?.id === c.id}
                        onClick={() => setSelected(c)}
                        sx={{
                          borderLeft: tieneNoLeidos ? 4 : 0,
                          borderLeftColor: 'primary.main',
                          py: 1.2
                        }}
                      >
                        <ListItemAvatar>
                          <Badge
                            badgeContent={c.unreadCount}
                            color="primary"
                            invisible={!tieneNoLeidos}
                            sx={{ '& .MuiBadge-badge': { fontWeight: 700, fontSize: 11 } }}
                          >
                            <Avatar src={c.with?.avatar || undefined} sx={{ width: 38, height: 38, bgcolor: 'primary.main' }}>
                              {title(c).charAt(0).toUpperCase()}
                            </Avatar>
                          </Badge>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: tieneNoLeidos ? 700 : 500, noWrap: true }}>
                                {title(c)}
                              </Typography>
                              {timeStamp && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, ml: 1 }}>
                                  {timeStamp}
                                </Typography>
                              )}
                            </Box>
                          }
                          secondary={
                            <Typography
                              variant="body2"
                              color={tieneNoLeidos ? 'text.primary' : 'text.secondary'}
                              sx={{
                                fontWeight: tieneNoLeidos ? 600 : 400,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontSize: 13
                              }}
                            >
                              {c.lastMessage ? `${prefijo}${c.lastMessage.content}` : 'Sin mensajes aún'}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              )}
            </Box>
          </Box>

          {/* Columna derecha: hilo abierto */}
          <Stack sx={{ flex: 1, display: { xs: selected ? 'flex' : 'none', sm: 'flex' }, bgcolor: 'background.default', position: 'relative' }}>
            {selected ? (
              <>
                {/* Cabecera del chat con perfil navegable y presencia en línea */}
                <Box
                  sx={{
                    px: 2, py: 1.2,
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    bgcolor: 'background.paper',
                    zIndex: 2
                  }}
                >
                  <IconButton
                    onClick={handleBackToList}
                    aria-label="Volver a la lista de conversaciones"
                    sx={{ display: { xs: 'inline-flex', sm: 'none' }, ml: -1 }}
                  >
                    <ArrowBackIcon />
                  </IconButton>

                  <Avatar
                    src={selected.with?.avatar || undefined}
                    sx={{ width: 36, height: 36, bgcolor: 'primary.main', cursor: 'pointer' }}
                    onClick={() => {
                      const url = rutaPerfil(selected.with);
                      if (url) navigate(url);
                    }}
                  >
                    {title(selected).charAt(0).toUpperCase()}
                  </Avatar>

                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      fontWeight={700}
                      component={selected.with?.handle ? RouterLink : 'div'}
                      to={selected.with?.handle ? `/@${selected.with.handle}` : undefined}
                      sx={{
                        color: 'text.primary',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: selected.with?.handle ? 'underline' : 'none' },
                        display: 'block',
                        lineHeight: 1.2,
                        noWrap: true
                      }}
                    >
                      {title(selected)}
                    </Typography>

                    <Stack direction="row" alignItems="center" spacing={0.6}>
                      {isOtherOnline ? (
                        <>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                          <Typography variant="caption" color="success.main" fontWeight={600} sx={{ fontSize: 11 }}>
                            En línea
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                          {selected.with?.handle ? `@${selected.with.handle}` : 'Miembro de la comunidad'}
                        </Typography>
                      )}
                    </Stack>
                  </Box>

                  {selected.with?.id && (
                    <ContentActions
                      user={selected.with}
                      report={{ targetType: 'USER', targetId: selected.with.id }}
                      onBlocked={handleBlocked}
                    />
                  )}
                </Box>

                {/* Contenedor de mensajes con scroll */}
                <Box
                  ref={messagesContainerRef}
                  sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}
                  aria-live="polite"
                >
                  {/* Botón para cargar mensajes anteriores */}
                  {hasMore && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={loadingMore}
                        onClick={cargarAnteriores}
                        sx={{ borderRadius: 4, textTransform: 'none', fontSize: 12 }}
                      >
                        {loadingMore ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                        Cargar mensajes anteriores
                      </Button>
                    </Box>
                  )}

                  {loadingThread ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={28} /></Box>
                  ) : messages.length === 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', my: 'auto', p: 3, opacity: 0.8 }}>
                      <Typography variant="h6" sx={{ fontSize: 24, mb: 0.5 }}>🌿</Typography>
                      <Typography variant="subtitle2" textAlign="center" fontWeight={600}>
                        Comienza la conversación con {title(selected)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ maxWidth: 300, mt: 0.5 }}>
                        Espacio seguro, con privacidad y respeto mutuo. Saluda o cuéntale qué estás rolando hoy.
                      </Typography>
                    </Box>
                  ) : (
                    messages.map((msg, i) => {
                      const mine = msg.senderId === user?.id;
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
                                sx={{
                                  px: 1.5, py: 0.25, borderRadius: 4,
                                  bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                  fontSize: 11, fontWeight: 500
                                }}
                              >
                                {etiquetaDeDia(msg.createdAt)}
                              </Typography>
                            </Box>
                          )}

                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: mine ? 'flex-end' : 'flex-start',
                              mb: 1,
                              opacity: msg._pending ? 0.65 : 1,
                              transition: 'opacity 0.2s ease'
                            }}
                          >
                            <Paper
                              elevation={mine ? 1 : 0}
                              sx={{
                                px: 2, py: 1,
                                maxWidth: { xs: '85%', sm: '75%' },
                                borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                bgcolor: mine ? 'primary.main' : (theme) => theme.palette.mode === 'dark' ? 'background.paper' : '#f0f2f5',
                                border: mine ? 'none' : '1px solid',
                                borderColor: 'divider',
                                color: mine ? 'primary.contrastText' : 'text.primary',
                                boxShadow: mine ? '0 1px 2px rgba(0,0,0,0.15)' : 'none'
                              }}
                            >
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14 }}>
                                {msg.content}
                              </Typography>

                              <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="flex-end"
                                spacing={0.3}
                                sx={{ mt: 0.3, opacity: 0.8 }}
                              >
                                <Typography variant="caption" sx={{ fontSize: 11 }}>
                                  {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                </Typography>

                                {mine && (
                                  msg._pending ? (
                                    <AccessTimeIcon sx={{ fontSize: 13, ml: 0.3 }} />
                                  ) : msg.readAt ? (
                                    <DoneAllIcon
                                      sx={{ fontSize: 14, ml: 0.3, color: '#69f0ae' }}
                                      titleAccess="Leído"
                                    />
                                  ) : (
                                    <DoneIcon
                                      sx={{ fontSize: 13, ml: 0.3 }}
                                      titleAccess="Enviado"
                                    />
                                  )
                                )}
                              </Stack>
                            </Paper>
                          </Box>
                        </React.Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </Box>

                {/* Pastilla flotante si hay mensajes nuevos abajo */}
                {hasNewBelow && (
                  <Box sx={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                    <Chip
                      icon={<KeyboardArrowDownIcon />}
                      label="Nuevos mensajes"
                      color="primary"
                      onClick={irAlFondo}
                      sx={{ cursor: 'pointer', boxShadow: 3, fontWeight: 600 }}
                    />
                  </Box>
                )}

                {/* Barra rápida de emojis comunitarios */}
                <Box
                  sx={{
                    px: 2, pt: 0.5, pb: 0.5,
                    display: 'flex', gap: 0.8,
                    bgcolor: 'background.paper',
                    borderTop: 1, borderColor: 'divider'
                  }}
                >
                  {EMOJIS_COMUNITARIOS.map(emoji => (
                    <IconButton
                      key={emoji}
                      size="small"
                      onClick={() => insertarEmoji(emoji)}
                      sx={{ fontSize: 16, p: 0.5 }}
                      aria-label={`Insertar emoji ${emoji}`}
                    >
                      {emoji}
                    </IconButton>
                  ))}

                  {/* Contador de caracteres preventivo: aparece sólo al superar 800 */}
                  {input.length >= 800 && (
                    <Typography
                      variant="caption"
                      sx={{
                        ml: 'auto',
                        alignSelf: 'center',
                        fontWeight: 700,
                        fontSize: 11,
                        color: input.length >= 950 ? 'error.main' : 'warning.main'
                      }}
                    >
                      {1000 - input.length} caracteres
                    </Typography>
                  )}
                </Box>

                {/* Input de composición multiline auto-expandible */}
                <Box
                  component="form"
                  onSubmit={sendMessage}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 1,
                    p: 1.5,
                    bgcolor: 'background.paper'
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    minRows={1}
                    maxRows={5}
                    placeholder="Escribe un mensaje… (Enter para enviar)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    inputProps={{ 'aria-label': 'Escribir mensaje', maxLength: 1000 }}
                    disabled={!selected}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                        py: 1
                      }
                    }}
                  />
                  <IconButton
                    type="submit"
                    color="primary"
                    aria-label="Enviar mensaje"
                    disabled={!selected || !input.trim()}
                    sx={{
                      bgcolor: input.trim() ? 'primary.main' : 'action.disabledBackground',
                      color: input.trim() ? 'primary.contrastText' : 'action.disabled',
                      p: 1,
                      '&:hover': {
                        bgcolor: input.trim() ? 'primary.dark' : 'action.disabledBackground'
                      }
                    }}
                  >
                    <SendIcon fontSize="small" />
                  </IconButton>
                </Box>
              </>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, opacity: 0.7 }}>
                <Typography variant="h4" sx={{ mb: 1 }}>💬</Typography>
                <Typography variant="subtitle1" fontWeight={600} textAlign="center">
                  Tus conversaciones en WeedTown
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 320, mt: 0.5 }}>
                  Elige una conversación de la izquierda o busca a alguien de la comunidad para platicar.
                </Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      </Container>
    </>
  );
};

export default Chat;
