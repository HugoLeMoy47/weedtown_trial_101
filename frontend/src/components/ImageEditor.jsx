import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button, IconButton,
  Typography, CircularProgress, Alert, Stack, Tooltip, useMediaQuery, useTheme
} from '@mui/material';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import CropFreeIcon from '@mui/icons-material/CropFree';
import { decodeImage, rotar90, exportarRecorte } from '../lib/imageProcessing';
import {
  RECORTE_COMPLETO, NOMBRES_ESQUINA, rotarRecorte90, moverRecorte,
  redimensionarRecorte, recorteEsCompleto
} from '../lib/recorte';

// Editor de recorte y rotación (ciclo 9D).
//
// CANVAS NATIVO, CERO DEPENDENCIAS. El bundler está fijado en CRA
// (`react-scripts` 5) y meter ahí una librería de cropping es pedir problemas
// —transpilación, tamaño del bundle, una superficie más que auditar— para algo
// que `<canvas>` más aritmética de rectángulos cubre entero. La aritmética
// vive en `lib/recorte.js` y tiene sus propias pruebas; aquí solo hay píxeles
// y dedos.
//
// TÁCTIL DE VERDAD (criterio 5). Dos decisiones que lo sostienen:
//   · Pointer Events, no mouse events. Un solo camino de código atiende dedo,
//     mouse y lápiz, y `setPointerCapture` mantiene el arrastre aunque el dedo
//     se salga del tirador — que en una pantalla chica pasa todo el tiempo.
//   · `touchAction: 'none'` en la zona de arrastre. Sin eso, el navegador se
//     queda con el gesto para hacer scroll o zoom y el recorte no se mueve.
// Ningún estado depende de `hover`: en un celular no existe.

// El tirador se ve de 18 px pero se agarra en 44 — el mínimo cómodo para un
// dedo. El área grande es un pseudo-elemento transparente, así que se puede
// agrandar sin que la esquina se vea como un botón enorme.
const TIRADOR_VISIBLE = 18;
const TIRADOR_TACTIL = 44;

const cursorDeEsquina = { no: 'nwse-resize', ne: 'nesw-resize', so: 'nesw-resize', se: 'nwse-resize' };
const posicionDeEsquina = {
  no: { left: 0, top: 0 }, ne: { right: 0, top: 0 },
  so: { left: 0, bottom: 0 }, se: { right: 0, bottom: 0 }
};

