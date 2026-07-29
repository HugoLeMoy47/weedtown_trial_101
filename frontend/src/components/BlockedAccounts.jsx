import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, Typography, List, ListItem, ListItemAvatar, ListItemText,
  Avatar, Button, CircularProgress, Box, Alert, Stack
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import api from '../services/api';

// Cuentas que bloqueé, con opción de desbloquear (HU-SEG-001).
// Solo aparecen los bloqueos propios: quien fue bloqueado no ve nada de esto.
const BlockedAccounts = () => {
  const [blocks, setBlocks] = useState(null); // null = cargando
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get('/blocks')
      .then(res => setBlocks(res.data.blocks))
      .catch(() => { setError('No se pudieron cargar tus bloqueos.'); setBlocks([]); });
  }, []);

  const unblock = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await api.delete(`/blocks/${id}`);
      setBlocks(prev => prev.filter(b => b.id !== id));
    } catch {
      setError('No se pudo desbloquear. Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <BlockIcon color="action" />
          <Typography variant="h6" component="h2">Cuentas bloqueadas</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mientras estén bloqueadas no pueden contactarte ni ver tu contenido, y tú tampoco el suyo.
        </Typography>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        {blocks === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }} role="status" aria-label="Cargando bloqueos">
            <CircularProgress size={28} />
          </Box>
        ) : blocks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No has bloqueado a nadie.
          </Typography>
        ) : (
          <List disablePadding>
            {blocks.map(b => {
              const name = b.displayName || b.name;
              return (
                <ListItem
                  key={b.id}
                  disableGutters
                  secondaryAction={
                    <Button size="small" onClick={() => unblock(b.id)} disabled={busyId === b.id}>
                      {busyId === b.id ? 'Quitando…' : 'Desbloquear'}
                    </Button>
                  }
                >
                  <ListItemAvatar>
                    <Avatar src={b.avatar || undefined} sx={{ bgcolor: 'text.disabled' }}>
                      {name.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={name} secondary={`@${b.handle}`} />
                </ListItem>
              );
            })}
          </List>
        )}
      </CardContent>
    </Card>
  );
};

export default BlockedAccounts;
