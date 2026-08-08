// A dónde lleva picarle a alguien (ciclo 10A).
//
// Existe para que no haya tres versiones de esta decisión repartidas por la
// app: hoy la usan PostCard, Amigos y Cerca, y cualquier pantalla nueva que
// muestre personas debería usarla también.
//
// Prefiere el HANDLE porque es la forma compartible y reconocible —`/@luna`
// se puede dictar por teléfono, `/perfil/37` no—. El id queda de respaldo para
// respuestas viejas o parciales que no lo traigan: la ruta `/perfil/:id` sigue
// existiendo y resuelve al mismo perfil.
//
// Devuelve null si no hay con qué armar la ruta, para que quien llame pueda
// pintar el nombre sin enlace en vez de un enlace roto.
export function rutaPerfil(persona) {
  if (!persona) return null;
  if (persona.handle) return `/@${persona.handle}`;
  if (persona.id) return `/perfil/${persona.id}`;
  return null;
}
