// Autenticador WebAuthn "de software" para las pruebas de integración.
//
// Las pruebas hablan con el backend por HTTP, igual que el resto de la suite
// — pero passkeyAuthRoutes.js espera respuestas reales de navigator.credentials,
// que solo produce un navegador con una llave física o de plataforma. Este
// módulo simula esa llave: genera un par de claves EC P-256 de verdad y arma
// los mismos bytes (CBOR de la clave pública, authenticatorData, firma
// ECDSA) que produciría un autenticador real, usando los propios helpers de
// @simplewebauthn/server (isoCBOR, isoBase64URL) para no reinventar la
// codificación. Así la verificación del lado del servidor corre de verdad,
// no queda mockeada.
const crypto = require('crypto');
const { isoCBOR, isoBase64URL } = require('@simplewebauthn/server/helpers');

// Bits de flags de authenticatorData (https://www.w3.org/TR/webauthn-2/#flags)
const UP = 1 << 0; // user present
const UV = 1 << 2; // user verified
const AT = 1 << 6; // attested credential data presente

function crearLlave() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { privateKey, publicKey, credentialId: crypto.randomBytes(32), counter: 0 };
}

// COSE_Key de una clave pública EC2/P-256/ES256 — mismo mapa que decodifica
// decodeCredentialPublicKey() en el servidor.
function coseDeClavePublica(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  const m = new Map();
  m.set(1, 2); // kty: EC2
  m.set(3, -7); // alg: ES256
  m.set(-1, 1); // crv: P-256
  m.set(-2, Buffer.from(jwk.x, 'base64url'));
  m.set(-3, Buffer.from(jwk.y, 'base64url'));
  return Buffer.from(isoCBOR.encode(m));
}

function authenticatorData(rpID, flags, counter, attestedCredentialData) {
  const rpIdHash = crypto.createHash('sha256').update(rpID).digest();
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter, 0);
  return Buffer.concat([rpIdHash, Buffer.from([flags]), counterBuf, attestedCredentialData || Buffer.alloc(0)]);
}

function clientDataJSON(type, challenge, origin) {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), 'utf8');
}

/** Simula navigator.credentials.create(): RegistrationResponseJSON válido. */
function responderRegistro(llave, { rpID, origin, challenge }) {
  const idLen = Buffer.alloc(2);
  idLen.writeUInt16BE(llave.credentialId.length, 0);
  const attestedCredentialData = Buffer.concat([
    Buffer.alloc(16), // aaguid en ceros
    idLen,
    llave.credentialId,
    coseDeClavePublica(llave.publicKey)
  ]);
  const authData = authenticatorData(rpID, UP | UV | AT, llave.counter, attestedCredentialData);
  const attestationObject = Buffer.from(
    isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
  );
  const cData = clientDataJSON('webauthn.create', challenge, origin);
  const id = isoBase64URL.fromBuffer(llave.credentialId);

  return {
    id,
    rawId: id,
    response: {
      clientDataJSON: isoBase64URL.fromBuffer(cData),
      attestationObject: isoBase64URL.fromBuffer(attestationObject),
      transports: ['internal']
    },
    clientExtensionResults: {},
    type: 'public-key'
  };
}

/** Simula navigator.credentials.get(): AuthenticationResponseJSON válido. */
function responderLogin(llave, { rpID, origin, challenge }) {
  llave.counter += 1;
  const authData = authenticatorData(rpID, UP | UV, llave.counter, null);
  const cData = clientDataJSON('webauthn.get', challenge, origin);
  const clientDataHash = crypto.createHash('sha256').update(cData).digest();
  const signature = crypto.sign('sha256', Buffer.concat([authData, clientDataHash]), llave.privateKey);
  const id = isoBase64URL.fromBuffer(llave.credentialId);

  return {
    id,
    rawId: id,
    response: {
      clientDataJSON: isoBase64URL.fromBuffer(cData),
      authenticatorData: isoBase64URL.fromBuffer(authData),
      signature: isoBase64URL.fromBuffer(signature)
    },
    clientExtensionResults: {},
    type: 'public-key'
  };
}

module.exports = { crearLlave, responderRegistro, responderLogin };
