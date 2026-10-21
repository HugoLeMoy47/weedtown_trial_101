// A qué dirección se le escribe a una cuenta (ciclo 22.1).
//
// EL ERROR QUE ESTE ARCHIVO CORRIGE. Los ciclos 20 a 22 daban por hecho que el correo
// de contacto vive en `User.email`. En producción NINGUNA de las 113 cuentas lo tiene:
// las 87 que entran por correo guardan su dirección solo como identidad de acceso
// (`Identity.externalId` del proveedor EMAIL), y el perfil no tiene forma de poner un
// correo. Las pruebas sembraban `User.email` a mano, así que todo pasaba en verde y, en
// la práctica, nadie podía activar una finalidad de correo y el aviso de Términos no
// habría llegado a nadie. Se descubrió contando cuentas reales antes de mandar el aviso.
//
// LA REGLA. La dirección de contacto es `User.email` si existe y, si no, la dirección con
// la que la persona entra por correo. Es una dirección que la persona dio para que le
// escribamos (recibe en ella el enlace de acceso); para correo que NO es de servicio
// sigue haciendo falta su consentimiento por finalidad. Las cuentas que entran por llave
// de acceso o por Mastodon pueden no tener ninguna: ésas no reciben correo.
//
// SE LE MUESTRA, ENMASCARADA. Antes de activar una finalidad de correo la persona ve a qué
// dirección se le va a escribir (a***@dominio.com): consentir sin saber a dónde no es
// informado.
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizar = (correo) => String(correo || '').trim().toLowerCase();

/** Qué hay que pedirle a Prisma para poder resolver la dirección de una cuenta. */
const SELECT_CONTACTO = {
  email: true,
  identities: { where: { provider: 'EMAIL' }, select: { externalId: true }, orderBy: { id: 'asc' }, take: 1 }
};

/** Filtro de Prisma: cuentas que PUEDEN tener una dirección (se confirma con `correoDeContacto`). */
const DONDE_HAY_CORREO = {
  OR: [{ email: { not: null } }, { identities: { some: { provider: 'EMAIL' } } }]
};

/**
 * @param {{email?: string|null, identities?: {externalId: string}[]}} cuenta leída con SELECT_CONTACTO
 * @returns {string|null} la dirección normalizada, o null si la cuenta no tiene ninguna válida
 */
function correoDeContacto(cuenta) {
  const candidatas = [cuenta?.email, cuenta?.identities?.[0]?.externalId];
  for (const c of candidatas) {
    const n = normalizar(c);
    if (FORMATO_CORREO.test(n)) return n;
  }
  return null;
}

/** 'a***@gmail.com': para que se vea de qué dirección se trata sin volcarla entera. */
function enmascarar(correo) {
  const [local, dominio] = normalizar(correo).split('@');
  return `${(local || '')[0] || '?'}***@${dominio || '?'}`;
}

module.exports = { FORMATO_CORREO, SELECT_CONTACTO, DONDE_HAY_CORREO, correoDeContacto, enmascarar, normalizar };
