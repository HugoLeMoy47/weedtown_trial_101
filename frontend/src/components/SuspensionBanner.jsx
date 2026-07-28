import React from 'react';
import { Alert, AlertTitle, Container } from '@mui/material';
import { useAuth } from '../hooks/useAuth';

const MOTIVO_TEXTO = {
  SPAM: 'Spam o publicación repetitiva',
  ACOSO: 'Acoso o ataque personal',
  ODIO: 'Discurso de odio o discriminación',
  ILEGAL: 'Actividad ilegal',
  DESINFORMACION: 'Desinformación que pone en riesgo la salud',
  SEXUAL: 'Contenido sexual no solicitado',
  SUPLANTACION: 'Suplantación de identidad',
  OTRO: 'Incumplimiento de las normas de la comunidad'
};

// Aviso permanente mientras dure una suspensión.
//
// Se muestra porque la alternativa es peor: que la persona intente publicar y
// reciba un error suelto sin entender por qué. Decir el motivo y la fecha es lo
// que convierte la sanción en algo corregible en vez de arbitrario.
const SuspensionBanner = () => {
  const { user } = useAuth();
  if (!user?.suspendedUntil) return null;

  const hasta = new Date(user.suspendedUntil);
  if (hasta <= new Date()) return null;

  return (
    <Container maxWidth="md" sx={{ pt: 2 }}>
      <Alert severity="warning" role="alert">
        <AlertTitle>Tu cuenta está suspendida temporalmente</AlertTitle>
        Motivo: <strong>{MOTIVO_TEXTO[user.suspendedReason] || 'Incumplimiento de las normas'}</strong>.
        <br />
        Hasta el {hasta.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}. Mientras tanto
        puedes seguir leyendo la comunidad, pero no publicar, comentar, chatear ni mandar toques. La suspensión
        se levanta sola.
      </Alert>
    </Container>
  );
};

export default SuspensionBanner;
