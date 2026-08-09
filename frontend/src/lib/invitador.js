// Quién invitó, deducido de la ruta a la que se volvía (ciclo 11A).
//
// Vive en su propio módulo, sin importar nada, por la misma razón que
// `rutaInterna.js`: es la única parte del mecanismo de invitaciones que
// interpreta texto venido de una URL, decide A QUIÉN se le acredita, y por
// eso quiere pruebas propias. `attribution.js` arrastra `services/api`, que no
// se puede cargar en el entorno de pruebas unitarias.
//
// Quien invita comparte `/@luna` a secas — el `?ref=perfil` lo agrega nuestro
// propio PublicProfile al mandar al login. Así que el handle ya viaja dentro
// de `next` y NO hace falta un parámetro nuevo en la URL: uno más sería una
// superficie más que validar y otra cosa falsificable a mano.

/**
 * @param {string|null} next ruta interna a la que se volvía tras el login
 * @returns {string|null} el handle en minúsculas, o null si `next` no es un perfil
 */
export function invitadorDeNext(next) {
  // El mismo formato que acepta la ruta: números, guion bajo y letras — que se
  // normalizan a minúsculas, igual que hace el backend. Un enlace compartido
  // como `/@Luna` resuelve al perfil sin problema, así que tiene que contar la
  // invitación también; exigir minúsculas aquí las perdía en silencio.
  //
  // El `$` del final no es decorativo: sin él, `/@luna/algo` casaría y le
  // acreditaría la invitación a `luna` desde una ruta que no es su perfil.
  const m = /^\/@([A-Za-z0-9][A-Za-z0-9_]{2,19})$/.exec(next || '');
  return m ? m[1].toLowerCase() : null;
}
