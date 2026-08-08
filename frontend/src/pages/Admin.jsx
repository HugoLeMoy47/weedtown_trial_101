import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Typography, Box, Paper, Stack, Tabs, Tab, Chip, Button, Alert,
  CircularProgress, Divider, Avatar, TextField, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Pagination, Tooltip, MenuItem, ToggleButtonGroup, ToggleButton, Link
} from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import GavelIcon from '@mui/icons-material/Gavel';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import InsightsIcon from '@mui/icons-material/Insights';
import TagIcon from '@mui/icons-material/Tag';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Navbar from '../components/Navbar';
import TemasYDiccionario from '../components/TemasYDiccionario';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const MOTIVOS = [
  { valor: 'ACOSO', texto: 'Acoso o ataque personal' },
  { valor: 'ODIO', texto: 'Discurso de odio o discriminación' },
  { valor: 'SPAM', texto: 'Spam o publicación repetitiva' },
  { valor: 'ILEGAL', texto: 'Actividad ilegal' },
  { valor: 'DESINFORMACION', texto: 'Desinformación de salud' },
  { valor: 'SEXUAL', texto: 'Contenido sexual no solicitado' },
  { valor: 'SUPLANTACION', texto: 'Suplantación de identidad' },
  { valor: 'OTRO', texto: 'Otro motivo' }
];

const ETIQUETA_TIPO = {
  POST: 'Posteo del feed',
  COMMENT: 'Comentario del feed',
  FORUM_POST: 'Post del foro',
  FORUM_COMMENT: 'Comentario del foro',
  USER: 'Cuenta',
  SUBFORUM: 'Subforo'
};

const OCULTABLE = ['POST', 'COMMENT', 'FORUM_POST', 'FORUM_COMMENT'];

const fecha = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- Panorama ----------

const Panorama = ({ stats }) => {
  if (!stats) return null;
  const tiles = [
    { label: 'Sin revisar', valor: stats.reportes.pendientes, destacar: stats.reportes.pendientes > 0 },
    { label: 'Accionados', valor: stats.reportes.accionados },
    { label: 'Descartados', valor: stats.reportes.descartados },
    { label: 'Cuentas suspendidas', valor: stats.suspendidos },
    { label: 'Contenido oculto', valor: stats.ocultos.feed + stats.ocultos.foro },
    { label: 'Cuentas totales', valor: stats.usuarios }
  ];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
        gap: 1,
        mb: 3
      }}
    >
      {tiles.map(t => (
        <Paper key={t.label} variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" display="block">{t.label}</Typography>
          <Typography variant="h5" color={t.destacar ? 'warning.main' : 'text.primary'}
            sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {t.valor}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
};

// ---------- Contenido reportado, en contexto ----------

const Contenido = ({ reporte }) => {
  const c = reporte.contenido;
  if (!c) {
    return <Alert severity="info" sx={{ mt: 1 }}>El contenido ya no existe: su autor lo eliminó.</Alert>;
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'action.hover' }}>
      {c.title && <Typography variant="subtitle1" fontWeight={700} gutterBottom>{c.title}</Typography>}
      {reporte.targetType === 'USER' ? (
        <Stack spacing={0.5}>
          <Typography variant="body2"><strong>{c.displayName || c.name}</strong> · @{c.handle}</Typography>
          {c.bio && <Typography variant="body2" color="text.secondary">{c.bio}</Typography>}
          <Typography variant="caption" color="text.secondary">En WeedTown desde {fecha(c.createdAt)}</Typography>
        </Stack>
      ) : reporte.targetType === 'SUBFORUM' ? (
        <Stack spacing={0.5}>
          <Typography variant="body2"><strong>{c.name}</strong> · /{c.slug}</Typography>
          {c.description && <Typography variant="body2" color="text.secondary">{c.description}</Typography>}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
      )}
      {c.image && (
        <Box component="img" src={c.image} alt="Imagen del contenido reportado" loading="lazy"
          sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 1, mt: 1, display: 'block' }} />
      )}
      {c.hiddenAt && (
        <Chip size="small" color="warning" icon={<VisibilityOffIcon />} label="Ya está oculto" sx={{ mt: 1 }} />
      )}
      {c.archivedAt && (
        <Chip size="small" color="warning" icon={<Inventory2OutlinedIcon />} label="Ya está archivado" sx={{ mt: 1 }} />
      )}
    </Paper>
  );
};

