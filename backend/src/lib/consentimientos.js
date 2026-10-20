// Consentimientos por finalidad (ciclo 20).
//
// EL PRINCIPIO (PO, 2026-10-20): «congruentes con los principios; flexibles
// solo siendo claros; se acepta paulatinamente». Tres capas:
//
//   1. BASE, obligatoria y anónima: los Términos y el medidor general
//      («personas activas por día»). Se acepta con `User.terminosVersion`
//      (ciclo 19.5) y es lo único que se exige para usar la red.
//   2. FINALIDADES OPCIONALES: cada una con su propio texto, su propia versión y
//      su propia decisión. Apagadas por defecto. Revocables.
//   3. (futuro) lo que cada finalidad habilite.
//
// POR QUÉ UNA TABLA Y NO UNA COLUMNA POR FINALIDAD: porque la lista va a crecer,
// y porque lo que se necesita saber es UNA cosa por finalidad —qué versión del
// texto se consintió y cuándo— y esa cosa se repite. Con esto, un cambio en el
// texto de una finalidad solo vuelve a preguntar por esa finalidad: quien aceptó
// la A y no ha visto la B no queda en un limbo, y no hay que decidir qué pasa
// con «los que aceptaron una parte».
//
// REGLAS QUE ESTE ARCHIVO HACE CUMPLIR:
//   · Sin fila = apagada. Nunca hay un valor por defecto «encendido».
//   · Solo se puede ACTIVAR una finalidad `disponible`: consentir algo que aún
//     no existe no es consentimiento informado. Apagar siempre se puede.
//   · Una finalidad que usa el correo exige que la cuenta TENGA correo.
//   · Un consentimiento de una versión vieja del texto NO vale: `desactualizada`
//     se trata como apagada hasta que la persona lo confirme de nuevo.
//   · Revocar no borra la fila: queda `otorgado: false` con su fecha, que es la
//     prueba de que se respetó la decisión.
//
// Este módulo NO envía nada ni mide nada: solo guarda y responde la pregunta
// «¿puedo usar este dato para esto?». Quien construya una función de las de
// abajo tiene que preguntarlo aquí (`tieneConsentimiento`) antes de tocar nada.
const prisma = require('./prisma');

// El catálogo es la ÚNICA fuente de los textos: el navegador los pide a la API y
// no tiene copia. Cambiar el texto de una finalidad exige subir SU `version`
// (la fecha de publicación), en el mismo commit; subirla vuelve a preguntar solo
// por esa finalidad.
const FINALIDADES = {
  medicion_personal: {
    version: '2026-10-20',
    disponible: false,
    requiereCorreo: false,
    titulo: 'Medición personal de mi actividad',
    paraQue: 'Mostrarte tu propio panel: cuánto lees, cuántas reacciones das y recibes, con cuántas personas conversas.',
    comoSeTrata: 'Guardamos contadores de tu actividad ligados a tu cuenta. Los ves tú; no se muestran a nadie más. Al apagarlo dejamos de guardarlos y borramos los que había.',
    queNoHacemos: 'No hay rankings, no se comparan personas y no se comparte ni se vende nada.'
  },
  reconocimientos: {
    version: '2026-10-20',
    disponible: false,
    requiereCorreo: false,
    titulo: 'Reconocimientos',
    paraQue: 'Darte insignias por lo que aportas a la comunidad (por ejemplo, responder a alguien o recibir reacciones), y que otras personas puedan verlas en tu perfil solo si tú lo eliges.',
    comoSeTrata: 'Se calculan con tu actividad, así que necesitan la medición personal. Premiamos aportes, no cantidad: no hay rachas ni clasificaciones.',
    queNoHacemos: 'No hay ranking público ni presión por entrar todos los días.'
  },
  avisos_correo: {
    version: '2026-10-20',
    disponible: false,
    requiereCorreo: true,
    titulo: 'Avisos por correo',
    paraQue: 'Escribirte cuando alguien reaccione a tu publicación, te responda o te mande un mensaje.',
    comoSeTrata: 'Usamos el correo de tu cuenta. Como máximo un correo al día. Nunca incluimos lo que otras personas escribieron: solo te avisamos que pasó algo. Cada correo lleva un enlace para apagarlo.',
    queNoHacemos: 'No compartimos tu correo con nadie.'
  },
  mensajes_comunitarios: {
    version: '2026-10-20',
    disponible: false,
    requiereCorreo: true,
    titulo: 'Mensajes de la comunidad',
    paraQue: 'Escribirte si llevas mucho tiempo sin entrar, para saber cómo estás. Es un mensaje de cuidado entre la comunidad, no una campaña.',
    comoSeTrata: 'Para saber quién lleva tiempo sin entrar usamos la fecha del último día que usaste WeedTown. Mandamos uno solo por ausencia, con un enlace para apagarlo.',
    queNoHacemos: 'No insistimos ni te escribimos en cadena.'
  },
  resumen_cerca: {
    version: '2026-10-20',
    disponible: false,
    requiereCorreo: true,
    titulo: 'Resumen de personas cerca',
    paraQue: 'Avisarte, una vez por semana, cuántas personas comparten su zona en tu área, y solo si son al menos tres.',
    comoSeTrata: 'Se calcula con las celdas de unos 2 km² de «Cerca». Nunca decimos quiénes son ni te avisamos de cada persona.',
    queNoHacemos: 'No revelamos ubicaciones ni identidades.'
  },
  comunicaciones_comerciales: {
    version: '2026-10-20',
    disponible: true,
    requiereCorreo: true,
    titulo: 'Novedades y propuestas de WeedTown',
    paraQue: 'Mandarte por correo novedades, campañas y propuestas de WeedTown. Es comunicación comercial y por eso necesita tu permiso.',
    comoSeTrata: 'Usamos el correo de tu cuenta. Cada mensaje dice quién lo envía y lleva un enlace para darte de baja en un clic. Guardamos cuándo y con qué texto lo aceptaste.',
    queNoHacemos: 'No compartimos ni vendemos tu correo ni tus datos con terceros.'
  }
};

