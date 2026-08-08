import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Box, IconButton, Tooltip, Typography, CircularProgress, Menu, MenuItem, ListItemIcon, ListItemText, Button } from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CollectionsIcon from '@mui/icons-material/Collections';
import CloseIcon from '@mui/icons-material/Close';
import CropRotateIcon from '@mui/icons-material/CropRotate';
import { validateImage, sanitizeImage, ALLOWED_EXTENSIONS } from '../lib/imageProcessing';
import ImageEditor from './ImageEditor';

const ACCEPT = ALLOWED_EXTENSIONS.map(e => '.' + e).join(',');
const TOOLTIP_TEXT = 'Adjuntar imagen (JPG, PNG o WebP, máx. 5 MB). Se eliminan los metadatos (EXIF/GPS) antes de enviarla.';

// Selector de UNA imagen con validación, anonimizado y preview (HU-WT-IMG-001)
// onChange recibe el File ya procesado (sin metadatos) o null al quitarla.
const ImagePicker = ({ file, onChange, disabled = false, size = 'medium' }) => {
  const inputRef = useRef(null);       // Elegir de galería (o único input en escritorio)
  const cameraInputRef = useRef(null); // Tomar foto — solo se monta en dispositivos táctiles
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [editando, setEditando] = useState(false);

  // `capture="environment"` en un <input type="file"> no AGREGA la cámara,
  // la SUSTITUYE: en iOS Safari y Chrome/Android abre la cámara directo y
  // elimina la opción de galería del selector del sistema. Por eso son dos
  // inputs separados que comparten el mismo handler, no uno con el atributo
  // agregado. En escritorio `capture` se ignora silenciosamente, así que ahí
  // no tiene caso ofrecer un menú — una sola acción, igual que hoy.
  const esTactil = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches),
    []
  );

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const procesar = async (raw) => {
    setError('');
    const validationError = validateImage(raw);
    if (validationError) {
      setError(validationError);
      return;
    }
    setProcessing(true);
    try {
      const clean = await sanitizeImage(raw);
      onChange(clean);
    } catch (err) {
      setError(err.message === 'decode' || err.message === 'encode'
        ? 'No se pudo procesar la imagen. Intenta con otra.'
        : err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSelect = (e) => {
    const raw = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!raw) return;
    procesar(raw);
  };

  const abrirSelector = (e) => {
    if (!esTactil) {
      inputRef.current?.click();
      return;
    }
    setMenuAnchor(e.currentTarget);
  };

  const elegirDelMenu = (ref) => {
    setMenuAnchor(null);
    ref.current?.click();
  };

  const handleClear = () => {
    setError('');
    onChange(null);
  };

  // Ciclo 9D. El editor es OPCIONAL y se abre a mano, no automáticamente al
  // elegir la foto: quien no quiere editar publica con los mismos clics de
  // siempre, sin un diálogo de por medio (criterio 6, "sin fricción nueva").
  // Por eso el botón dice qué hace en texto en vez de ser solo un ícono — es
  // lo que lo vuelve descubrible sin imponérselo a nadie.
  //
  // Edita el archivo YA anonimizado (el que guarda `file` salió de
  // `sanitizeImage`), nunca el original: el orden anonimizar → editar → subir
  // no se negocia, y así está garantizado por construcción, porque aquí ya no
  // existe el archivo crudo.
  const aplicarEdicion = (editada) => {
    setEditando(false);
    setError('');
    onChange(editada);
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {esTactil && (
        <input
          ref={cameraInputRef}
          type="file"
          // image/* (no la allowlist de extensiones): algunos navegadores solo
          // invocan la cámara del sistema si el accept es un tipo amplio.
          accept="image/*"
          capture="environment"
          onChange={handleSelect}
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      {!file && (
        <Tooltip title={TOOLTIP_TEXT}>
          <span>
            <IconButton
              onClick={abrirSelector}
              disabled={disabled || processing}
              color="secondary"
              size={size}
              aria-label="Adjuntar imagen"
            >
              {processing ? <CircularProgress size={size === 'small' ? 18 : 22} /> : <AddPhotoAlternateIcon fontSize={size} />}
            </IconButton>
          </span>
        </Tooltip>
      )}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => elegirDelMenu(cameraInputRef)} aria-label="Tomar foto con la cámara">
          <ListItemIcon><PhotoCameraIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Tomar foto" secondary="Se eliminan los metadatos antes de enviarla" />
        </MenuItem>
        <MenuItem onClick={() => elegirDelMenu(inputRef)} aria-label="Elegir imagen de la galería">
          <ListItemIcon><CollectionsIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Elegir de galería" />
        </MenuItem>
      </Menu>
      {file && previewUrl && (
        <Box sx={{ mt: 1 }}>
          <Box sx={{ position: 'relative', display: 'inline-block' }}>
            <Box
              component="img"
              src={previewUrl}
              alt="Vista previa de la imagen adjunta"
              sx={{
                maxWidth: '100%', maxHeight: 160, borderRadius: 2, display: 'block',
                border: 1, borderColor: 'divider'
              }}
            />
            <Tooltip title="Quitar imagen">
              <IconButton
                onClick={handleClear}
                size="small"
                aria-label="Quitar imagen adjunta"
                sx={{
                  position: 'absolute', top: 4, right: 4,
                  bgcolor: 'background.paper', boxShadow: 1,
                  '&:hover': { bgcolor: 'background.paper' }
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Button
            size="small"
            startIcon={<CropRotateIcon />}
            onClick={() => setEditando(true)}
            disabled={disabled || processing}
            sx={{ display: 'flex', mt: 0.5 }}
          >
            Recortar o girar
          </Button>
        </Box>
      )}
      {file && (
        <ImageEditor
          file={file}
          open={editando}
          onCancel={() => setEditando(false)}
          onApply={aplicarEdicion}
        />
      )}
      {error && (
        <Typography variant="caption" color="error" role="alert" sx={{ display: 'block', mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default ImagePicker;