// ---------- Una tarjeta de la cola ----------

const TarjetaReporte = ({ reporte, onAccion }) => {
  const [dialogo, setDialogo] = useState(null); // 'ocultar' | 'suspender' | 'archivar' | 'descartar'
  const [motivo, setMotivo] = useState(reporte.reason);
  const [dias, setDias] = useState(7);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const autor = reporte.autor;
  const historial = reporte.historialAutor;
  const reincidente = historial && historial.reportes > 1;

  const ejecutar = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setDialogo(null);
      onAccion();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const cerrar = () => { setDialogo(null); setError(''); setNota(''); };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', mb: 1 }}>
        <Chip size="small" label={ETIQUETA_TIPO[reporte.targetType]} />
        <Chip size="small" color="warning" label={reporte.reasonText} />
        <Typography variant="caption" color="text.secondary">{fecha(reporte.createdAt)}</Typography>
        {reincidente && (
          <Tooltip title="Esta cuenta acumula varios reportes: puede ser un patrón, no un incidente">
            <Chip size="small" color="error" variant="outlined"
              label={`${historial.reportes} reportes acumulados`} />
          </Tooltip>
        )}
      </Stack>

      {autor && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Avatar src={autor.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
            {(autor.displayName || autor.name || '?').charAt(0).toUpperCase()}
          </Avatar>
          <Typography variant="body2">{autor.displayName || autor.name}</Typography>
          <Typography variant="caption" color="text.secondary">@{autor.handle}</Typography>
        </Stack>
      )}

      {reporte.detail && (
        <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', mt: 1 }}>
          «{reporte.detail}»
        </Typography>
      )}

      <Contenido reporte={reporte} />

      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
        {OCULTABLE.includes(reporte.targetType) && !reporte.contenido?.hiddenAt && reporte.contenido && (
          <Button size="small" variant="contained" color="warning" startIcon={<VisibilityOffIcon />}
            onClick={() => { setMotivo(reporte.reason); setDialogo('ocultar'); }}>
            Ocultar contenido
          </Button>
        )}
        {reporte.targetType === 'SUBFORUM' && !reporte.contenido?.archivedAt && reporte.contenido && (
          <Button size="small" variant="contained" color="warning" startIcon={<Inventory2OutlinedIcon />}
            onClick={() => setDialogo('archivar')}>
            Archivar subforo
          </Button>
        )}
        {autor && (
          <Button size="small" variant="outlined" color="error" startIcon={<DoNotDisturbOnIcon />}
            onClick={() => { setMotivo(reporte.reason); setDialogo('suspender'); }}>
            Suspender cuenta
          </Button>
        )}
        <Button size="small" color="secondary" startIcon={<CheckCircleOutlineIcon />}
          onClick={() => setDialogo('descartar')}>
          No procede
        </Button>
      </Stack>

      {/* Ocultar */}
      <Dialog open={dialogo === 'ocultar'} onClose={() => !busy && cerrar()} fullWidth maxWidth="sm">
        <DialogTitle>Ocultar este contenido</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Deja de verse para toda la comunidad, pero no se borra: puedes revertirlo y queda registrado quién
            lo ocultó. A su autor le llega una notificación con el motivo — nunca con quién reportó.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField select label="Motivo que se le comunica" value={motivo}
              onChange={e => setMotivo(e.target.value)} fullWidth>
              {MOTIVOS.map(m => <MenuItem key={m.valor} value={m.valor}>{m.texto}</MenuItem>)}
            </TextField>
            <TextField label="Nota interna (opcional)" value={nota} onChange={e => setNota(e.target.value)}
              fullWidth multiline minRows={2} helperText="Solo la ve el equipo, queda en la bitácora" />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrar} color="secondary" disabled={busy}>Cancelar</Button>
          <Button variant="contained" color="warning" disabled={busy}
            onClick={() => ejecutar(() => api.post(
              `/admin/content/${reporte.targetType}/${reporte.targetId}/ocultar`, { reason: motivo, note: nota }))}>
            {busy ? 'Ocultando…' : 'Ocultar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Suspender */}
      <Dialog open={dialogo === 'suspender'} onClose={() => !busy && cerrar()} fullWidth maxWidth="sm">
        <DialogTitle>Suspender a {autor?.displayName || autor?.name}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Durante la suspensión no puede publicar, comentar, chatear ni mandar toques. Sí puede seguir
            leyendo: es una pausa, no una expulsión. Caduca sola en la fecha indicada.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField select label="Duración" value={dias} onChange={e => setDias(Number(e.target.value))} fullWidth>
              <MenuItem value={1}>1 día</MenuItem>
              <MenuItem value={3}>3 días</MenuItem>
              <MenuItem value={7}>7 días</MenuItem>
              <MenuItem value={30}>30 días</MenuItem>
              <MenuItem value={90}>90 días</MenuItem>
            </TextField>
            <TextField select label="Motivo que se le comunica" value={motivo}
              onChange={e => setMotivo(e.target.value)} fullWidth>
              {MOTIVOS.map(m => <MenuItem key={m.valor} value={m.valor}>{m.texto}</MenuItem>)}
            </TextField>
            <TextField label="Nota interna (opcional)" value={nota} onChange={e => setNota(e.target.value)}
              fullWidth multiline minRows={2} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrar} color="secondary" disabled={busy}>Cancelar</Button>
          <Button variant="contained" color="error" disabled={busy}
            onClick={() => ejecutar(() => api.post(
              `/admin/users/${autor.id}/suspender`, { days: dias, reason: motivo, note: nota }))}>
            {busy ? 'Suspendiendo…' : `Suspender ${dias} día${dias > 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archivar subforo */}
      <Dialog open={dialogo === 'archivar'} onClose={() => !busy && cerrar()} fullWidth maxWidth="sm">
        <DialogTitle>Archivar este subforo</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Sale del directorio y deja de admitir publicaciones nuevas, pero su contenido sigue siendo
            consultable por enlace directo. Archivar no borra la conversación.
          </DialogContentText>
          <TextField label="Nota interna (opcional)" value={nota} onChange={e => setNota(e.target.value)}
            fullWidth multiline minRows={2} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrar} color="secondary" disabled={busy}>Cancelar</Button>
          <Button variant="contained" color="warning" disabled={busy}
            onClick={() => ejecutar(() => api.post(`/admin/subforums/${reporte.targetId}/archivar`, { note: nota }))}>
            {busy ? 'Archivando…' : 'Archivar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Descartar */}
      <Dialog open={dialogo === 'descartar'} onClose={() => !busy && cerrar()} fullWidth maxWidth="sm">
        <DialogTitle>Marcar como que no procede</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            El reporte sale de la cola sin tomar ninguna acción sobre el contenido ni la cuenta. Queda
            registrado en el historial de esa cuenta, para dar contexto si vuelve a aparecer.
          </DialogContentText>
          <TextField label="Nota interna (opcional)" value={nota} onChange={e => setNota(e.target.value)}
            fullWidth multiline minRows={2} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrar} color="secondary" disabled={busy}>Cancelar</Button>
          <Button variant="contained" disabled={busy}
            onClick={() => ejecutar(() => api.post(`/admin/reports/${reporte.id}/descartar`, { note: nota }))}>
            {busy ? 'Guardando…' : 'No procede'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

// ---------- Bitácora ----------

const ETIQUETA_ACCION = {
  OCULTAR: 'ocultó',
  MOSTRAR: 'restauró',
  SUSPENDER: 'suspendió',
  LEVANTAR_SUSPENSION: 'levantó la suspensión de',
  ARCHIVAR_SUBFORO: 'archivó',
  RESTAURAR_SUBFORO: 'restauró',
  RENOMBRAR_SUBFORO: 'renombró',
  DESCARTAR_REPORTE: 'descartó un reporte sobre'
};

const Bitacora = () => {
  const [datos, setDatos] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get(`/admin/log?page=${page}`).then(r => setDatos(r.data)).catch(() => setDatos({ acciones: [] }));
  }, [page]);

  if (!datos) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (!datos.acciones.length) {
    return <Typography color="text.secondary">Todavía no se ha registrado ninguna acción de moderación.</Typography>;
  }

  return (
    <Stack spacing={0} divider={<Divider />}>
      {datos.acciones.map(a => (
        <Box key={a.id} sx={{ py: 1.5 }}>
          <Typography variant="body2">
            <strong>{a.moderator.displayName || a.moderator.name}</strong>{' '}
            {ETIQUETA_ACCION[a.type] || a.type}{' '}
            {ETIQUETA_TIPO[a.targetType]?.toLowerCase()} #{a.targetId}
            {a.reason && <> · <em>{a.reason}</em></>}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {fecha(a.createdAt)}{a.note && ` — ${a.note}`}
          </Typography>
        </Box>
      ))}
      {datos.totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
          <Pagination count={datos.totalPages} page={page} onChange={(_, v) => setPage(v)} />
        </Box>
      )}
    </Stack>
  );
};

// ---------- Panóptico (HU-PAN-002/003/004) ----------
//
// Sin dependencias nuevas de graficación (recharts no está en el proyecto):
// las series se dibujan con barras de CSS, igual criterio que ya usa el
// proyecto en avatares generados y storage.js sin dependencias.
//
// Accesibilidad: cada gráfica lleva `role="img"` con un resumen en
// `aria-label` (día por día no cabe ahí) MÁS una tabla equivalente presente
// en el árbol de accesibilidad pero oculta visualmente — no `display:none`,
// que la sacaría también de ahí. Es el mismo patrón "oculto visualmente pero
// no del lector de pantalla" que ya se verificó como gotcha real con el
// Badge de Amigos en el navbar.
const srOnlySx = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap'
};

const fechaCorta = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

const IconoTendencia = ({ valor }) => {
  if (valor > 0) return <TrendingUpIcon fontSize="inherit" sx={{ verticalAlign: 'middle', color: 'success.main' }} />;
  if (valor < 0) return <TrendingDownIcon fontSize="inherit" sx={{ verticalAlign: 'middle', color: 'error.main' }} />;
  return <TrendingFlatIcon fontSize="inherit" sx={{ verticalAlign: 'middle', color: 'text.secondary' }} />;
};

// Serie diaria con tendencia contra el periodo anterior (CA4). `datos` es la
// forma que arma `conTendencia()` en el backend: { serie, total, totalPeriodoAnterior, tendencia }
const MiniSerie = ({ titulo, datos }) => {
  if (!datos) return null;
  const max = Math.max(1, ...datos.serie.map(d => d.valor));
  const resumen = `Serie diaria de ${titulo}, ${datos.serie.length} días, total ${datos.total}, ` +
    `${datos.tendencia > 0 ? 'subió' : datos.tendencia < 0 ? 'bajó' : 'se mantuvo igual'} ` +
    `${Math.abs(datos.tendencia)} respecto al periodo anterior (${datos.totalPeriodoAnterior})`;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
        <Typography variant="body2" noWrap title={titulo}>{titulo}</Typography>
        <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{datos.total}</Typography>
      </Stack>
      <Box
        role="img"
        aria-label={resumen}
        sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 32, mt: 0.5 }}
      >
        {datos.serie.map(d => (
          <Box
            key={d.dia}
            title={`${fechaCorta(d.dia)}: ${d.valor}`}
            sx={{
              flex: 1, height: `${Math.max(2, (d.valor / max) * 32)}px`,
              bgcolor: 'primary.main', opacity: d.valor ? 0.75 : 0.2, borderRadius: '1px'
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}
        color={datos.tendencia > 0 ? 'success.main' : datos.tendencia < 0 ? 'error.main' : 'text.secondary'}>
        <IconoTendencia valor={datos.tendencia} />
        {Math.abs(datos.tendencia)} vs. periodo anterior ({datos.totalPeriodoAnterior})
      </Typography>
      {/* Tabla equivalente para lectores de pantalla — mismos datos que las barras */}
      <Box component="table" sx={srOnlySx}>
        <caption>{titulo} por día</caption>
        <tbody>
          {datos.serie.map(d => (
            <tr key={d.dia}><th scope="row">{d.dia}</th><td>{d.valor}</td></tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
};

// Varias sub-series (proveedor, tipo, estado…) del mismo indicador
const MiniSeriesPorSubclave = ({ titulo, porSubclave, etiquetas = {} }) => {
  const claves = Object.keys(porSubclave || {});
  if (claves.length === 0) return <Typography variant="body2" color="text.secondary">{titulo}: sin datos en este periodo.</Typography>;
  return (
    <Box>
      <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>{titulo}</Typography>
      <Stack spacing={1.5}>
        {claves.map(clave => (
          <MiniSerie key={clave} titulo={etiquetas[clave] || clave} datos={porSubclave[clave]} />
        ))}
      </Stack>
    </Box>
  );
};

// Un número suelto, sin serie — para instantáneas ("ahora mismo")
const Tile = ({ label, valor, ayuda }) => (
  <Paper variant="outlined" sx={{ p: 1.5 }}>
    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{valor ?? '—'}</Typography>
    {ayuda && <Typography variant="caption" color="text.secondary">{ayuda}</Typography>}
  </Paper>
);

const Bloque = ({ titulo, children }) => (
  <Paper sx={{ p: 2 }}>
    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>{titulo}</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
      {children}
    </Box>
  </Paper>
);

const ETIQUETAS_PROVEEDOR = { MASTODON: 'Mastodon', PASSKEY: 'Llave de acceso', EMAIL: 'Correo' };
const ETIQUETAS_REACCION = { LIKE: 'Me prende', ROLA: 'Rola', INTERESA: 'Interesa', MOLESTA: 'Molesta' };
const ETIQUETAS_AMISTAD = { PENDING: 'Pendientes', ACCEPTED: 'Aceptadas', REJECTED: 'Rechazadas' };

// Card visible a MOD y ADMIN (a diferencia del resto del panóptico): la carga
// propia es una herramienta de trabajo; el desglose por compañero, que sí ve
// un ADMIN dentro de "Indicadores", desmoralizaría al equipo si todos lo vieran.
const MiCargaModeracion = () => {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    api.get('/admin/indicadores/carga-moderacion?dias=30').then(r => setDatos(r.data)).catch(() => {});
  }, []);
  if (!datos || datos.desglose) return null; // ADMIN ya lo ve completo abajo, en Indicadores
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <Typography variant="body2" color="text.secondary">Tu carga de moderación (30 días)</Typography>
      <Typography variant="body2"><strong>{datos.propio}</strong> acciones tuyas</Typography>
      <Typography variant="body2" color="text.secondary">promedio del equipo: {datos.promedioEquipo}</Typography>
    </Paper>
  );
};

const SaludTecnica = () => {
  const [salud, setSalud] = useState(null);
  useEffect(() => {
    api.get('/admin/salud-tecnica').then(r => setSalud(r.data)).catch(() => setSalud(false));
  }, []);
  if (salud === null) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>;
  if (salud === false) return null;
  const horas = Math.floor(salud.uptimeSegundos / 3600);
  const minutos = Math.floor((salud.uptimeSegundos % 3600) / 60);
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <MonitorHeartIcon color={salud.db === 'ok' ? 'success' : 'error'} />
        <Typography variant="subtitle1" fontWeight={700}>Estado técnico</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Tile label="Base de datos" valor={salud.db === 'ok' ? 'Conectada' : 'Error'} />
        <Tile label="Almacenamiento" valor={salud.storage} />
        <Tile label="Correo" valor={salud.mailer} />
        <Tile label="Uptime del proceso" valor={`${horas}h ${minutos}m`} />
      </Box>
      <Box sx={{ mt: 1.5 }}>
        {salud.observabilityUrl ? (
          <Link href={salud.observabilityUrl} target="_blank" rel="noopener noreferrer"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            Abrir observabilidad externa <OpenInNewIcon fontSize="inherit" />
          </Link>
        ) : (
          <Typography variant="caption" color="text.secondary">
            No hay observabilidad conectada (falta OBSERVABILITY_URL en el entorno del backend).
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

// Pantalla completa de indicadores (HU-PAN-002). Solo se monta si el rol es
// ADMIN — ver el `tab` condicional más abajo. La protección real es del
// servidor (cada ruta exige requireRole('ADMIN')); esto es comodidad.
const Indicadores = () => {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [carga, setCarga] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    Promise.all([
      api.get(`/admin/indicadores?dias=${dias}`),
      api.get(`/admin/indicadores/carga-moderacion?dias=${dias}`)
    ])
      .then(([i, c]) => { setDatos(i.data); setCarga(c.data); })
      .catch(e => setError(e.response?.data?.error || 'No se pudieron cargar los indicadores.'));
  }, [dias]);

  return (
    <Stack spacing={2}>
      <SaludTecnica />

      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1}>
        <ToggleButtonGroup size="small" exclusive value={dias} onChange={(_, v) => v && setDias(v)} aria-label="Ventana de tiempo">
          <ToggleButton value={7} aria-label="Últimos 7 días">7 días</ToggleButton>
          <ToggleButton value={30} aria-label="Últimos 30 días">30 días</ToggleButton>
          <ToggleButton value={90} aria-label="Últimos 90 días">90 días</ToggleButton>
        </ToggleButtonGroup>
        {datos && (
          <Typography variant="caption" color="text.secondary">
            Calculado el {new Date(datos.calculadoEn).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            {' '}· datos del {fechaCorta(datos.periodo.desde)} al {fechaCorta(datos.periodo.hasta)}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error" role="alert">{error}</Alert>}

      {!datos ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          <Bloque titulo="Crecimiento e identidad">
            <MiniSerie titulo="Altas por día" datos={datos.crecimiento.altasPorDia} />
            <MiniSeriesPorSubclave titulo="Altas por proveedor" porSubclave={datos.crecimiento.altasPorProveedor} etiquetas={ETIQUETAS_PROVEEDOR} />
            <MiniSerie titulo="Eliminaciones de cuenta" datos={datos.crecimiento.eliminacionesPorDia} />
            <MiniSerie titulo="Exportaciones de datos" datos={datos.crecimiento.exportacionesPorDia} />
            <Tile label="Cuentas con +1 método de acceso" valor={datos.crecimiento.cuentasConMetodosMultiples} />
            <Tile label="Cuentas en cuarentena ahora" valor={datos.crecimiento.cuentasEnCuarentena} />
          </Bloque>

          <Bloque titulo="Actividad por superficie">
            <MiniSerie titulo="Posteos (feed)" datos={datos.actividad.postsPorDia} />
            <MiniSerie titulo="Comentarios (feed)" datos={datos.actividad.comentariosPorDia} />
            <MiniSeriesPorSubclave titulo="Reacciones por tipo" porSubclave={datos.actividad.reaccionesPorDiaYTipo} etiquetas={ETIQUETAS_REACCION} />
            <MiniSerie titulo="Posts de foro" datos={datos.actividad.foro.postsPorDia} />
            <MiniSerie titulo="Comentarios de foro" datos={datos.actividad.foro.comentariosPorDia} />
            <MiniSerie titulo="Mensajes de chat" datos={datos.actividad.mensajesPorDia} />
            <MiniSerie titulo="Imágenes subidas" datos={datos.actividad.imagenesPorDia} />
            <MiniSerie titulo="Toques en Cerca" datos={datos.actividad.toquesPorDia} />
            <Tile label="Compartiendo zona en Cerca ahora" valor={datos.actividad.personasCompartiendoZona} />
          </Bloque>

          <Bloque titulo="Salud social">
            <MiniSeriesPorSubclave titulo="Solicitudes de amistad" porSubclave={datos.saludSocial.amistad.porDiaYEstado} etiquetas={ETIQUETAS_AMISTAD} />
            <Tile label="Tasa de aceptación del periodo" valor={datos.saludSocial.amistad.tasaAceptacionPeriodo != null ? `${datos.saludSocial.amistad.tasaAceptacionPeriodo}%` : '—'} />
            <MiniSerie titulo="Bloqueos por día" datos={datos.saludSocial.bloqueosPorDia} />
            <Tile label="Ratio bloqueos / altas" valor={datos.saludSocial.ratioBloqueosAltas != null ? `${datos.saludSocial.ratioBloqueosAltas}%` : '—'}
              ayuda="El bloqueo es silencioso y no genera reporte: es la alarma temprana de acoso" />
            <Tile label="Contenido oculto vigente (feed)" valor={datos.saludSocial.contenidoOcultoVigente.feed} />
            <Tile label="Contenido oculto vigente (foro)" valor={datos.saludSocial.contenidoOcultoVigente.foro} />
          </Bloque>

          <Bloque titulo="Vitalidad de foros">
            <Tile label="Subforos vivos (post en 30 días)" valor={datos.foros.subforosVivosVsMuertos.vivos} />
            <Tile label="Subforos muertos" valor={datos.foros.subforosVivosVsMuertos.muertos} />
            <Tile label="Concentración en top 3 subforos" valor={datos.foros.concentracionActividad.top3Pct != null ? `${datos.foros.concentracionActividad.top3Pct}%` : '—'}
              ayuda={`sobre ${datos.foros.concentracionActividad.totalPosts} posts del periodo`} />
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Seguidores por subforo</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Los subforos con menos de {5} seguidores se agrupan en "Otros" — un desglose así de chico identifica a quien los sigue.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {datos.foros.seguidoresPorSubforo.map(s => (
                  <Chip key={s.nombre} label={`${s.nombre}: ${s.valor}${s.agrupados ? ` (${s.agrupados} subforos)` : ''}`} size="small" variant="outlined" />
                ))}
              </Stack>
            </Box>
          </Bloque>

          <Bloque titulo="Salud de moderación">
            <MiniSeriesPorSubclave
              titulo="Reportes por motivo y estado"
              porSubclave={datos.moderacion.reportesPorDiaMotivoEstado}
              etiquetas={Object.fromEntries(Object.keys(datos.moderacion.reportesPorDiaMotivoEstado || {}).map(k => [k, k.replace('::', ' · ')]))}
            />
            <Tile
              label="Tiempo de respuesta a reportes"
              valor={datos.moderacion.tiempoRespuesta.medianaHoras != null ? `${datos.moderacion.tiempoRespuesta.medianaHoras}h mediana` : 'Sin datos'}
              ayuda={datos.moderacion.tiempoRespuesta.p90Horas != null ? `p90: ${datos.moderacion.tiempoRespuesta.p90Horas}h · muestra: ${datos.moderacion.tiempoRespuesta.muestra}` : undefined}
            />
            <Tile label="Cuentas reincidentes" valor={datos.moderacion.reincidencia.cuentas} ayuda="Más de un reporte accionado en el periodo" />
            <MiniSerie titulo="Suspensiones nuevas por día" datos={datos.moderacion.suspensionesNuevasPorDia} />
            <MiniSerie titulo="Suspensiones levantadas por día" datos={datos.moderacion.suspensionesLevantadasPorDia} />
            {carga?.desglose && (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Carga por moderador</Typography>
                {carga.desglose.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Sin acciones registradas en este periodo.</Typography>
                ) : (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {carga.desglose.map(m => (
                      <Chip key={m.moderatorId} label={`${m.nombre}: ${m.valor}`} size="small" variant="outlined" />
                    ))}
                  </Stack>
                )}
              </Box>
            )}
          </Bloque>
        </>
      )}
    </Stack>
  );
};

// ---------- Página ----------

// Fuera del componente: si viviera dentro, cambiaría de identidad en cada
// render y el useCallback de abajo se recrearía en bucle.
const ESTADOS = ['PENDIENTE', 'ACCIONADO', 'DESCARTADO'];

const Admin = () => {
  const { user } = useAuth();
  const esAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState(null);
  const [cola, setCola] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const [s, c] = await Promise.all([
        api.get('/admin/stats'),
        api.get(`/admin/reports?status=${ESTADOS[tab]}&page=${page}`)
      ]);
      setStats(s.data);
      setCola(c.data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el panel.');
      setCola({ reports: [], totalPages: 1 });
    }
  }, [tab, page]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <GavelIcon color="primary" />
          <Typography variant="h5" component="h1">Moderación</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ocultar es reversible y queda registrado. No hay borrado definitivo: perder el contenido sería perder
          la evidencia. Quien reportó nunca se revela.
        </Typography>

        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}

        <Panorama stats={stats} />
        <MiCargaModeracion />

        <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(1); }} sx={{ mb: 2 }}>
          <Tab label={`Sin revisar${stats ? ` (${stats.reportes.pendientes})` : ''}`} />
          <Tab label="Accionados" />
          <Tab label="Descartados" />
          <Tab label="Bitácora" />
          <Tab label="Temas" icon={<TagIcon fontSize="small" />} iconPosition="start" />
          {esAdmin && <Tab label="Indicadores" icon={<InsightsIcon fontSize="small" />} iconPosition="start" />}
        </Tabs>

        {tab === 5 && esAdmin ? (
          <Indicadores />
        ) : tab === 4 ? (
          <TemasYDiccionario esAdmin={esAdmin} />
        ) : tab === 3 ? (
          <Bitacora />
        ) : !cola ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : cola.reports.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 42 }} />
            <Typography sx={{ mt: 1 }}>
              {tab === 0 ? 'No hay nada esperando revisión 🌿' : 'Nada por aquí.'}
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {cola.reports.map(r => <TarjetaReporte key={r.id} reporte={r} onAccion={cargar} />)}
            {cola.totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Pagination count={cola.totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
              </Box>
            )}
          </Stack>
        )}
      </Container>
    </>
  );
};

export default Admin;
