// Versión vigente de los Términos y la Política de Privacidad (ciclo 19.5) y la
// compuerta de la capa base (ciclo 20).
//
// POR QUÉ EXISTE. El alta pide marcar «soy mayor de 18 y acepto los Términos»,
// pero hasta el 19 nada guardaba cuándo ni cuál versión aceptó cada persona.
// Cambiar los Términos no dejaba forma de saber quién había aceptado cuál, y
// la medición de actividad (19A) y los avisos por correo (ciclo 20) son
// precisamente el tipo de cambio que exige poder responder esa pregunta.
//
// LA VERSIÓN ES LA FECHA desde la que rige el texto, 'AAAA-MM-DD' (la del día que
// se publica, o la siguiente si se publica de noche: lo único que importa es que
// sea DISTINTA de la anterior). No es un
// número que alguien tenga que acordarse de subir: es el día del cambio, y
// subirla es lo que vuelve a pedirle aceptación a todo el mundo. **Cámbiala
// SOLO cuando cambie el texto de Terms.jsx, y siempre en el mismo commit.**
// Esta versión es la de la CAPA BASE; las finalidades opcionales tienen la suya
// (src/lib/consentimientos.js), para que un cambio en una no vuelva a preguntar
// por todo.
//
// Vive DOS veces (aquí y en frontend/src/lib/terminos.js), igual que la
// cuadrícula de Cerca: el navegador necesita saberla para pintar el aviso y el
// servidor para validar lo que le llega. `terminosAceptacion.test.js` lee el
// archivo real del frontend y falla si divergen.
//
// LA COMPUERTA (ciclo 20). Decisión del PO, 2026-10-20: quien no acepte la capa
// base actualizada no accede, con 30 días de gracia y avisando de antemano. La
// cuenta NUNCA se borra: la pantalla de la compuerta ofrece aceptar, descargar
// los datos o eliminar la cuenta. Solo aplica a la base: jamás se condiciona el
// acceso a una finalidad opcional.
const { diaMexicoISO } = require('./diaMexico');

// 2026-10-21 (ciclo 21): se agregó la sección «Aceptación y acceso» y la de decisiones
// opcionales. Subir la versión vuelve a pedir aceptación a todas las cuentas.
const TERMINOS_VIGENTES = '2026-10-21';

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

// El primer día en que la versión vigente se EXIGE (inclusive, día de México):
// 30 días después de que el aviso con esta fecha esté a la vista. Decisión del PO
// (2026-10-20): el plazo cuenta desde la publicación del texto nuevo, no desde el
// primer aviso. El correo informativo sale el 23 y 24 de octubre, así que el límite
// se movió (2026-10-20) a 30 días después del último envío: el 2026-11-23, para que la
// promesa de 30 días valga también para quien se entere por correo. (Era 2026-11-20;
// 2026-11-19 hasta el ciclo 21.)
const LIMITE_POR_DEFECTO = '2026-11-23';

/**
 * El límite vigente. `TERMINOS_LIMITE` lo sobreescribe (formato AAAA-MM-DD);
 * existe para que CI, E2E y la suite local no tengan una BOMBA DE TIEMPO: el día
 * que llegue el límite real, cada cuenta de prueba (que nace sin versión) estaría
 * bloqueada y media suite se pondría en rojo sin que nada hubiera cambiado.
 * Un valor con formato inválido se ignora: no se puede apagar la compuerta con
 * un typo, solo con una fecha.
 */
function limiteDeTerminos(env = process.env) {
  const v = (env.TERMINOS_LIMITE || '').trim();
  return FORMATO.test(v) ? v : LIMITE_POR_DEFECTO;
}

/**
 * ¿Se le exige ya a esta cuenta aceptar la versión vigente?
 * @param {string|null|undefined} versionAceptada lo que tiene guardado la cuenta
 * @param {Date} [ahora]
 * @param {string} [limite] AAAA-MM-DD; por defecto el vigente
 */
function terminosExigidos(versionAceptada, ahora = new Date(), limite = limiteDeTerminos()) {
  if (versionAceptada === TERMINOS_VIGENTES) return false;
  return diaMexicoISO(ahora) >= limite;
}

/**
 * Días que le quedan a esta cuenta antes de que se le exija. 0 el día del límite
 * (ya se exige); nunca negativo. Se cuenta en días de calendario de México.
 */
function diasParaLimite(ahora = new Date(), limite = limiteDeTerminos()) {
  const hoy = Date.parse(`${diaMexicoISO(ahora)}T00:00:00Z`);
  const fin = Date.parse(`${limite}T00:00:00Z`);
  return Math.max(0, Math.round((fin - hoy) / 86400000));
}

module.exports = { TERMINOS_VIGENTES, FORMATO, LIMITE_POR_DEFECTO, limiteDeTerminos, terminosExigidos, diasParaLimite };
