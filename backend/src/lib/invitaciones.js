// Cómo se publica el contador de invitaciones (ciclo 11A).
//
// EL PROBLEMA QUE ESTE ARCHIVO RESUELVE, porque no es obvio:
//
// El diseño protege el grafo de invitaciones por dos lados —no hay llave
// foránea en la base, y el log no ata a las dos cuentas—. Falta un tercero:
// **el contador mismo es un canal de correlación**.
//
// Si el número exacto es visible, quien observe un perfil pasar de 3 a 4 a las
// 14:32, y vea aparecer una cuenta nueva alrededor de esa hora, deduce la
// arista sin que la base la guarde en ninguna parte. Con una red del tamaño de
// ésta las altas son lo bastante escasas como para que baste mirar dos veces
// al día: no es un ataque teórico, es abrir el perfil y anotar.
//
// Las cubetas dejan ese canal en **un bit por frontera cruzada** en vez de uno
// por alta. Quien observe solo se entera de que alguien pasó de "5+" a "20+"
// —quince altas después—, y para entonces no hay a quién correlacionar.
//
// El precio es que el reconocimiento es menos preciso. Es el intercambio
// correcto: el contador existe para decir "esta persona trae gente", no para
// llevar la cuenta.

// Fronteras en orden ascendente. Se eligieron ralas a propósito: cada frontera
// es una observación posible, así que menos fronteras es menos canal. Cambiar
// esto a algo más fino (de 1 en 1, o de 5 en 5 hasta 50) reabre justo lo que
// las cubetas cierran.
const CUBETAS = [
  { desde: 50, texto: '50+' },
  { desde: 20, texto: '20+' },
  { desde: 5, texto: '5+' },
  { desde: 1, texto: 'algunas' }
];

/**
 * Cómo se le muestra el contador a alguien que NO es su dueña.
 * @param {number} n conteo exacto
 * @returns {string|null} la cubeta, o null si no hay nada que mostrar
 */
function cubetaInvitaciones(n) {
  // 0 no se pinta. Un "0 invitaciones" no es reconocimiento, es lo contrario,
  // y además le diría al mundo que el enlace de esa persona no ha funcionado.
  if (!Number.isFinite(n) || n < 1) return null;
  return CUBETAS.find(c => n >= c.desde).texto;
}

module.exports = { CUBETAS, cubetaInvitaciones };
