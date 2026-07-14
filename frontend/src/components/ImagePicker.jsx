import React, { useRef, useState, useEffect } from 'react';
import { Box, IconButton, Tooltip, Typography, CircularProgress } from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CloseIcon from '@mui/icons-material/Close';
import { validateImage, sanitizeImage, ALLOWED_EXTENSIONS } from '../lib/imageProcessing';

// Selector de UNA imagen con validación, anonimizado y preview (HU-WT-IMG-001)
// onChange recibe el File ya procesado (sin metadatos) o null al quitarla.
const ImagePicker = ({ file, onChange, disabled = false, size = 'medium' }) => {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSelect = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!raw) return;
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

  const handleClear = () => {
    setError('');
    onChange(null);
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.map(e => '.' + e).join(',')}
        onChange={handleSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {!file && (
        <Tooltip title="Adjuntar imagen (JPG, PNG o WebP, máx. 5 MB). Se eliminan los metadatos antes de enviarla.">
          <span>
            <IconButton
              onClick={() => inputRef.current?.click()}
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
      {file && previewUrl && (
        <Box sx={{ position: 'relative', display: 'inline-block', mt: 1 }}>
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
