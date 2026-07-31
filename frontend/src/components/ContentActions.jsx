import React, { useState } from 'react';
import {
  IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Button, Alert, TextField, Stack
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import BlockIcon from '@mui/icons-material/Block';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import ShareIcon from '@mui/icons-material/Share';
import api from '../services/api';

// Menú ⋮ sobre el contenido de otras personas: Reportar y Bloquear.
//
// Van juntos a propósito: son las dos respuestas ante algo que te incomoda, y
// resuelven cosas distintas. Bloquear es personal e inmediato — deja de verlo.
// Reportar es para la comunidad — lo revisa el equipo de moderación. La persona
// puede hacer las dos, y el diálogo de reporte ofrece bloquear al terminar.
const MOTIVOS = [
  { valor: 'ACOSO', texto: 'Acoso o ataque personal' },
  { valor: 'ODIO', texto: 'Discurso de odio o discriminación' },
  { valor: 'SPAM', texto: 'Spam o publicación repetitiva' },
  { valor: 'ILEGAL', texto: 'Actividad ilegal (incluida la venta de sustancias)' },
  { valor: 'DESINFORMACION', texto: 'Desinformación que pone en riesgo la salud' },
  { valor: 'SEXUAL', texto: 'Contenido sexual no solicitado' },
  { valor: 'SUPLANTACION', texto: 'Suplantación de identidad' },
  { valor: 'OTRO', texto: 'Otro motivo' }
];

const ContentActions = ({ user, report, onBlocked, onReported, onShare, size = 'small' }) => {
  const [anchor, setAnchor] = useState(null);
  const [confirmandoBloqueo, setConfirmandoBloqueo] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nombre = user?.displayName || user?.name || 'esta persona';
  const cerrar = () => setAnchor(null);

  const bloquear = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/blocks', { userId: user.id });
      setConfirmandoBloqueo(false);
      setReportando(false);
      onBlocked?.(user.id);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo bloquear. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const enviarReporte = async () => {
    if (!motivo) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/reports', {
        targetType: report.targetType,
        targetId: report.targetId,
        reason: motivo,
        detail: detalle
      });
      setEnviado(true);
      onReported?.();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo enviar el reporte. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const cerrarReporte = () => {
    setReportando(false);
    setEnviado(false);
    setMotivo('');
    setDetalle('');
    setError('');
  };

  if (!user?.id) return null;

  return (
    <>
      <IconButton
        size={size}
        onClick={e => setAnchor(e.currentTarget)}
        aria-label={`Opciones sobre ${nombre}`}
        aria-haspopup="menu"
      >
        <MoreVertIcon fontSize={size} />
      </IconButton>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={cerrar}>
        {onShare && (
          <MenuItem onClick={() => { cerrar(); onShare(); }}>
            <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Compartir enlace</ListItemText>
          </MenuItem>
        )}
        {report && (
          <MenuItem onClick={() => { cerrar(); setError(''); setReportando(true); }}>
            <ListItemIcon><FlagOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Reportar</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { cerrar(); setError(''); setConfirmandoBloqueo(true); }}>
          <ListItemIcon><BlockIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Bloquear a {nombre}</ListItemText>
        </MenuItem>
      </Menu>

      {/* --- Reportar --- */}
      <Dialog open={reportando} onClose={() => !busy && cerrarReporte()} fullWidth maxWidth="sm"
        aria-labelledby="report-title">
        <DialogTitle id="report-title">{enviado ? 'Reporte enviado' : 'Reportar contenido'}</DialogTitle>
        <DialogContent>
          {enviado ? (
            <DialogContentText component="div">
              Gracias. El equipo de moderación lo revisará. <strong>Nunca le decimos a nadie quién
              reportó.</strong>
              <br /><br />
              Si además no quieres volver a ver a {nombre}, puedes bloquearla — es inmediato y no depende de
              esta revisión.
            </DialogContentText>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <DialogContentText>
                Cuéntanos qué pasa. Solo lo ve el equipo de moderación, y quien publicó nunca sabrá que fuiste tú.
              </DialogContentText>
              <TextField
                select
                label="Motivo"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                required
                fullWidth
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
              >
                <option value="" disabled>Elige un motivo…</option>
                {MOTIVOS.map(m => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </TextField>
              <TextField
                label="Detalle (opcional)"
                value={detalle}
                onChange={e => setDetalle(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                inputProps={{ maxLength: 500 }}
                helperText={`${detalle.length}/500 — ayuda a entender el contexto`}
              />
              {error && <Alert severity="error" role="alert">{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {enviado ? (
            <>
              <Button onClick={cerrarReporte} color="secondary">Cerrar</Button>
              <Button onClick={() => { setReportando(false); setConfirmandoBloqueo(true); }} color="error">
                Bloquear también
              </Button>
            </>
          ) : (
            <>
              <Button onClick={cerrarReporte} color="secondary" disabled={busy}>Cancelar</Button>
              <Button onClick={enviarReporte} variant="contained" disabled={busy || !motivo}>
                {busy ? 'Enviando…' : 'Enviar reporte'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* --- Bloquear --- */}
      <Dialog open={confirmandoBloqueo} onClose={() => !busy && setConfirmandoBloqueo(false)}
        aria-labelledby="confirm-block-title">
        <DialogTitle id="confirm-block-title">¿Bloquear a {nombre}?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            A partir de ahora:
            <ul style={{ margin: '12px 0', paddingLeft: 20 }}>
              <li>No podrá escribirte, mandarte toques ni responderte.</li>
              <li>Su contenido desaparece de tu feed, foros y de Cerca — y el tuyo del suyo.</li>
              <li>No se le avisa del bloqueo.</li>
            </ul>
            Puedes deshacerlo cuando quieras desde tu perfil.
          </DialogContentText>
          {error && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoBloqueo(false)} color="secondary" disabled={busy}>Cancelar</Button>
          <Button onClick={bloquear} color="error" variant="contained" disabled={busy}>
            {busy ? 'Bloqueando…' : 'Bloquear'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ContentActions;
