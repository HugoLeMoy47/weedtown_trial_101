// Configuración compartida de WebAuthn (llaves de acceso / passkeys).
//
// El RP ID es el dominio al que queda atada la llave: tiene que ser el
// hostname del FRONTEND (donde vive la pantalla que llama a
// navigator.credentials), no el del backend — un navegador nunca deja usar
// una llave fuera del dominio (o un padre de ese dominio) donde se registró.
const rpName = 'WeedTown';

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function rpID() {
  return new URL(frontendUrl()).hostname;
}

function origin() {
  return frontendUrl().replace(/\/$/, '');
}

module.exports = { rpName, rpID, origin };
