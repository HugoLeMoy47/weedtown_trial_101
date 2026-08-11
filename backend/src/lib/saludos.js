// El saludo mutuo de Cerca (ciclo 13D).
//
// EL DATO QUE ORDENA ESTE CICLO: en 7 días hubo 14 toques y 4 mensajes de
// chat. De las dos formas de acercarse a alguien, la comunidad eligió la
// barata tres veces y media más. La lectura: en una red de 56 personas donde
// casi nadie se conoce, mandar un mensaje cuesta mucho socialmente —hay que
// decir algo, exponerse a que no contesten— y un toque no cuesta nada.
//
// Un saludo mutuo es simplemente DOS TOQUES CRUZADOS dentro de una ventana. No
// hay tipo de notificación nuevo ni tabla nueva: la respuesta a un toque ES un
// toque, y la reciprocidad se deduce. Esa fue la decisión de diseño más
// importante del ciclo — un estado "saludo" persistido sería una relación
// nueva que mantener, invalidar y explicar, para algo que ya está implícito en
// dos filas que existen.
const prisma = require('./prisma');

// La ventana dentro de la cual dos toques cuentan como saludo.
//
// 48 horas, y el número tiene argumento: un toque es una señal de PRESENCIA
// ("ando por aquí"), y responderla tres días después ya no dice eso. Pero con
// 7 personas activas por semana, exigir que contesten el mismo día haría que
// casi ningún saludo se cerrara — y quien abre la campana al día siguiente es
// el caso normal, no la excepción. 48 h cubre "lo vi mañana" sin estirar la
// palabra "presencia" hasta que no signifique nada.
const VENTANA_SALUDO_H = 48;

function desdeLaVentana() {
  return new Date(Date.now() - VENTANA_SALUDO_H * 60 * 60 * 1000);
}

/**
 * El toque más reciente que `deId` le mandó a `paraId` dentro de la ventana.
 * Devuelve null si no hay ninguno.
 */
async function toqueReciente(deId, paraId) {
  return prisma.notification.findFirst({
    where: {
      type: 'POKE',
      actorId: deId,
      recipientId: paraId,
      createdAt: { gte: desdeLaVentana() }
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true }
  });
}

/**
 * ¿Estas dos personas se saludaron? Hay saludo cuando existe un toque en CADA
 * dirección dentro de la ventana.
 *
 * No pide que la respuesta sea posterior al saludo original: si los dos se
 * tocaron el mismo día sin haberse visto la notificación, se saludaron igual.
 * Exigir un orden convertiría una coincidencia simpática en un error.
 */
async function seSaludaron(unoId, otroId) {
  const [ida, vuelta] = await Promise.all([
    toqueReciente(unoId, otroId),
    toqueReciente(otroId, unoId)
  ]);
  return Boolean(ida && vuelta);
}

/**
 * Para una lista de notificaciones ya cargadas, marca cuáles son toques que
 * quedaron correspondidos. Una sola consulta para toda la página, no una por
 * fila — es la misma regla que gobierna indicadores.js.
 */
async function marcarSaludosMutuos(notificaciones, miId) {
  const toques = notificaciones.filter(n => n.type === 'POKE' && n.actorId);
  if (!toques.length) return notificaciones;

  const otros = [...new Set(toques.map(n => n.actorId))];
  const mios = await prisma.notification.findMany({
    where: {
      type: 'POKE',
      actorId: miId,
      recipientId: { in: otros },
      createdAt: { gte: desdeLaVentana() }
    },
    select: { recipientId: true }
  });
  const correspondidos = new Set(mios.map(m => m.recipientId));

  return notificaciones.map(n =>
    n.type === 'POKE' && n.actorId
      ? { ...n, saludoMutuo: correspondidos.has(n.actorId) }
      : n
  );
}

module.exports = { VENTANA_SALUDO_H, toqueReciente, seSaludaron, marcarSaludosMutuos };
