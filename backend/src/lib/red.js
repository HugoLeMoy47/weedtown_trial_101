// La red de una persona: sus amigos y los amigos de sus amigos (ciclo 17).
//
// Hasta el 16 este cálculo vivía dentro de `mention-suggestions`. Lo necesitan
// tres superficies que responden la misma pregunta —«¿puedes encontrarme sin
// conocerme?», la ENUMERABILIDAD de profileRoutes.js— y tres copias son tres
// maneras de que una se desvíe: la búsqueda de personas del chat nunca tuvo el
// filtro y enumeraba toda la plataforma (hallazgo B-1 del ciclo 16).
//
// DELIBERADO (decisión del PO, 2026-09-03): el círculo NO filtra por
// `perfilPublico`. Un amigo-de-amigo con perfil cerrado sí cuenta: el círculo
// es la red de quien busca, no el interruptor de quien es buscado.
const prisma = require('./prisma');
const { friendIds } = require('./friends');

/**
 * @param {number} userId
 * @returns {Promise<{amigosIds: number[], circuloIds: Set<number>}>} el círculo incluye a los amigos y NO a `userId`
 */
async function redDe(userId) {
  const amigosIds = await friendIds(userId);
  // Dos pasos, no una consulta recursiva: aquí solo importa «pertenece al
  // círculo», no de quién es amigo cada quién.
  const segundoGrado = amigosIds.length
    ? await prisma.friendRequest.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: { in: amigosIds } }, { addresseeId: { in: amigosIds } }]
        },
        select: { requesterId: true, addresseeId: true }
      })
    : [];
  const circuloIds = new Set(amigosIds);
  for (const fila of segundoGrado) {
    circuloIds.add(fila.requesterId);
    circuloIds.add(fila.addresseeId);
  }
  circuloIds.delete(userId);
  return { amigosIds, circuloIds };
}

/**
 * Fragmento de `where` de Prisma con la regla de ENUMERABILIDAD: solo entran
 * quienes están en la red de quien busca o pidieron ser encontrables
 * (`perfilPublico`). Va en el WHERE y no después del `take`: filtrar en JS
 * mutila la página en vez de acotarla.
 */
function enumerablePara(circuloIds) {
  return { OR: [{ id: { in: Array.from(circuloIds) } }, { perfilPublico: true }] };
}

module.exports = { redDe, enumerablePara };
