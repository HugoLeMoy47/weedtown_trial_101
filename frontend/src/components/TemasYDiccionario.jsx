import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, Typography, Stack, Chip, TextField, Button, Alert, Box,
  CircularProgress, Divider, Tooltip
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import api from '../services/api';

// Temas activos y diccionario de palabras que no se indexan (ciclo 10D).
//
// Vive solo en moderación a propósito: una nube de tendencias AMPLIFICA lo que
// muestra, y antes de ponerla frente a la comunidad conviene ver cómo se
// comporta con datos reales. Eso es una decisión de producto pendiente, no una
// tarea a medias.
const TemasYDiccionario = ({ esAdmin }) => {
  const [tendencias, setTendencias] = useState(null);
  const [umbral, setUmbral] = useState(null);
  const [palabras, setPalabras] = useState([]);
  const [nueva, setNueva] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [dic, ten] = await Promise.all([
        api.get('/admin/diccionario'),
        esAdmin ? api.get('/admin/tendencias?dias=7') : Promise.resolve(null)
      ]);
      setPalabras(dic.data.palabras || []);
      if (ten) {
        setTendencias(ten.data.tendencias || []);
        setUmbral(ten.data.umbralCuentas);
      }
    } catch {
      setError('No se pudo cargar esta sección.');
    } finally {
      setCargando(false);
    }
  }, [esAdmin]);

  useEffect(() => { cargar(); }, [cargar]);

  const agregar = async (e) => {
    e.preventDefault();
    if (!nueva.trim()) return;
    setOcupado(true);
    setError('');
    try {
      await api.post('/admin/diccionario', { palabra: nueva.trim() });
      setNueva('');
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agregar.');
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (id) => {
    setOcupado(true);
    setError('');
    try {
      await api.delete(`/admin/diccionario/${id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo quitar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>Temas y diccionario</Typography>

        {cargando ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
        ) : (
          <>
            {esAdmin && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>Temas activos · últimos 7 días</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Solo aparecen los temas de al menos {umbral} cuentas distintas — así una sola persona
                  publicando muchas veces no fabrica una tendencia. No se cuenta lo oculto por moderación
                  ni lo de cuentas suspendidas, y no se muestra quién publicó qué.
                </Typography>
                {tendencias?.length ? (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    {tendencias.map(t => (
                      <Tooltip key={t.tag} title={`${t.cuentas} cuentas · ${t.posteos} publicaciones`}>
                        <Chip
                          label={`#${t.displayTag}`}
                          size="small"
                          variant="outlined"
                          // El tamaño comunica el volumen sin poner el número encima
                          sx={{ fontSize: Math.min(1.1, 0.75 + t.cuentas / 40) + 'rem' }}
                          onDelete={ocupado ? undefined : () => { setNueva(t.tag); }}
                          deleteIcon={<Tooltip title="Proponer al diccionario"><BlockIcon /></Tooltip>}
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Todavía no hay ningún tema que alcance el umbral.
                  </Typography>
                )}
                <Divider sx={{ my: 2 }} />
              </>
            )}

            <Typography variant="subtitle2">Palabras que no se indexan</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              <strong>Esto no es censura.</strong> El texto de la publicación nunca se toca: quien escriba
              “#de” lo sigue viendo escrito igual. Lo único que cambia es que esa palabra deja de generar
              un tema navegable. Agregar una palabra tampoco borra los temas que ya existen — los saca de
              las tendencias y evita que se indexe en adelante.
            </Typography>

            <Box component="form" onSubmit={agregar}>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <TextField
                  size="small"
                  label="Agregar palabra"
                  value={nueva}
                  onChange={e => setNueva(e.target.value)}
                  disabled={ocupado}
                  inputProps={{ maxLength: 30, autoCapitalize: 'none', spellCheck: false }}
                  helperText="Una sola palabra, sin espacios ni signos"
                />
                <Box><Button type="submit" variant="outlined" disabled={ocupado || !nueva.trim()}>Agregar</Button></Box>
              </Stack>
            </Box>

            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {palabras.map(p => (
                <Tooltip
                  key={p.id}
                  title={p.agregadaPor ? `Agregada por @${p.agregadaPor.handle}` : 'Del catálogo inicial'}
                >
                  <Chip
                    label={p.palabra}
                    size="small"
                    onDelete={ocupado ? undefined : () => quitar(p.id)}
                  />
                </Tooltip>
              ))}
            </Stack>

            {error && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{error}</Alert>}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TemasYDiccionario;
