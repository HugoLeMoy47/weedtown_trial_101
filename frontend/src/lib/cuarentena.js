// Interpreta el 403 de cuarentena de altas nuevas (HU-SEG-007) y arma un
// aviso legible con el tiempo restante, en vez del error genérico que manda
// el backend. Antes esta pantalla no distinguía este caso de cualquier otro
// error — y con el reordenamiento de /login la mayoría de las altas nuevas
// pasa por aquí su primer día, así que merece explicación, no un mensaje plano.
//
// Ciclo 13B: el módulo se parte en dos.
//   - `datosCuarentena()` reconoce el error y dice cuándo se libera.
//   - `mensajeCuarentena()` arma la frase de una línea, que es lo que
//     necesitan Chat y Cerca.
// La razón es que el aviso de la solicitud de amistad quiere lo mismo pero
// con enlaces adentro, y no se puede meter un componente dentro de una
// cadena. Antes de partirlo, esa pantalla mostraba el error crudo del
// backend: "Tu cuenta es muy nueva para esta acción", sin decir cuánto falta
// ni qué hacer. Lo encontró el PO probando su propio enlace de invitación.
import { faltaPara } from './fechas';

/** Reconoce el 403 de cuarentena. Devuelve null si el error es cualquier otro. */
export function datosCuarentena(error) {
  const disponibleEn = error?.response?.data?.disponibleEn;
  if (error?.response?.status !== 403 || !disponibleEn) return null;
  return { disponibleEn, cuando: faltaPara(disponibleEn) };
}

export function mensajeCuarentena(error) {
  const datos = datosCuarentena(error);
  if (!datos) return null;

  return `Tu cuenta es muy nueva para esto todavía — es una protección de la comunidad, no un castigo. `
    + `Podrás hacerlo ${datos.cuando}. Truco: agregar un correo de respaldo en tu perfil acorta la espera.`;
}
