import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Container, Card, CardContent, Typography, Stack, Divider, Box, Link } from '@mui/material';
import Navbar from '../components/Navbar';
import ConsentimientosPanel from '../components/ConsentimientosPanel';
import AccountPrivacy from '../components/AccountPrivacy';
import { useAuth } from '../hooks/useAuth';
import { fechaLarga } from '../lib/terminos';

// «Mis decisiones de privacidad» (ciclo 20). El lugar donde la persona ve qué
// aceptó, qué no, y lo cambia cuando quiera.
//
// Tres capas, en este orden y con estas palabras a propósito (el principio del
// PO: congruentes con los principios y, cuando haya que ser flexibles, claros):
//   1. La BASE: lo único que se exige, y qué es exactamente.
//   2. Lo OPCIONAL: apagado por defecto, una decisión por finalidad.
//   3. Tus DATOS: descargarlos o eliminar la cuenta.
const Privacidad = () => {
  const { user } = useAuth();
  const aceptada = user?.terminosAceptadosEn ? fechaLarga(String(user.terminosAceptadosEn).slice(0, 10)) : null;

  return (
    <>
      <Navbar />
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
                  Mis decisiones de privacidad
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tus datos, tus decisiones. Te pedimos la menor cantidad posible para operar la red, y para todo lo
                  demás te explicamos para qué y cómo se tratará antes de pedirte permiso. Puedes cambiar de opinión
                  cuando quieras.
                </Typography>
              </Box>

              <Box component="section" aria-labelledby="capa-base">
                <Typography id="capa-base" variant="h6" component="h2" fontWeight="bold" gutterBottom>
                  Lo necesario para operar la red
                </Typography>
                <Typography variant="body2" paragraph>
                  Es lo único que se exige: aceptar los <Link component={RouterLink} to="/terms" color="primary">Términos</Link> y entrar en un{' '}
                  <strong>medidor general y anónimo</strong> de cuántas personas usan WeedTown cada día. De tu cuenta
                  guardamos <strong>solo la fecha del último día que entraste</strong>, sin hora ni páginas, y esa fecha
                  se sobrescribe cada día.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {user?.terminosVersion
                    ? `Aceptaste la versión ${user.terminosVersion}${aceptada ? ` el ${aceptada}` : ''}.`
                    : 'Todavía no has aceptado la versión vigente.'}
                </Typography>
              </Box>

              <Divider />

              <Box component="section" aria-labelledby="capa-opcional">
                <Typography id="capa-opcional" variant="h6" component="h2" fontWeight="bold" gutterBottom>
                  Lo opcional
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Todo está apagado hasta que tú lo enciendas. Nada de esto es necesario para usar WeedTown.
                </Typography>
                <ConsentimientosPanel />
              </Box>

              <Divider />

              <Box component="section" aria-labelledby="capa-datos">
                <Typography id="capa-datos" variant="h6" component="h2" fontWeight="bold" gutterBottom>
                  Tus datos
                </Typography>
                <AccountPrivacy />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </>
  );
};

export default Privacidad;