const FORMATO_VERSION = /^\d{4}-\d{2}-\d{2}$/;

class ErrorDeConsentimiento extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

function existe(finalidad) {
  return Object.prototype.hasOwnProperty.call(FINALIDADES, finalidad);
}

/** De una fila (o ninguna) al estado que se le muestra y se usa. */
function estadoDe(fila, vigente) {
  if (!fila || !fila.otorgado) return 'desactivada';
  return fila.version === vigente ? 'activa' : 'desactualizada';
}

function presentar(finalidad, fila) {
  const def = FINALIDADES[finalidad];
  return {
    finalidad,
    titulo: def.titulo,
    paraQue: def.paraQue,
    comoSeTrata: def.comoSeTrata,
    queNoHacemos: def.queNoHacemos,
    disponible: def.disponible,
    requiereCorreo: def.requiereCorreo,
    version: def.version,
    estado: estadoDe(fila, def.version),
    versionConsentida: fila?.version ?? null,
    decididoEn: fila?.decididoEn ?? null
  };
}

/** Todas las finalidades con el estado de esta persona. */
async function listar(userId) {
  const filas = await prisma.consentimiento.findMany({ where: { userId } });
  const porFinalidad = new Map(filas.map(f => [f.finalidad, f]));
  return Object.keys(FINALIDADES).map(f => presentar(f, porFinalidad.get(f)));
}

/**
 * Activa o apaga una finalidad. Idempotente: activar lo ya activo no mueve la
 * fecha (cuenta la primera vez que se consintió ESA versión).
 * @throws {ErrorDeConsentimiento}
 */
async function establecer(userId, finalidad, otorgado) {
  if (!existe(finalidad)) throw new ErrorDeConsentimiento(404, 'finalidad_desconocida', 'Esa finalidad no existe');
  if (typeof otorgado !== 'boolean') throw new ErrorDeConsentimiento(400, 'otorgado_invalido', 'otorgado debe ser true o false');
  const def = FINALIDADES[finalidad];
  const actual = await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId, finalidad } } });

  if (otorgado) {
    if (!def.disponible) {
      throw new ErrorDeConsentimiento(409, 'no_disponible', 'Esta opción todavía no existe: te avisaremos y te lo preguntaremos cuando esté lista');
    }
    if (def.requiereCorreo) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!u?.email) throw new ErrorDeConsentimiento(400, 'requiere_correo', 'Para activar esto necesitas un correo en tu perfil');
    }
    if (actual && actual.otorgado && actual.version === def.version) return presentar(finalidad, actual);
    const fila = await prisma.consentimiento.upsert({
      where: { userId_finalidad: { userId, finalidad } },
      create: { userId, finalidad, version: def.version, otorgado: true },
      update: { version: def.version, otorgado: true, decididoEn: new Date() }
    });
    return presentar(finalidad, fila);
  }

  // Apagar. Sin fila no hay nada que guardar: apagada es el estado por defecto,
  // y crear una fila «otorgado: false» de la nada solo ensuciaría el registro.
  if (!actual) return presentar(finalidad, null);
  if (!actual.otorgado) return presentar(finalidad, actual);
  const fila = await prisma.consentimiento.update({
    where: { userId_finalidad: { userId, finalidad } },
    data: { otorgado: false, decididoEn: new Date() }
  });
  return presentar(finalidad, fila);
}

/**
 * ¿Puedo usar los datos de esta persona para esta finalidad? Es la pregunta que
 * tiene que hacer cualquier función que dependa de un consentimiento, ANTES de
 * tocar nada. Falla cerrado: finalidad desconocida, sin fila, apagada o de una
 * versión vieja → false.
 */
async function tieneConsentimiento(userId, finalidad) {
  if (!existe(finalidad)) return false;
  const fila = await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId, finalidad } } });
  return estadoDe(fila, FINALIDADES[finalidad].version) === 'activa';
}

module.exports = {
  FINALIDADES, FORMATO_VERSION, ErrorDeConsentimiento,
  listar, establecer, tieneConsentimiento, estadoDe
};
