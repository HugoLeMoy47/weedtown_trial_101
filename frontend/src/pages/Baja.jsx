import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Container, Card, CardContent, Typography, Stack, Button, CircularProgress, Alert, Link } from '@mui/material';
import api from '../services/api';
import { leerTokenDeBaja } from '../lib/baja';

// Baja en un clic (ciclo 22, B25). Página PÚBLICA: no pide sesión, porque quien llega
// desde un correo no necesariamente la tiene abierta.
//
// UN CLIC PARA LA PERSONA, UN POST PARA EL SERVIDOR. Al cargar, la página pide la baja
// con el token del enlace. Es un POST y no un GET porque los antivirus y los clientes de
// correo «visitan» los enlaces: con un GET, una visita bastaría para dar de baja a
// alguien sin que lo pidiera. (Si un escáner con navegador completo ejecutara esta
// página, el error cae del lado seguro: se dejaría de escribir a alguien, no al revés.)
//
// Lo que NO hace: no reactiva nada. Volver a activar una finalidad exige iniciar sesión
// y decidirlo en «Mis decisiones de privacidad»: un enlace de un correo viejo no debería
// poder volver a suscribir a nadie.
const Baja = () => {
  const { search } = useLocation();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | invalido | error
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    const token = leerTokenDeBaja(search);
    if (!token) { setEstado('invalido'); return undefined; }
    let vivo = true;
    api.post('/baja', null, { params: { token } })
      .then(res => { if (vivo) { setTitulo(res.data?.titulo || ''); setEstado('listo'); } })
      .catch(e => { if (vivo) setEstado(e.response?.status === 400 ? 'invalido' : 'error'); });
    return () => { vivo = false; };
  }, [search]);

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack spacing={2} role="status" aria-live="polite">
            {estado === 'cargando' && (
              <Stack direction="row" spacing={2} alignItems="center">
                <CircularProgress size={24} aria-label="Procesando tu baja" />
                <Typography>Procesando tu baja…</Typography>
              </Stack>
            )}

            {estado === 'listo' && (
              <>
                <Typography variant="h5" component="h1" fontWeight="bold">Listo: ya no te escribiremos</Typography>
                <Typography variant="body1">
                  {titulo ? <>Apagamos <strong>«{titulo}»</strong> en tu cuenta.</> : 'Apagamos esa opción en tu cuenta.'} No recibirás más correos de ese tipo.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tu cuenta sigue igual: esto no cierra ni cambia nada más. Si fue un error, puedes volver a activarlo
                  cuando quieras en <Link component={RouterLink} to="/privacidad" color="primary">Mis decisiones de privacidad</Link>{' '}
                  (necesitas iniciar sesión).
                </Typography>
              </>
            )}

            {estado === 'invalido' && (
              <>
                <Typography variant="h5" component="h1" fontWeight="bold">Este enlace no es válido</Typography>
                <Alert severity="warning">
                  Puede estar incompleto o alterado. Cópialo de nuevo desde el correo, o entra a tus decisiones de
                  privacidad para apagar lo que quieras.
                </Alert>
                <Button component={RouterLink} to="/privacidad" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                  Mis decisiones de privacidad
                </Button>
              </>
            )}

            {estado === 'error' && (
              <>
                <Typography variant="h5" component="h1" fontWeight="bold">No pudimos procesar tu baja</Typography>
                <Alert severity="error">
                  Algo falló de nuestro lado. Vuelve a abrir el enlace en unos minutos, o apaga la opción en{' '}
                  <Link component={RouterLink} to="/privacidad" color="inherit" underline="always">Mis decisiones de privacidad</Link>.
                </Alert>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
};

export default Baja;
