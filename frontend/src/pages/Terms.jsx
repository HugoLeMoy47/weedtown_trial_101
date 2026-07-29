import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Container, Card, CardContent, Typography, Tabs, Tab, Button, Stack,
  Divider, Alert, Chip, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShieldIcon from '@mui/icons-material/Shield';
import LockIcon from '@mui/icons-material/Lock';
import GavelIcon from '@mui/icons-material/Gavel';
import SpaIcon from '@mui/icons-material/Spa';
import BalanceIcon from '@mui/icons-material/Balance';
import { BrandMark, BrandWordmark } from '../components/BrandLogo';
import Footer from '../components/Footer';

const TabPanel = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index} id={`terms-tabpanel-${index}`}>
    {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
  </div>
);

const Terms = () => {
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Container maxWidth="md" sx={{ pt: 4, pb: 6, flexGrow: 1 }}>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button
              component={RouterLink}
              to="/login"
              startIcon={<ArrowBackIcon />}
              color="secondary"
            >
              Volver
            </Button>
            <Stack direction="row" spacing={1} alignItems="center">
              <BrandMark size={36} />
              <BrandWordmark variant="h6" />
            </Stack>
          </Box>

          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Stack spacing={2} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="h4" component="h1" fontWeight="bold">
                    Marco Legal y Gobernanza
                  </Typography>
                  <Chip icon={<SpaIcon />} label="Comunidad WeedTown" color="primary" size="small" />
                  <Chip icon={<ShieldIcon />} label="Blindaje Penal y LFPDPPP" color="secondary" variant="outlined" size="small" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Este documento rige la protección jurídica, la privacidad de datos personales y las normas de gobernanza comunitarias en WeedTown.
                </Typography>
              </Stack>

              <Paper variant="outlined" sx={{ bgcolor: 'action.hover' }}>
                <Tabs
                  value={tabValue}
                  onChange={(e, newValue) => setTabValue(newValue)}
                  variant="scrollable"
                  scrollButtons="auto"
                  aria-label="Pestañas de términos y privacidad"
                >
                  <Tab icon={<GavelIcon />} iconPosition="start" label="Términos y Condiciones" />
                  <Tab icon={<LockIcon />} iconPosition="start" label="Política de Privacidad" />
                  <Tab icon={<ShieldIcon />} iconPosition="start" label="Normas de Convivencia" />
                  <Tab icon={<BalanceIcon />} iconPosition="start" label="Cómo Funciona la Moderación" />
                </Tabs>
              </Paper>

              {/* TAB 1: Términos y Condiciones */}
              <TabPanel value={tabValue} index={0}>
                <Stack spacing={3}>
                  <Alert severity="warning">
                    <strong>Aviso de Mayoría de Edad (18+):</strong> El acceso a WeedTown está estrictamente reservado a personas mayores de 18 años en cumplimiento con la legislación mexicana aplicable.
                  </Alert>

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      1. Operación por Colectivo Comunitario
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      WeedTown es administrado por un Colectivo Comunitario Independiente como un espacio libre de estigma orientado a la difusión cultural, educación, reducción de riesgos y encuentro social de la comunidad cannábica en México.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold" color="error.main">
                      2. Cero Tolerancia a Sustancias e Intermediación Indirecta
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      En cumplimiento con la Ley General de Salud y el Código Penal Federal de México, <strong>está prohibido</strong> utilizar cualquier canal de WeedTown para la oferta, demanda, donación o compraventa de sustancias controladas.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      <strong>Prohibición de Intermediación Indirecta:</strong> Queda prohibido cualquier intento de coordinar, facilitar o enlazar a terceros para actividades ilícitas fuera de la plataforma, aun cuando la transacción final ocurra de forma externa.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      3. Moderación Reactiva, Privacidad y Cooperación Mínima
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      * <strong>Moderación Reactiva, No Proactiva:</strong> WeedTown no realiza monitoreo proactivo ni análisis automatizado sobre mensajes o comunicaciones privadas. La moderación opera exclusivamente por reportes comunitarios.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      * <strong>Comunicaciones Privadas:</strong> La Plataforma no tiene acceso técnico al contenido de chats privados 1-a-1 y no asume responsabilidad por acuerdos privados entre usuarios.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      * <strong>Cooperación Mínima con Autoridad:</strong> Se atenderán únicamente mandatos judiciales válidos entregando la información mínima indispensable que exista, sin generar datos nuevos ni reconstruir identidades.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      4. Suspensión Automática por Riesgo Penal
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      La Plataforma podrá suspender cuentas de forma inmediata ante indicios razonables de actividades que puedan generar responsabilidad penal para la comunidad o sus integrantes.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      5. Regulación Cannábica Futura
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Ante cualquier reforma regulatoria futura, WeedTown continuará siendo un espacio cultural y no se convertirá en un marketplace de sustancias reguladas ni intermediario sanitario.
                    </Typography>
                  </Box>
                </Stack>
              </TabPanel>

              {/* TAB 2: Política de Privacidad */}
              <TabPanel value={tabValue} index={1}>
                <Stack spacing={3}>
                  <Alert severity="info">
                    <strong>Privacidad Extrema Zero-Knowledge:</strong> Cumplimos con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) bajo un modelo donde no almacenamos ni reconstruimos identidades civiles.
                  </Alert>

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      1. Sin Contraseñas ni PII + Cláusula "No Data Brokerage"
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      No solicitamos nombres reales ni documentos de identidad. El acceso opera mediante Mastodon OAuth, Passkeys o enlaces mágicos.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      <strong>No Data Brokerage:</strong> WeedTown jamás vende, comercializa, alquila ni cede datos personales o metadatos a terceros, empresas de analítica o redes publicitarias.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      2. Cero Registro de IPs y Geolocalización Ofuscada
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      * <strong>No Retención de IP:</strong> No guardamos direcciones IP en bases de datos ni mantenemos historiales de navegación persistentes.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      * <strong>Geolocalización:</strong> El mapa "Cerca" utiliza celdas ofuscadas de ~2 km² que caducan a los 7 días. Nunca se procesan coordenadas GPS exactas.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      3. Modelo Zero-Knowledge
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      La arquitectura de la plataforma no guarda ni correlaciona datos que permitan reconstruir la identidad civil de un usuario. Lo que no existe en nuestros servidores no puede ser filtrado ni entregado.
                    </Typography>
                  </Box>
                </Stack>
              </TabPanel>

              {/* TAB 3: Normas de Convivencia */}
              <TabPanel value={tabValue} index={2}>
                <Stack spacing={3}>
                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      1. Respeto y Empatía Comunitario
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Cero tolerancia al acoso, discurso de odio o divulgación no consentida de datos ajenos (Doxxing).
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      2. Reporte Obligatorio de Intentos de Venta
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Toda persona usuaria que identifique intentos de compraventa ilícita debe reportarlo mediante los botones de moderación para proteger a la comunidad.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      3. Neutralidad Política y Protección a Activistas
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      WeedTown mantiene estricta neutralidad partidista. Protegemos la labor de activistas cannábicos y de derechos humanos mediante seudonimato reforzado.
                    </Typography>
                  </Box>
                </Stack>
              </TabPanel>

              {/* TAB 4: Cómo Funciona la Moderación */}
              <TabPanel value={tabValue} index={3}>
                <Stack spacing={3}>
                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      El Consejo Comunitario de Moderación
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      La moderación en WeedTown no la ejerce un algoritmo opaco ni una sola persona. Es realizada por un **Consejo Comunitario** integrado por moderadores con roles transparentes.
                    </Typography>
                  </Box>

                  <Divider />

                  <Box component="section">
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      Principios de Moderación:
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      1. <strong>Confidencialidad:</strong> Quien envía un reporte nunca es revelado a la persona reportada ni aparece en la cola.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      2. <strong>Ocultado Reversible:</strong> Las acciones sobre contenido son reversibles y quedan registradas en una bitácora interna auditables para evitar abusos de poder.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      3. <strong>Bloqueo Mutuo Silencioso:</strong> La primera línea de defensa de cada persona usuaria es el botón de bloquear, de efecto recíproco e inmediato.
                    </Typography>
                  </Box>
                </Stack>
              </TabPanel>

            </CardContent>
          </Card>
        </Stack>
      </Container>
      <Footer />
    </Box>
  );
};

export default Terms;
