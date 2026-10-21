// Versión vigente de los Términos y registro de aceptación (ciclo 19.5).
//
// Esta constante tiene una gemela en backend/src/lib/terminos.js, y las dos
// tienen que decir lo mismo: `backend/tests/terminosAceptacion.test.js` lee ESTE
// archivo y falla si divergen. Es la fecha de publicación del texto de
// Terms.jsx; **cámbiala solo cuando cambie ese texto, y en el mismo commit.**
// Subirla vuelve a pedirle aceptación a todas las cuentas.
export const TERMINOS_VIGENTES = '2026-10-21';

// La marca «acepté los Términos en la pantalla de acceso». Vive en
// localStorage por la misma razón que `altaNueva.js` y `attribution.js`: entre
// que se marca la casilla y que hay sesión puede haber una navegación completa,
// y con Mastodon, una vuelta por otro sitio.
//
// Guarda la VERSIÓN que se leyó al marcar, no un «sí»: así una marca vieja,
// de antes de un cambio de Términos, no cuenta como aceptación del texto nuevo.
const CLAVE_MARCA = 'weedtown_terminos_marcados';
const CLAVE_POSPUESTO = 'weedtown_terminos_pospuesto';

export function marcarTerminosEnLogin(marcada) {
  try {
    if (marcada) localStorage.setItem(CLAVE_MARCA, TERMINOS_VIGENTES);
    else localStorage.removeItem(CLAVE_MARCA);
  } catch { /* modo privado sin storage */ }
}

/** Consume la marca: se lee UNA vez, para que no se arrastre a sesiones futuras. */
export function tomarMarcaDeTerminos() {
  try {
    const v = localStorage.getItem(CLAVE_MARCA);
    localStorage.removeItem(CLAVE_MARCA);
    return v;
  } catch { return null; }
}

// «Más tarde» dura lo que dura la pestaña: el aviso vuelve en la siguiente
// sesión, no en cada navegación. Es un aviso, no un muro.
export function posponerAvisoDeTerminos() {
  try { sessionStorage.setItem(CLAVE_POSPUESTO, '1'); } catch { /* sin storage */ }
}
export function avisoDeTerminosPospuesto() {
  try { return sessionStorage.getItem(CLAVE_POSPUESTO) === '1'; } catch { return false; }
}

/**
 * Qué hacer con una sesión recién cargada. Función pura, para poder probarla.
 *
 *   'nada'      ya aceptó la versión vigente, o el servidor no dijo cuál es
 *               (sin ese dato no se adivina ni se molesta a nadie)
 *   'registrar' marcó la casilla de ESTA versión al entrar: se registra en
 *               silencio, sin pedirle nada
 *   'avisar'    tiene una versión vieja o ninguna (todas las cuentas
 *               anteriores al 19.5): se le avisa una vez y decide
 *
 * @param {{terminosVersion?: string|null, terminosVigentes?: string}|null} user lo que devuelve /auth/me
 * @param {string|null} marca lo que dejó la casilla del login (tomarMarcaDeTerminos)
 */
export function decidirAvisoDeTerminos(user, marca) {
  if (!user || !user.terminosVigentes) return 'nada';
  if (user.terminosVersion === user.terminosVigentes) return 'nada';
  if (marca && marca === user.terminosVigentes) return 'registrar';
  return 'avisar';
}

/**
 * Qué muestra la app a una sesión recién cargada (ciclo 20). Función pura.
 *
 *   'libre'      nada: ya aceptó la vigente, o el servidor no dijo cuál es
 *   'registrar'  marcó la casilla de ESTA versión al entrar: se registra en silencio
 *   'dialogo'    le falta aceptarla, pero aún hay plazo: aviso con «Más tarde»
 *   'compuerta'  le falta aceptarla y el plazo ya venció: pantalla que lo exige
 *
 * El servidor decide si «ya venció» (`terminosExigidos`); el navegador no
 * recalcula fechas, así que no hay dos copias de la regla que desfasar.
 */
export function modoDePuerta(user, marca) {
  if (!user || !user.terminosVigentes) return 'libre';
  if (user.terminosVersion === user.terminosVigentes) return 'libre';
  if (marca && marca === user.terminosVigentes) return 'registrar';
  return user.terminosExigidos ? 'compuerta' : 'dialogo';
}

/** 'AAAA-MM-DD' → «19 de noviembre de 2026». Sin desfase de zona: el día se toma a mediodía UTC. */
export function fechaLarga(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

// La franja con la cuenta regresiva (ciclo 21): se cierra por la sesión, salvo en
// los últimos 7 días, cuando ya no se puede cerrar. Decisión del PO.
const CLAVE_FRANJA = 'weedtown_franja_terminos_cerrada';
export const DIAS_SIN_CERRAR = 7;

export function cerrarFranjaDeTerminos() {
  try { sessionStorage.setItem(CLAVE_FRANJA, '1'); } catch { /* sin storage */ }
}
export function franjaDeTerminosCerrada() {
  try { return sessionStorage.getItem(CLAVE_FRANJA) === '1'; } catch { return false; }
}

/**
 * Qué muestra la franja, o null si no hay que mostrarla. Función pura.
 * Solo aparece mientras queda plazo: ya aceptada no hay nada que avisar, y vencido
 * el plazo la pantalla de la compuerta ocupa su lugar. Los días los cuenta el
 * SERVIDOR (`terminosDiasRestantes`): el navegador no recalcula fechas.
 *
 * @returns {{dias: number, cerrable: boolean} | null}
 */
export function franjaDeTerminos(user, cerrada = false) {
  if (!user || !user.terminosVigentes) return null;
  if (user.terminosVersion === user.terminosVigentes) return null;
  if (user.terminosExigidos) return null;
  if (typeof user.terminosDiasRestantes !== 'number') return null;
  const cerrable = user.terminosDiasRestantes > DIAS_SIN_CERRAR;
  if (cerrable && cerrada) return null;
  return { dias: user.terminosDiasRestantes, cerrable };
}