const ImageEditor = ({ file, open, onCancel, onApply }) => {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down('sm'));
  const lienzoRef = useRef(null);
  const marcoRef = useRef(null);
  const arrastreRef = useRef(null);
  // La imagen de trabajo vive en un ref, no en el estado: es un canvas que
  // puede pesar megas en memoria y no queremos que React lo compare en cada
  // render. `version` es lo que sí dispara el repintado.
  const trabajoRef = useRef(null);
  const [version, setVersion] = useState(0);
  const [recorte, setRecorte] = useState(RECORTE_COMPLETO);
  const [giros, setGiros] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');

  const pintar = useCallback(() => {
    const trabajo = trabajoRef.current;
    const lienzo = lienzoRef.current;
    if (!trabajo || !lienzo) return;
    lienzo.width = trabajo.width;
    lienzo.height = trabajo.height;
    lienzo.getContext('2d').drawImage(trabajo, 0, 0);
  }, []);

  // Decodificar al abrir. El archivo que llega YA pasó por sanitizeImage: es
  // un binario nuevo sin EXIF ni GPS, y todo lo de aquí en adelante lo
  // mantiene así (ver la nota de imageProcessing.js).
  useEffect(() => {
    if (!open || !file) return undefined;
    let cancelado = false;
    // TODO el estado se reinicia al abrir, no al cerrar. El componente NO se
    // desmonta entre aperturas (queda montado con `open=false` mientras haya
    // imagen), así que lo que no se reinicie aquí sobrevive a la siguiente
    // apertura. Ya mordió una vez: `aplicando` se quedaba en true después de
    // aplicar con éxito y al reabrir el editor el botón decía "Aplicando…",
    // deshabilitado para siempre, sin ningún error a la vista.
    setCargando(true);
    setAplicando(false);
    setError('');
    setRecorte(RECORTE_COMPLETO);
    setGiros(0);
    decodeImage(file)
      .then(imagen => {
        if (cancelado) return;
        // Se copia a un canvas de una vez: así el resto del componente trata
        // con un solo tipo (canvas), gire o no gire la imagen.
        const lienzo = document.createElement('canvas');
        lienzo.width = imagen.width;
        lienzo.height = imagen.height;
        lienzo.getContext('2d').drawImage(imagen, 0, 0);
        if (imagen.close) imagen.close();
        trabajoRef.current = lienzo;
        setVersion(v => v + 1);
        setCargando(false);
      })
      .catch(() => {
        if (cancelado) return;
        setError('No se pudo abrir la imagen para editarla.');
        setCargando(false);
      });
    return () => { cancelado = true; };
  }, [open, file]);

  useEffect(() => { pintar(); }, [version, pintar]);

  const girar = () => {
    if (!trabajoRef.current) return;
    trabajoRef.current = rotar90(trabajoRef.current);
    // El encuadre gira CON la imagen: quien recortó primero y giró después no
    // pierde lo que ya había ajustado.
    setRecorte(r => rotarRecorte90(r));
    setGiros(g => (g + 1) % 4);
    setVersion(v => v + 1);
  };

  const iniciarArrastre = (modo, esquina) => (e) => {
    if (aplicando) return;
    e.preventDefault();
    e.stopPropagation();
    // El arrastre se registra ANTES de capturar el puntero, y la captura va en
    // try/catch. No es paranoia: `setPointerCapture` lanza NotFoundError si el
    // puntero ya no está activo cuando corre el handler, y con el orden
    // invertido esa excepción abortaba el handler antes de guardar nada — el
    // tirador simplemente no respondía, sin ningún error a la vista. La
    // captura es una mejora (mantiene el gesto vivo cuando el dedo se sale del
    // tirador, que en pantalla chica pasa todo el tiempo), no un requisito:
    // si falla, arrastrar debe seguir funcionando.
    arrastreRef.current = { modo, esquina, x0: e.clientX, y0: e.clientY, base: recorte };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* sin captura: los eventos siguen llegando por el marco, que también escucha */
    }
  };

  const moverArrastre = (e) => {
    const arrastre = arrastreRef.current;
    const marco = marcoRef.current;
    if (!arrastre || !marco) return;
    const caja = marco.getBoundingClientRect();
    if (!caja.width || !caja.height) return;
    // El delta se normaliza contra el tamaño EN PANTALLA del marco, que es lo
    // que el dedo está tocando — nunca contra los píxeles reales de la imagen.
    const dx = (e.clientX - arrastre.x0) / caja.width;
    const dy = (e.clientY - arrastre.y0) / caja.height;
    setRecorte(arrastre.modo === 'mover'
      ? moverRecorte(arrastre.base, dx, dy)
      : redimensionarRecorte(arrastre.base, arrastre.esquina, dx, dy));
  };

  const terminarArrastre = (e) => {
    if (!arrastreRef.current) return;
    arrastreRef.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* mismo caso que arriba: si nunca hubo captura, no hay nada que soltar */
    }
  };

  const aplicar = async () => {
    if (!trabajoRef.current) return;
    setAplicando(true);
    setError('');
    try {
      onApply(await exportarRecorte(trabajoRef.current, recorte, file.type));
    } catch (err) {
      setError(err.message === 'encode'
        ? 'No se pudo guardar la imagen editada. Intenta con otra.'
        : err.message);
      setAplicando(false);
    }
  };

  // Cuatro giros dejan la imagen como estaba, así que `giros` cuenta módulo 4:
  // aplicar ahí sería re-encodear para nada. `version` no sirve para esto — se
  // incrementa también al cargar y no vuelve a cero entre aperturas.
  const sinCambios = recorteEsCompleto(recorte) && giros === 0;
  const trabajo = trabajoRef.current;

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm" fullScreen={pantallaChica}>
      <DialogTitle sx={{ pb: 1 }}>Ajustar imagen</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'flex-start' }}>
          Arrastra las esquinas para recortar. Sirve para dejar fuera lo que no quieres compartir:
          una placa, el letrero de una calle, alguien al fondo.
        </Typography>

        {cargando ? (
          <Box sx={{ py: 6 }}><CircularProgress /></Box>
        ) : trabajo && (
          <Box
            ref={marcoRef}
            sx={{
              position: 'relative', lineHeight: 0, overflow: 'hidden',
              maxWidth: '100%', touchAction: 'none', userSelect: 'none'
            }}
            onPointerMove={moverArrastre}
            onPointerUp={terminarArrastre}
            onPointerCancel={terminarArrastre}
          >
            <Box component="canvas" ref={lienzoRef} sx={{ maxWidth: '100%', maxHeight: '55vh', display: 'block' }} />
            <Box
              onPointerDown={iniciarArrastre('mover')}
              sx={{
                position: 'absolute',
                left: `${recorte.x * 100}%`, top: `${recorte.y * 100}%`,
                width: `${recorte.w * 100}%`, height: `${recorte.h * 100}%`,
                border: 2, borderColor: 'common.white', cursor: 'move',
                // Oscurecer TODO lo de afuera con una sola sombra enorme, que
                // el `overflow: hidden` del marco recorta. Cuatro divs de
                // penumbra harían lo mismo con cuatro veces más código.
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                touchAction: 'none'
              }}
            >
              {NOMBRES_ESQUINA.map(esquina => (
                <Box
                  key={esquina}
                  onPointerDown={iniciarArrastre('esquina', esquina)}
                  role="slider"
                  aria-label={`Ajustar esquina ${esquina}`}
                  sx={{
                    position: 'absolute', ...posicionDeEsquina[esquina],
                    width: TIRADOR_VISIBLE, height: TIRADOR_VISIBLE,
                    m: `${-TIRADOR_VISIBLE / 2}px`,
                    bgcolor: 'common.white', borderRadius: '50%',
                    boxShadow: 2, cursor: cursorDeEsquina[esquina], touchAction: 'none',
                    // Área táctil de 44 px sin agrandar el círculo visible.
                    '&::before': {
                      content: '""', position: 'absolute',
                      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      width: TIRADOR_TACTIL, height: TIRADOR_TACTIL
                    }
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ alignSelf: 'flex-start' }}>
          <Tooltip title="Girar 90°">
            <span>
              <IconButton onClick={girar} disabled={cargando || aplicando} aria-label="Girar la imagen 90 grados">
                <RotateRightIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Quitar el recorte">
            <span>
              <IconButton
                onClick={() => setRecorte(RECORTE_COMPLETO)}
                disabled={cargando || aplicando || recorteEsCompleto(recorte)}
                aria-label="Quitar el recorte y usar la imagen completa"
              >
                <CropFreeIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {error && <Alert severity="error" role="alert" sx={{ width: '100%' }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} color="secondary" disabled={aplicando}>Cancelar</Button>
        <Button onClick={aplicar} variant="contained" disabled={cargando || aplicando || sinCambios}>
          {aplicando ? 'Aplicando…' : 'Aplicar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImageEditor;
