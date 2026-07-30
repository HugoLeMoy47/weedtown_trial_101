// Interpreta el 403 de cuarentena de altas nuevas (HU-SEG-007) y arma un
// aviso legible con el tiempo restante, en vez del error genérico que manda
// el backend. Antes esta pantalla no distinguía este caso de cualquier otro
// error — y con el reordenamiento de /login la mayoría de las altas nuevas
// pasa por aquí su primer día, así que merece explicación, no un mensaje plano.
export function mensajeCuarentena(error) {
  const disponibleEn = error?.response?.data?.disponibleEn;
  if (error?.response?.status !== 403 || !disponibleEn) return null;

  const restanteMs = new Date(disponibleEn).getTime() - Date.now();
  const cuando = restanteMs <= 60 * 60 * 1000
    ? 'en menos de una hora'
    : `en unas ${Math.ceil(restanteMs / (60 * 60 * 1000))} horas`;

  return `Tu cuenta es muy nueva para esto todavía — es una protección de la comunidad, no un castigo. `
    + `Podrás hacerlo ${cuando}. Truco: agregar un correo de respaldo en tu perfil acorta la espera.`;
}
