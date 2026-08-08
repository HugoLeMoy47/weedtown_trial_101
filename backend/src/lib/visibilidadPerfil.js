// Quién ve qué dato de un perfil (ciclo 10B).
//
// ESTO VIVE EN UNA SOLA FUNCIÓN A PROPÓSITO. Son dos controles independientes
// —la visibilidad por dato y el interruptor de perfil público— y la relación
// entre ellos es fácil de equivocar en la dirección peligrosa. Calcularla en
// dos lugares es cómo se producen las fugas que este proyecto lleva varios
// ciclos cazando (H1 del 7A salió justo de eso).
//
// LA REGLA DURA:
//
//   El interruptor de perfil público NUNCA amplía lo que la visibilidad por
//   dato ya restringió. Expone únicamente lo que ya estaba en TODOS.
//
// "NADIE" sigue siendo nadie. "AMIGOS" sigue siendo amigos — y como fuera de
// la red no hay amistades, hacia afuera equivale a nada. Sin esta regla los dos
// controles se contradicen y la persona pierde la certeza de qué muestra.
//
// La dueña siempre ve lo suyo: la visibilidad describe qué ven LOS DEMÁS, no
// es un candado contra una misma.

const VALORES = ['TODOS', 'AMIGOS', 'NADIE'];

// Qué campos son configurables, y con qué preferencia se guarda cada uno.
// Cambiar este mapa cambia la superficie completa: las rutas lo recorren en vez
// de nombrar campos sueltos, para que agregar uno no exija tocar tres archivos
// ni permita olvidarse de filtrar en alguno.
const CAMPOS = {
  bio:     'visibilidadBio',
  aboutMe: 'visibilidadAboutMe',
  age:     'visibilidadAge',
  gender:  'visibilidadGender'
};

// Relación de quien mira con el perfil que mira.
//   dueña     — es su propio perfil
//   amistad   — con sesión y amistad aceptada
//   conSesion — con sesión, sin amistad
//   anonima   — sin sesión (solo llega aquí si el perfil es público)
function relacionCon({ esDueña, esAmistad, tieneSesion }) {
  if (esDueña) return 'dueña';
  if (esAmistad) return 'amistad';
  if (tieneSesion) return 'conSesion';
  return 'anonima';
}

/**
 * ¿Sale este campo?
 * @param {string} visibilidad  TODOS | AMIGOS | NADIE
 * @param {string} relacion     dueña | amistad | conSesion | anonima
 * @param {boolean} perfilPublico
 */
function campoVisible(visibilidad, relacion, perfilPublico) {
  if (relacion === 'dueña') return true;
  switch (visibilidad) {
    case 'NADIE':
      return false;
    case 'AMIGOS':
      // Ni siquiera con el perfil público: afuera no hay amistades que valer.
      // Ésta es la línea donde la regla dura se cumple o se rompe.
      return relacion === 'amistad';
    case 'TODOS':
      if (relacion === 'amistad' || relacion === 'conSesion') return true;
      return perfilPublico; // anónima: solo si la persona lo decidió
    default:
      // Valor desconocido (una migración a medias, un dato corrupto): se calla.
      // Fail-closed — un campo de menos es un error recuperable, uno de más no.
      return false;
  }
}

/**
 * Recorta un perfil a lo que puede ver quien lo mira.
 * @param {object} usuario   fila de User con los campos y sus preferencias
 * @param {object} contexto  { esDueña, esAmistad, tieneSesion }
 * @returns {object} solo los campos configurables que sí salen
 */
function camposVisibles(usuario, contexto) {
  const relacion = relacionCon(contexto);
  const out = {};
  for (const [campo, preferencia] of Object.entries(CAMPOS)) {
    out[campo] = campoVisible(usuario[preferencia], relacion, usuario.perfilPublico)
      ? (usuario[campo] ?? null)
      : null;
  }
  return out;
}

/** ¿Es un valor de visibilidad aceptable? Para validar lo que llega en PUT /me. */
const esVisibilidadValida = (v) => VALORES.includes(v);

module.exports = { VALORES, CAMPOS, relacionCon, campoVisible, camposVisibles, esVisibilidadValida };
