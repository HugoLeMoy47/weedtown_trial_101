// Conteo de intentos de atribución de alta (ciclo 13A).
//
// El 11A dejó el mecanismo de invitación funcionando y sin forma de auditarlo:
// la única señal es una línea de log que el reinicio del contenedor se lleva.
// Este módulo persiste el MISMO evento como conteo diario, sin identidades.
//
// La regla que gobierna el archivo entero: aquí no se guarda a nadie. Si
// alguna vez pareciera necesario agregar un `userId` "solo para depurar",
// significa que se salió del alcance — el contador ciego del 11A dejaría de
// serlo, y la prueba `atribucion.test.js` está escrita para impedirlo.
const prisma = require('./prisma');
const { diaMexicoISO } = require('./diaMexico');
const { log } = require('./logger');

// Los escalones del recorrido. Un intento cae en EXACTAMENTE uno, y la suma
// de todos es el total de intentos del día.
//
// Están en orden de recorrido, no alfabético: se lee como la secuencia por la
// que pasa una petición, y así se ve de un vistazo dónde se cae la gente.
const RESULTADOS = {
  // Llegó sin un `ref` de la lista blanca. Es la puerta más externa: casi
  // siempre significa una petición que no salió del recorrido normal.
  REF_NO_VALIDO: 'ref_no_valido',
  // La cuenta ya no es nueva (más de ATRIBUCION_VENTANA_MS desde el alta).
  // Segunda defensa contra un POST suelto sobre una cuenta vieja.
  FUERA_DE_VENTANA: 'fuera_de_ventana',
  // `ref` válido pero no es 'perfil': el alta vino de un CTA que no lleva
  // invitador (un posteo público, un enlace directo). Cuenta como llegada
  // atribuible al canal, pero no incrementa el contador de nadie.
  SIN_INVITADOR: 'sin_invitador',
  // ref=perfil pero el handle que traía no tiene forma de handle. Un enlace
  // manipulado o una versión vieja del cliente.
  HANDLE_MAL_FORMADO: 'handle_mal_formado',
  // Alguien abrió su PROPIO enlace y se dio de alta. No es fraude: casi
  // siempre es la persona probando su liga. Se cuenta aparte justamente para
  // no confundir una prueba con una invitación real.
  AUTO_INVITACION: 'auto_invitacion',
  // ref=perfil, handle bien formado, y aun así no incrementó a nadie: el
  // handle no existe o la cuenta está borrada. **No se distingue cuál de las
  // dos** — hacerlo sería el oráculo de existencia de handles que el 10A
  // cerró, y el diagnóstico no lo necesita.
  ENLACE_SIN_DESTINO: 'enlace_sin_destino',
  // El caso bueno: el contador de alguien subió.
  ATRIBUIDA: 'atribuida',
  // Frenada por el limitador del endpoint antes de llegar a la lógica.
  LIMITADA: 'limitada'
};

const VALIDOS = new Set(Object.values(RESULTADOS));

// `INSERT ... ON CONFLICT DO UPDATE` en vez de `upsert` de Prisma: el upsert
// hace SELECT y luego INSERT/UPDATE en dos viajes, y dos altas simultáneas del
// mismo día pueden chocar contra el único con P2002. El ON CONFLICT lo
// resuelve Postgres en una sola sentencia atómica.
//
// NUNCA lanza. La atribución es observacional (criterio 5 de HU-CTA-002): que
// falle un contador no puede tumbar el alta de nadie, que es lo único que de
// verdad importa en ese momento.
async function registrar(resultado, requestId) {
  if (!VALIDOS.has(resultado)) {
    log('atribucion_resultado_desconocido', { resultado, requestId });
    return;
  }
  try {
    const dia = diaMexicoISO();
    await prisma.$executeRaw`
      INSERT INTO "ConteoAtribucion" ("dia", "resultado", "conteo")
      VALUES (${dia}::date, ${resultado}, 1)
      ON CONFLICT ("dia", "resultado")
      DO UPDATE SET "conteo" = "ConteoAtribucion"."conteo" + 1
    `;
  } catch (e) {
    console.error('No se pudo registrar el conteo de atribución:', e.message);
  }
}

module.exports = { RESULTADOS, registrar };
