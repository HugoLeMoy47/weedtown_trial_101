import React, { useState, useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, ToggleButtonGroup, ToggleButton, Alert, Stack, Typography, CircularProgress
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShareIcon from '@mui/icons-material/Share';
import DownloadIcon from '@mui/icons-material/Download';
import Navbar from '../components/Navbar';
import { BrandMark, BrandWordmark } from '../components/BrandLogo';
import MentionInput from '../components/MentionInput';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import {
  STORAGE_KEY,
  PRESETS,
  LISTA_PRESETS,
  CATEGORIAS_ETIQUETA,
  BADGE_NORMA,
  INGREDIENTES_RAPIDOS,
  auditarEtiqueta,
  insertarIngredienteEnLista,
  generarCodigoLote,
  sanitizarDatosEtiqueta,
  urlLoginParaEtiquetas,
  armarTextoPostEtiqueta,
  renderizarEtiquetaPng
} from '../lib/etiquetaspe420';

const ESTILOS_ESTUDIO = `
@import url('https://fonts.googleapis.com/css2?family=Bungee&family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');

.pe420-root {
  --el-emerald-950: #072a20;
  --el-emerald-800: #0d4f38;
  --el-emerald-600: #128a5e;
  --el-emerald-400: #3dbf8d;
  --el-emerald-100: #dff5ea;
  --el-gold-700: #a3701a;
  --el-gold-500: #d4a017;
  --el-gold-300: #f0c869;
  --el-gold-100: #fbeecb;
  --el-terracotta-700: #7a2f1c;
  --el-terracotta-600: #a8442b;
  --el-terracotta-500: #c0563a;
  --el-terracotta-100: #fce8e2;
  --el-onyx-950: #0a0f0c;
  --el-cream-50: #faf6ec;
  --el-white: #ffffff;
  --el-ink-900: #16211c;
  --el-ink-700: #35443c;
  --el-ink-500: #5a6b62;
  --el-ink-200: #c9d2cb;
  --font-display: 'Bungee', system-ui, sans-serif;
  --font-body: 'Poppins', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 22px;
  --radius-pill: 999px;
  --shadow-card: 0 2px 6px rgba(22,33,28,0.08), 0 10px 28px -8px rgba(22,33,28,0.16);

  min-height: 100vh;
  background: var(--el-cream-50);
  color: var(--el-ink-900);
  font-family: var(--font-body);
  line-height: 1.45;
  padding-bottom: 32px;
}

.pe420-root * {
  box-sizing: border-box;
}

.pe420-header {
  background: linear-gradient(155deg, var(--el-emerald-950) 0%, var(--el-emerald-800) 60%, var(--el-emerald-600) 100%);
  color: var(--el-cream-50);
  padding: 26px 24px;
  border-bottom: 3px solid var(--el-gold-500);
}

.pe420-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.pe420-eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--el-gold-300);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pe420-privacy-pill {
  background: rgba(61,191,141,0.2);
  border: 1px solid var(--el-emerald-400);
  color: #fff;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 10px;
  letter-spacing: 0.5px;
}

.pe420-header h1 {
  font-family: var(--font-display);
  font-size: 24px;
  margin: 6px 0 4px;
  letter-spacing: 0.4px;
  color: var(--el-cream-50);
}

.pe420-header p {
  margin: 0;
  font-size: 13px;
  color: var(--el-emerald-100);
}

.pe420-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pe420-btn {
  font-family: var(--font-body);
  font-size: 12.5px;
  font-weight: 700;
  padding: 9px 16px;
  border-radius: var(--radius-pill);
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
}

.pe420-btn-gold {
  background: var(--el-gold-500);
  color: var(--el-onyx-950);
}
.pe420-btn-gold:hover {
  background: var(--el-gold-300);
  transform: translateY(-1px);
}

.pe420-btn-emerald {
  background: var(--el-emerald-400);
  color: var(--el-onyx-950);
}
.pe420-btn-emerald:hover {
  background: #5ad3a2;
  transform: translateY(-1px);
}

.pe420-btn-outline {
  background: rgba(255,255,255,0.12);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
}
.pe420-btn-outline:hover {
  background: rgba(255,255,255,0.22);
}

.pe420-guest-banner {
  max-width: 1400px;
  margin: 20px auto 0;
  padding: 0 20px;
}

.pe420-guest-card {
  background: linear-gradient(135deg, #072a20 0%, #0d4f38 100%);
  color: #faf6ec;
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  border: 2px solid var(--el-gold-500);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.pe420-workspace {
  max-width: 1400px;
  margin: 24px auto 48px;
  padding: 0 20px;
  display: grid;
  grid-template-columns: 470px 1fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 1060px) {
  .pe420-workspace {
    grid-template-columns: 1fr;
  }
}

.pe420-panel {
  background: var(--el-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 22px;
  border: 1px solid rgba(22,33,28,0.08);
}

.pe420-panel-title {
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--el-emerald-800);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 2px dashed var(--el-gold-300);
}

.pe420-preset-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 18px;
}

.pe420-preset-btn {
  background: var(--el-cream-50);
  border: 1.5px solid var(--el-ink-200);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.15s ease;
}

.pe420-preset-btn:hover,
.pe420-preset-btn.active {
  background: var(--el-emerald-100);
  border-color: var(--el-emerald-600);
}

.pe420-preset-btn strong {
  display: block;
  font-size: 12px;
  color: var(--el-emerald-950);
}

.pe420-preset-btn span {
  font-size: 10.5px;
  color: var(--el-ink-500);
}

.pe420-form-group {
  margin-bottom: 12px;
}

.pe420-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.pe420-label {
  display: block;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--el-ink-700);
  margin-bottom: 4px;
}

.pe420-input,
.pe420-select,
.pe420-textarea {
  width: 100%;
  padding: 8px 11px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--el-ink-200);
  font-family: var(--font-body);
  font-size: 12.5px;
  color: var(--el-ink-900);
  background: var(--el-cream-50);
}

.pe420-input:disabled,
.pe420-select:disabled,
.pe420-textarea:disabled {
  opacity: 0.72;
  cursor: not-allowed;
  background: #f0ece1;
}

.pe420-textarea {
  resize: vertical;
  min-height: 56px;
}

.pe420-input:focus,
.pe420-select:focus,
.pe420-textarea:focus {
  outline: none;
  border-color: var(--el-emerald-600);
  background: #fff;
}

.pe420-chip-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.pe420-chip {
  font-size: 10px;
  background: var(--el-emerald-100);
  color: var(--el-emerald-950);
  border: 1px solid var(--el-emerald-400);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  cursor: pointer;
  font-weight: 600;
}

.pe420-chip:hover {
  background: var(--el-emerald-600);
  color: #fff;
}

.pe420-auditor-box {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
}

.pe420-auditor-ok {
  background: var(--el-emerald-100);
  border-left: 4px solid var(--el-emerald-600);
  color: var(--el-emerald-950);
}

.pe420-auditor-warn {
  background: var(--el-terracotta-100);
  border-left: 4px solid var(--el-terracotta-600);
  color: var(--el-terracotta-700);
}

.pe420-auditor-box strong {
  display: block;
  margin-bottom: 4px;
  font-size: 12.5px;
}

.pe420-preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.pe420-norm-badge {
  display: inline-block;
  background: var(--el-gold-100);
  color: var(--el-gold-700);
  font-weight: 700;
  font-size: 11px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--el-gold-300);
}

.pe420-sheets-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pe420-label-pair {
  background: #fff;
  border: 1px dashed #888;
  border-radius: 6px;
  padding: 12px;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 14px;
  page-break-inside: avoid;
}

@media (max-width: 720px) {
  .pe420-label-pair {
    grid-template-columns: 1fr;
  }
}

.pe420-label-front {
  background: var(--el-onyx-950);
  color: var(--el-cream-50);
  border-radius: 8px;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 2px solid var(--el-gold-500);
  position: relative;
  min-height: 235px;
}

.pe420-lf-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(240,200,105,0.3);
  padding-bottom: 6px;
}

.pe420-lf-brand {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--el-gold-300);
}

.pe420-lf-age {
  background: var(--el-terracotta-500);
  color: #fff;
  font-weight: 800;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
}

.pe420-lf-center {
  margin: 12px 0;
  text-align: center;
}

.pe420-lf-name {
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 1.15;
  color: #fff;
  margin: 0 0 6px;
  word-wrap: break-word;
}

.pe420-lf-generic {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-emerald-400);
  margin: 0 0 6px;
}

.pe420-lf-dose-box {
  margin-top: 9px;
  background: rgba(212,160,23,0.16);
  border: 1px solid var(--el-gold-500);
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 700;
  color: var(--el-gold-300);
}

.pe420-lf-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-top: 1px solid rgba(240,200,105,0.3);
  padding-top: 8px;
  gap: 6px;
}

.pe420-lf-via {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  background: var(--el-emerald-800);
  color: var(--el-emerald-100);
  padding: 3px 7px;
  border-radius: 3px;
}

.pe420-lf-net {
  font-size: 12.5px;
  font-weight: 800;
  color: #fff;
  font-family: var(--font-mono);
}

.pe420-label-back {
  background: var(--el-cream-50);
  color: var(--el-ink-900);
  border: 1.5px solid var(--el-ink-900);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 9.3px;
  line-height: 1.36;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.pe420-lb-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1.5px solid var(--el-ink-900);
  padding-bottom: 4px;
  margin-bottom: 6px;
  font-weight: 800;
  font-size: 9.5px;
  text-transform: uppercase;
}

.pe420-lb-section {
  margin-bottom: 5px;
}

.pe420-lb-section strong {
  text-transform: uppercase;
  font-size: 8.8px;
  letter-spacing: 0.3px;
  color: var(--el-emerald-950);
}

.pe420-lb-warn-box {
  background: #fff;
  border: 1px solid var(--el-ink-900);
  border-left: 4px solid var(--el-terracotta-600);
  padding: 5px 7px;
  margin: 5px 0;
  font-size: 8.7px;
}

.pe420-lb-warn-box strong {
  color: var(--el-terracotta-700);
  display: block;
  margin-bottom: 2px;
}

.pe420-lb-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-top: 1px solid var(--el-ink-700);
  padding-top: 5px;
  margin-top: 4px;
  gap: 10px;
}

.pe420-lb-meta {
  font-family: var(--font-mono);
  font-size: 8.8px;
  font-weight: 700;
}

.pe420-lb-origin {
  font-size: 8.2px;
  color: var(--el-ink-700);
}

.pe420-share-banner {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #dff5ea 0%, #fbeecb 100%);
  border: 1.5px solid var(--el-emerald-600);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pe420-footer {
  max-width: 1400px;
  margin: 0 auto 36px;
  padding: 0 20px;
  text-align: center;
  font-size: 11.5px;
  color: var(--el-ink-500);
}

@media print {
  body {
    background: #fff !important;
  }
  .no-print,
  .pe420-header,
  .pe420-footer,
  .pe420-guest-banner,
  .pe420-share-banner {
    display: none !important;
  }
  .pe420-root {
    background: #fff !important;
    padding: 0 !important;
    min-height: auto !important;
  }
  .pe420-workspace {
    display: block;
    margin: 0;
    padding: 0;
    max-width: 100%;
  }
  .pe420-panel {
    box-shadow: none;
    border: none;
    padding: 0;
  }
  .pe420-label-pair {
    border: 1px dashed #999;
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .pe420-label-front,
  .pe420-label-back {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

const Etiquetas = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const esMiembro = Boolean(user);

  const [presetActivo, setPresetActivo] = useState('unguento');
  const [datos, setDatos] = useState(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) {
        return sanitizarDatosEtiqueta(JSON.parse(guardado));
      }
    } catch { /* sin storage */ }
    return { ...PRESETS.unguento };
  });

  // Modal de bloqueo para visitantes sin cuenta
  const [modalAccesoAbierto, setModalAccesoAbierto] = useState(false);
  const [motivoAcceso, setMotivoAcceso] = useState('');

  // Modal para compartir etiqueta como post en el Feed de WeedTown
  const [modalCompartirAbierto, setModalCompartirAbierto] = useState(false);
  const [pngPreviewUrl, setPngPreviewUrl] = useState('');
  const [pngFile, setPngFile] = useState(null);
  const [postContent, setPostContent] = useState('');
  const [postHashtags, setPostHashtags] = useState('');
  const [postVisibility, setPostVisibility] = useState('PUBLIC');
  const [generandoPng, setGenerandoPng] = useState(false);
  const [publicandoPost, setPublicandoPost] = useState(false);
  const [errorCompartir, setErrorCompartir] = useState('');
  const [postCreado, setPostCreado] = useState(null);
  const [avisoImportacion, setAvisoImportacion] = useState('');

  // Guardar borrador automáticamente en localStorage solo cuando es miembro
  useEffect(() => {
    if (!esMiembro) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
    } catch { /* modo privado */ }
  }, [datos, esMiembro]);

  const auditoria = auditarEtiqueta(datos);

  const pedirCuentaWeedTown = (accion) => {
    setMotivoAcceso(accion);
    setModalAccesoAbierto(true);
  };

  const irALoginWeedTown = () => {
    const destino = urlLoginParaEtiquetas(window.location.hostname);
    if (destino.startsWith('http')) {
      window.location.href = destino;
    } else {
      navigate(destino);
    }
  };

  const cargarPreset = (key) => {
    const p = PRESETS[key];
    if (!p) return;
    setPresetActivo(key);
    setDatos( prev => ({ ...p, copias: prev.copias || 3 }));
  };

  const actualizarCampo = (campo, valor) => {
    if (!esMiembro) {
      pedirCuentaWeedTown('personalizar los datos de tu etiqueta');
      return;
    }
    setDatos(prev => ({
      ...prev,
      [campo]: campo === 'copias' ? ( parseInt(valor, 10) || 1 ) : valor
    }));
  };

  const handleInsertarIngrediente = (ingrediente) => {
    if (!esMiembro) {
      pedirCuentaWeedTown('agregar ingredientes a la receta');
      return;
    }
    setDatos(prev => ({
      ...prev,
      ingredientes: insertarIngredienteEnLista(prev.ingredientes, ingrediente)
    }));
  };

  const handleNuevoLote = () => {
    if (!esMiembro) {
      pedirCuentaWeedTown('generar códigos de lote para tu taller');
      return;
    }
    setDatos(prev => ({
      ...prev,
      lote: generarCodigoLote(prev.nombre)
    }));
  };

  const handleExportarJSON = () => {
    if (!esMiembro) {
      pedirCuentaWeedTown('descargar y respaldar tus recetas en JSON');
      return;
    }
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiqueta_${(datos.lote || 'pe420').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClickImportar = () => {
    if (!esMiembro) {
      pedirCuentaWeedTown('cargar plantillas o recetas guardadas');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportarJSON = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        setDatos(sanitizarDatosEtiqueta(parsed));
        setAvisoImportacion('');
      } catch {
        setAvisoImportacion('El archivo seleccionado no es un JSON de etiqueta válido.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleImprimir = () => {
    if (!esMiembro) {
      pedirCuentaWeedTown('imprimir hojas tamaño Carta listas para recorte o papel adhesivo');
      return;
    }
    window.print();
  };

  const handleAbrirCompartirEnFeed = async () => {
    if (!esMiembro) {
      pedirCuentaWeedTown('compartir tu etiqueta como publicación en el feed de WeedTown');
      return;
    }
    setErrorCompartir('');
    setPostCreado(null);
    setGenerandoPng(true);
    setModalCompartirAbierto(true);
    const sugerido = armarTextoPostEtiqueta(datos);
    setPostContent(sugerido.content);
    setPostHashtags(sugerido.hashtags);
    setPostVisibility('PUBLIC');

    try {
      const { file, dataUrl } = await renderizarEtiquetaPng(datos);
      setPngFile(file);
      setPngPreviewUrl(dataUrl);
    } catch {
      setErrorCompartir('No se pudo renderizar la imagen de la etiqueta en tu navegador.');
    } finally {
      setGenerandoPng(false);
    }
  };

  const handleDescargarPng = () => {
    if (!pngPreviewUrl) return;
    const a = document.createElement('a');
    a.href = pngPreviewUrl;
    a.download = `etiqueta_${(datos.lote || 'pe420').toLowerCase()}.png`;
    a.click();
  };

  const handlePublicarEnWeedTown = async (e) => {
    e.preventDefault();
    if (!pngFile) return;
    setErrorCompartir('');
    setPublicandoPost(true);
    try {
      const form = new FormData();
      form.append('image', pngFile);
      const uploadRes = await api.post('/media/upload', form);
      const imageUrl = uploadRes.data.url;

      const tags = postHashtags.split(/[ ,#]+/).filter(Boolean).slice(0, 10);
      const res = await api.post('/posts', {
        content: postContent,
        image: imageUrl,
        hashtags: tags,
        visibility: postVisibility
      });
      setPostCreado(res.data);
    } catch (err) {
      setErrorCompartir(err.response?.data?.error || 'No se pudo publicar la etiqueta en tu feed.');
    } finally {
      setPublicandoPost(false);
    }
  };

  const copiasVisibles = esMiembro ? (datos.copias || 1) : 1;

  return (
    <div className="pe420-root">
      <style>{ESTILOS_ESTUDIO}</style>

      {/* Navegación de WeedTown (oculta al imprimir) */}
      <div className="no-print">
        {esMiembro ? (
          <Navbar />
        ) : (
          <Box
            component="nav"
            aria-label="Barra de acceso a WeedTown"
            sx={{
              bgcolor: '#0a0f0c',
              color: '#fff',
              py: 1.25,
              px: 2.5,
              borderBottom: '1px solid rgba(255,255,255,0.12)'
            }}
          >
            <Box
              sx={{
                maxWidth: 1400,
                mx: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5
              }}
            >
              <Box
                component="a"
                href={window.location.hostname === 'etkt420.weedtown.social' ? 'https://weedtown.social' : '/feed'}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}
              >
                <BrandMark size={32} />
                <BrandWordmark variant="subtitle1" />
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={irALoginWeedTown}
                  sx={{ borderColor: 'rgba(255,255,255,0.35)' }}
                >
                  Iniciar sesión
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  onClick={irALoginWeedTown}
                >
                  Crear cuenta en WeedTown
                </Button>
              </Stack>
            </Box>
          </Box>
        )}
      </div>

      {/* Header del Estudio de Etiquetado */}
      <header className="pe420-header no-print">
        <div className="pe420-header-inner">
          <div>
            <span className="pe420-eyebrow">
              Weedtown.social × Protesta Económica 420
              <span className="pe420-privacy-pill">🔒 100% Local · Cero Rastreo</span>
            </span>
            <h1>Estudio de Etiquetado Artesanal &amp; Reducción de Riesgos</h1>
            <p>
              Genera, valida e imprime etiquetas técnicas para tópicos (NOM-141), herbolarios (NOM-072) y comestibles (NOM-051 + RRD)
            </p>
          </div>
          <div className="pe420-actions">
            <button
              type="button"
              className="pe420-btn pe420-btn-outline"
              onClick={handleNuevoLote}
              title="Genera código de lote con la fecha de hoy"
            >
              🔄 Nuevo Lote
            </button>
            <button
              type="button"
              className="pe420-btn pe420-btn-outline"
              onClick={handleExportarJSON}
              title="Descarga tu plantilla en archivo JSON"
            >
              💾 Guardar Receta
            </button>
            <button
              type="button"
              className="pe420-btn pe420-btn-outline"
              onClick={handleClickImportar}
              title="Carga una etiqueta guardada"
            >
              📂 Cargar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportarJSON}
            />
            <button
              type="button"
              className="pe420-btn pe420-btn-gold"
              onClick={handleImprimir}
            >
              🖨️ Imprimir Hoja Carta
            </button>
            <button
              type="button"
              className="pe420-btn pe420-btn-emerald"
              onClick={handleAbrirCompartirEnFeed}
            >
              🌿 Compartir en WeedTown
            </button>
          </div>
        </div>
      </header>

      {/* Banner informativo para visitantes sin cuenta */}
      {!authLoading && !esMiembro && (
        <section className="pe420-guest-banner no-print" aria-label="Información para visitantes sin sesión">
          <div className="pe420-guest-card">
            <div style={{ maxWidth: 840 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    background: '#d4a017',
                    color: '#0a0f0c',
                    fontWeight: 800,
                    fontSize: 11,
                    padding: '2px 10px',
                    borderRadius: 999,
                    textTransform: 'uppercase'
                  }}
                >
                  Herramienta para miembros de WeedTown
                </span>
                <span style={{ fontSize: 12, color: '#dff5ea' }}>
                  Modo demostración interactiva
                </span>
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#fff' }}>
                ¿Qué es el Estudio de Etiquetado Artesanal &amp; Reducción de Riesgos (PE420)?
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#dff5ea', lineHeight: 1.5 }}>
                Es un taller 100% privado en tu navegador para que productores artesanales de la comunidad diseñen etiquetas con{' '}
                <strong>Superficie Principal de Exhibición (NOM-030)</strong>, panel técnico de ingredientes INCI, auditor automático contra promesas médicas riesgosas ante{' '}
                <strong>COFEPRIS / PROFECO</strong> e impresión en hoja tamaño Carta.{' '}
                <strong>Explora los 4 casos preconfigurados abajo</strong>; para personalizar tu etiqueta, imprimirla o compartirla en el feed, inicia sesión con tu cuenta de WeedTown.
              </p>
            </div>
            <div>
              <button
                type="button"
                className="pe420-btn pe420-btn-gold"
                onClick={irALoginWeedTown}
                style={{ fontSize: 13.5, padding: '12px 22px' }}
              >
                🔑 Entrar / Crear cuenta para generar mi etiqueta
              </button>
            </div>
          </div>
        </section>
      )}

      <main className="pe420-workspace">
        {/* COLUMNA IZQUIERDA: CONFIGURADOR */}
        <section className="pe420-panel no-print">
          <h2 className="pe420-panel-title">1. Plantillas Rápidas por Caso</h2>
          <div className="pe420-preset-bar">
            {LISTA_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`pe420-preset-btn ${presetActivo === p.key ? 'active' : ''}`}
                onClick={() => cargarPreset(p.key)}
              >
                <strong>{p.titulo}</strong>
                <span>{p.subtitulo}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 className="pe420-panel-title" style={{ flex: 1 }}>2. Configura tu Etiqueta</h2>
          </div>

          {!esMiembro && (
            <div
              style={{
                background: '#fbeecb',
                border: '1px solid #d4a017',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: 12,
                color: '#16211c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap'
              }}
            >
              <span>
                🔒 <strong>Edición exclusiva para miembros:</strong> inicia sesión en WeedTown para personalizar los campos e imprimir tu etiqueta.
              </span>
              <button
                type="button"
                className="pe420-btn pe420-btn-gold"
                style={{ padding: '5px 12px', fontSize: 11.5 }}
                onClick={irALoginWeedTown}
              >
                Desbloquear con mi cuenta
              </button>
            </div>
          )}

          {avisoImportacion && (
            <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setAvisoImportacion('')}>
              {avisoImportacion}
            </Alert>
          )}

          <div className="pe420-form-row">
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fCategoria">Línea Regulatoria</label>
              <select
                id="fCategoria"
                className="pe420-select"
                value={datos.categoria}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('categoria', e.target.value)}
              >
                {CATEGORIAS_ETIQUETA.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fCopias">Etiquetas por Hoja al Imprimir</label>
              <select
                id="fCopias"
                className="pe420-select"
                value={datos.copias}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('copias', e.target.value)}
              >
                <option value={1}>1 par (Vista previa)</option>
                <option value={3}>3 pares por hoja Carta</option>
                <option value={4}>4 pares por hoja Carta</option>
              </select>
            </div>
          </div>

          <div className="pe420-form-row">
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fMarca">Marca o Taller Artesanal</label>
              <input
                type="text"
                id="fMarca"
                className="pe420-input"
                value={datos.marca}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('marca', e.target.value)}
              />
            </div>
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fContNeto">Contenido Neto (NOM-030: g o ml)</label>
              <input
                type="text"
                id="fContNeto"
                className="pe420-input"
                value={datos.contNeto}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('contNeto', e.target.value)}
              />
            </div>
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fNombre">Nombre Distintivo del Producto</label>
            <input
              type="text"
              id="fNombre"
              className="pe420-input"
              value={datos.nombre}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('nombre', e.target.value)}
            />
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fGenerico">Denominación Genérica Técnica</label>
            <input
              type="text"
              id="fGenerico"
              className="pe420-input"
              value={datos.generico}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('generico', e.target.value)}
            />
          </div>

          <div className="pe420-form-row">
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fDosis">Concentración / Dosis Destacada (Frente)</label>
              <input
                type="text"
                id="fDosis"
                className="pe420-input"
                value={datos.dosis}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('dosis', e.target.value)}
              />
            </div>
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fVia">Insignia de Vía / Alerta Frontal</label>
              <input
                type="text"
                id="fVia"
                className="pe420-input"
                value={datos.via}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('via', e.target.value)}
              />
            </div>
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fProposito">Propósito / Descripción (Auditado contra Claims Médicos)</label>
            <textarea
              id="fProposito"
              className="pe420-textarea"
              value={datos.proposito}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('proposito', e.target.value)}
            />
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fIngredientes">Ingredientes (Orden decreciente + Nombre Botánico / INCI)</label>
            <textarea
              id="fIngredientes"
              className="pe420-textarea"
              value={datos.ingredientes}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('ingredientes', e.target.value)}
            />
            <div className="pe420-chip-bar">
              {INGREDIENTES_RAPIDOS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="pe420-chip"
                  onClick={() => handleInsertarIngrediente(chip.valor)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fModoUso">Modo de Empleo y Reducción de Riesgos (RRD)</label>
            <textarea
              id="fModoUso"
              className="pe420-textarea"
              value={datos.modoUso}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('modoUso', e.target.value)}
            />
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fAdvertencias">Leyendas Precautorias y Advertencias Sanitarias (+18)</label>
            <textarea
              id="fAdvertencias"
              className="pe420-textarea"
              value={datos.advertencias}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('advertencias', e.target.value)}
            />
          </div>

          <div className="pe420-form-row">
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fLote">Número de Lote (NOM-259)</label>
              <input
                type="text"
                id="fLote"
                className="pe420-input"
                value={datos.lote}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('lote', e.target.value)}
              />
            </div>
            <div className="pe420-form-group">
              <label className="pe420-label" htmlFor="fCaducidad">Consumo Preferente / Caducidad</label>
              <input
                type="text"
                id="fCaducidad"
                className="pe420-input"
                value={datos.caducidad}
                disabled={!esMiembro}
                onChange={(e) => actualizarCampo('caducidad', e.target.value)}
              />
            </div>
          </div>

          <div className="pe420-form-group">
            <label className="pe420-label" htmlFor="fElaborador">Origen / Taller Productor (Sin nombres de A.C.)</label>
            <input
              type="text"
              id="fElaborador"
              className="pe420-input"
              value={datos.elaborador}
              disabled={!esMiembro}
              onChange={(e) => actualizarCampo('elaborador', e.target.value)}
            />
          </div>

          {/* AUDITOR EN TIEMPO REAL */}
          <div
            role="status"
            aria-live="polite"
            className={`pe420-auditor-box ${auditoria.optimo ? 'pe420-auditor-ok' : 'pe420-auditor-warn'}`}
          >
            {auditoria.optimo ? (
              <>
                <strong>✅ Semáforo Regulatorio COFEPRIS / PROFECO: ÓPTIMO</strong>
                <span>Etiqueta limpia de claims médicos riesgosos y con unidades NOM-030 válidas.</span>
              </>
            ) : (
              <>
                <strong>⚠️ Alerta del Auditor Regulatorio ({auditoria.alertas.length} observación/es):</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {auditoria.alertas.map((a, idx) => (
                    <li key={idx}>
                      <strong>{a.motivo}</strong> <em>{a.sugerencia}</em>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        {/* COLUMNA DERECHA: VISTA PREVIA E IMPRESIÓN */}
        <section className="pe420-panel">
          <div className="pe420-preview-toolbar no-print">
            <div>
              <h2 className="pe420-panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>
                {esMiembro
                  ? 'Hoja de Impresión (Frente SPE + Reverso Técnico)'
                  : 'Vista Previa de Demostración (Frente SPE + Reverso Técnico)'}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--el-ink-500)' }}>
                {esMiembro
                  ? 'Imprime en papel adhesivo tamaño Carta o recorta por la línea punteada.'
                  : 'Inicia sesión en WeedTown para personalizar esta etiqueta, imprimir tu hoja Carta o compartirla en el feed.'}
              </span>
            </div>
            <span className="pe420-norm-badge">
              {BADGE_NORMA[datos.categoria] || ''}
            </span>
          </div>

          {/* En impresión física (@media print), solo los miembros autenticados imprimen la hoja */}
          {!esMiembro ? (
            <>
              <div className="pe420-sheets-container no-print">
                <div className="pe420-label-pair">
                  <div className="pe420-label-front">
                    <div className="pe420-lf-top">
                      <span className="pe420-lf-brand">{datos.marca}</span>
                      <span className="pe420-lf-age">+18 ADULTO</span>
                    </div>
                    <div className="pe420-lf-center">
                      <h3 className="pe420-lf-name">{datos.nombre}</h3>
                      <p className="pe420-lf-generic">{datos.generico}</p>
                      <div className="pe420-lf-dose-box">{datos.dosis}</div>
                    </div>
                    <div className="pe420-lf-bottom">
                      <span className="pe420-lf-via">{datos.via}</span>
                      <span className="pe420-lf-net">{datos.contNeto}</span>
                    </div>
                  </div>

                  <div className="pe420-label-back">
                    <div>
                      <div className="pe420-lb-header">
                        <span>INFORMACIÓN TÉCNICA Y DE REDUCCIÓN DE RIESGOS</span>
                        <span>EXCLUSIVO +18 AÑOS</span>
                      </div>
                      <div className="pe420-lb-section">
                        <strong>DESCRIPCIÓN:</strong> {datos.proposito}
                      </div>
                      <div className="pe420-lb-section">
                        <strong>INGREDIENTES:</strong> {datos.ingredientes}
                      </div>
                      <div className="pe420-lb-section">
                        <strong>MODO DE EMPLEO / USO RESPONSABLE:</strong> {datos.modoUso}
                      </div>
                      <div className="pe420-lb-warn-box">
                        <strong>⚠️ PRECAUCIONES Y ADVERTENCIAS SANITARIAS:</strong>
                        {datos.advertencias}
                      </div>
                    </div>
                    <div className="pe420-lb-footer">
                      <div>
                        <div className="pe420-lb-origin">{datos.elaborador}</div>
                        <div className="pe420-lb-origin">Consérvese bien cerrado en lugar fresco, seco y oscuro.</div>
                      </div>
                      <div className="pe420-lb-meta" style={{ textAlign: 'right' }}>
                        <div>LOTE: {datos.lote}</div>
                        <div>CAD / CONS. PREF.: {datos.caducidad}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="pe420-sheets-container" id="sheetsContainer">
              {Array.from({ length: copiasVisibles }).map((_, idx) => (
                <div className="pe420-label-pair" key={idx}>
                  <div className="pe420-label-front">
                    <div className="pe420-lf-top">
                      <span className="pe420-lf-brand">{datos.marca}</span>
                      <span className="pe420-lf-age">+18 ADULTO</span>
                    </div>
                    <div className="pe420-lf-center">
                      <h3 className="pe420-lf-name">{datos.nombre}</h3>
                      <p className="pe420-lf-generic">{datos.generico}</p>
                      <div className="pe420-lf-dose-box">{datos.dosis}</div>
                    </div>
                    <div className="pe420-lf-bottom">
                      <span className="pe420-lf-via">{datos.via}</span>
                      <span className="pe420-lf-net">{datos.contNeto}</span>
                    </div>
                  </div>

                  <div className="pe420-label-back">
                    <div>
                      <div className="pe420-lb-header">
                        <span>INFORMACIÓN TÉCNICA Y DE REDUCCIÓN DE RIESGOS</span>
                        <span>EXCLUSIVO +18 AÑOS</span>
                      </div>
                      <div className="pe420-lb-section">
                        <strong>DESCRIPCIÓN:</strong> {datos.proposito}
                      </div>
                      <div className="pe420-lb-section">
                        <strong>INGREDIENTES:</strong> {datos.ingredientes}
                      </div>
                      <div className="pe420-lb-section">
                        <strong>MODO DE EMPLEO / USO RESPONSABLE:</strong> {datos.modoUso}
                      </div>
                      <div className="pe420-lb-warn-box">
                        <strong>⚠️ PRECAUCIONES Y ADVERTENCIAS SANITARIAS:</strong>
                        {datos.advertencias}
                      </div>
                    </div>
                    <div className="pe420-lb-footer">
                      <div>
                        <div className="pe420-lb-origin">{datos.elaborador}</div>
                        <div className="pe420-lb-origin">Consérvese bien cerrado en lugar fresco, seco y oscuro.</div>
                      </div>
                      <div className="pe420-lb-meta" style={{ textAlign: 'right' }}>
                        <div>LOTE: {datos.lote}</div>
                        <div>CAD / CONS. PREF.: {datos.caducidad}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bloque de invitación a compartir en el Feed de WeedTown */}
          <div className="pe420-share-banner no-print">
            <div style={{ maxWidth: 560 }}>
              <strong style={{ display: 'block', fontSize: 13.5, color: '#072a20' }}>
                🌿 ¿Lista tu etiqueta? Compártela con la comunidad de WeedTown
              </strong>
              <span style={{ fontSize: 12, color: '#35443c' }}>
                Genera una imagen de alta nitidez (Frente + Reverso) en tu propio navegador y publícala en el feed para recibir retroalimentación de otros talleres y productores artesanales.
              </span>
            </div>
            <button
              type="button"
              className="pe420-btn pe420-btn-emerald"
              onClick={handleAbrirCompartirEnFeed}
              style={{ background: '#0d4f38', color: '#fff' }}
            >
              🌿 Compartir como Post en WeedTown
            </button>
          </div>
        </section>
      </main>

      <footer className="pe420-footer no-print">
        <strong>Weedtown.social × Protesta Económica 420 (PE420)</strong> — Herramienta de Autogestión y Reducción de Riesgos para Productores Artesanales.<br />
        Todo el procesamiento ocurre localmente en tu navegador (<code>localStorage</code>). Ningún dato de tu taller o receta se envía a servidores externos.
      </footer>

      {/* Modal para visitantes sin cuenta */}
      <Dialog
        open={modalAccesoAbierto}
        onClose={() => setModalAccesoAbierto(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="pe420-auth-dialog-title"
      >
        <DialogTitle id="pe420-auth-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockOutlinedIcon color="primary" /> Exclusivo para miembros de WeedTown
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2">
              Para <strong>{motivoAcceso || 'generar e imprimir tu etiqueta'}</strong>, necesitas iniciar sesión con tu cuenta de WeedTown.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              El registro es gratuito, sin contraseñas (por correo con enlace mágico, llave de acceso o Mastodon) y tus recetas permanecen 100% guardadas en tu propio navegador.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setModalAccesoAbierto(false)} color="secondary">
            Seguir viendo demo
          </Button>
          <Button variant="contained" onClick={irALoginWeedTown}>
            Entrar o crear cuenta
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal para compartir la etiqueta como publicación en el Feed */}
      <Dialog
        open={modalCompartirAbierto}
        onClose={() => !publicandoPost && setModalCompartirAbierto(false)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="pe420-share-dialog-title"
      >
        <form onSubmit={handlePublicarEnWeedTown}>
          <DialogTitle id="pe420-share-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShareIcon color="primary" /> Compartir etiqueta en el Feed de WeedTown
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {generandoPng ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : pngPreviewUrl ? (
                <Box>
                  <Box
                    component="img"
                    src={pngPreviewUrl}
                    alt={`Vista previa de etiqueta ${datos.nombre}`}
                    sx={{
                      width: '100%',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'block'
                    }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.75 }}>
                    <Button
                      size="small"
                      startIcon={<DownloadIcon />}
                      onClick={handleDescargarPng}
                    >
                      Descargar PNG en mi equipo
                    </Button>
                  </Box>
                </Box>
              ) : null}

              {postCreado ? (
                <Alert
                  severity="success"
                  action={
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        color="inherit"
                        component={RouterLink}
                        to={`/p/${postCreado.id}`}
                      >
                        Ver posteo
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        component={RouterLink}
                        to="/feed"
                      >
                        Ir al feed
                      </Button>
                    </Stack>
                  }
                >
                  ¡Tu etiqueta ya se publicó en el feed de WeedTown!
                </Alert>
              ) : (
                <>
                  <MentionInput
                    label="Mensaje para la comunidad"
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    required
                    multiline
                    minRows={3}
                    fullWidth
                  />
                  <TextField
                    label="Hashtags"
                    value={postHashtags}
                    onChange={(e) => setPostHashtags(e.target.value)}
                    fullWidth
                    helperText="Separados por espacios o comas, sin #"
                  />
                  <ToggleButtonGroup
                    value={postVisibility}
                    exclusive
                    size="small"
                    onChange={(_, val) => val && setPostVisibility(val)}
                    aria-label="Quién puede ver este posteo"
                  >
                    <ToggleButton value="PUBLIC" aria-label="Público">
                      <PublicIcon fontSize="small" sx={{ mr: 0.75 }} /> Público
                    </ToggleButton>
                    <ToggleButton value="FRIENDS" aria-label="Solo amigos">
                      <PeopleAltIcon fontSize="small" sx={{ mr: 0.75 }} /> Solo amigos
                    </ToggleButton>
                  </ToggleButtonGroup>
                </>
              )}

              {errorCompartir && <Alert severity="error" role="alert">{errorCompartir}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setModalCompartirAbierto(false)}
              color="secondary"
              disabled={publicandoPost}
            >
              {postCreado ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!postCreado && (
              <Button
                type="submit"
                variant="contained"
                disabled={generandoPng || publicandoPost || !pngFile}
              >
                {publicandoPost ? 'Publicando…' : 'Publicar en el Feed'}
              </Button>
            )}
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
};

export default Etiquetas;
