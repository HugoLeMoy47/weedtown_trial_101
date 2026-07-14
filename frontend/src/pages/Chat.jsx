import React, { useState, useEffect, useRef } from 'react';
import {
  Container, Box, Paper, Typography, TextField, IconButton, List, ListItemButton,
  ListItemAvatar, ListItemText, Avatar, Alert, Stack
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import Navbar from '../components/Navbar';
import api from '../services/api';
import io from 'socket.io-client';

const socket = io('http://localhost:4000', { autoConnect: false });

const Chat = () => {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get('/chat/contacts')
      .then(res => {
        if (Array.isArray(res.data)) {
          setContacts(res.data);
        } else if (res.data && Array.isArray(res.data.contacts)) {
          setContacts(res.data.contacts);
        } else {
          setContacts([]);
        }
      })
      .catch(() => setError('No se pudo cargar la lista de contactos.'));
  }, []);

  useEffect(() => {
    if (selected) {
      api.get(`/chat/messages/${selected}`)
        .then(res => setMessages(Array.isArray(res.data) ? res.data : []))
        .catch(() => setError('No se pudieron cargar los mensajes.'));
      socket.emit('join', selected);
    }
  }, [selected]);

  useEffect(() => {
    socket.on('message', msg => {
      setMessages(prev => [...prev, msg]);
    });
    return () => socket.off('message');
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (input.trim() && selected) {
      socket.emit('message', { to: selected, text: input });
      setMessages(prev => [...prev, { from: 'yo', text: input }]);
      setInput('');
    }
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>Chat</Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          El chat en tiempo real está en construcción — la mensajería se activará próximamente.
        </Alert>
        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper sx={{ display: 'flex', height: '65vh', overflow: 'hidden' }}>
          <Box sx={{ width: 220, borderRight: 1, borderColor: 'divider', overflowY: 'auto' }} component="aside" aria-label="Contactos">
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }} color="text.secondary">Contactos</Typography>
            <List dense disablePadding>
              {contacts.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>Sin contactos aún.</Typography>
              ) : (
                contacts.map(c => (
                  <ListItemButton key={c.id} selected={selected === c.id} onClick={() => setSelected(c.id)}>
                    <ListItemAvatar>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                        {(c.name || '?').charAt(0).toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={c.name} />
                  </ListItemButton>
                ))
              )}
            </List>
          </Box>

          <Stack sx={{ flex: 1 }}>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }} aria-live="polite">
              {messages.map((msg, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: msg.from === 'yo' ? 'flex-end' : 'flex-start', mb: 1 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      px: 2, py: 1, maxWidth: '75%', borderRadius: 4,
                      bgcolor: msg.from === 'yo' ? 'primary.main' : 'action.hover',
                      color: msg.from === 'yo' ? 'primary.contrastText' : 'text.primary'
                    }}
                  >
                    <Typography variant="body2">{msg.text}</Typography>
                  </Paper>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Box>
            <Box component="form" onSubmit={sendMessage} sx={{ display: 'flex', gap: 1, p: 2, borderTop: 1, borderColor: 'divider' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Escribe un mensaje…"
                value={input}
                onChange={e => setInput(e.target.value)}
                inputProps={{ 'aria-label': 'Escribir mensaje' }}
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
