// Que el mapa del respaldo no se desfase del esquema.
//
// POR QUÉ EXISTE, y la fecha importa: el 2026-08-11, tres horas después de
// mergear la Ola 5, un respaldo de producción se negó a correr porque el
// ciclo 13A había agregado `ConteoAtribucion` al esquema y nadie la agregó a
// `scripts/lib/respaldo-tablas.js`. La guardia de `respaldo.js` hizo su
// trabajo y evitó un respaldo incompleto anunciado como completo.
//
// Pero esa guardia solo avisa CUANDO SE CORRE UN RESPALDO. Entre la migración
// y el siguiente respaldo hay una ventana —en este caso, dos días— en la que
// el repo está mal y nadie lo sabe. Si en esa ventana hubiera hecho falta
// restaurar, la tabla nueva simplemente no habría estado.
//
// Es el mismo patrón que el 12A cerró para `swagger.json`: no fue descuido de
// nadie, era que no existía un paso que lo impidiera. Esta prueba es ese paso,
// con la misma fuente de verdad que usa el respaldo real: el esquema.
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');
const { MODELOS, GRUPOS, DEPENDE_DE } = require('../scripts/lib/respaldo-tablas');

const ESQUEMA = path.join(__dirname, '..', 'prisma', 'schema.prisma');

/** Los modelos declarados en schema.prisma, en orden de aparición. */
function modelosDelEsquema() {
  const texto = fs.readFileSync(ESQUEMA, 'utf8');
  return [...texto.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]);
}

/**
 * TODAS las llaves foráneas de cada modelo, obligatorias y OPCIONALES.
 *
 * La distinción es la que costó una restauración fallida el 2026-08-11:
 * `DEPENDE_DE` lista a propósito solo las obligatorias, porque es lo que hace
 * falta para que un RECORTE tenga sentido. Pero el ORDEN de inserción tiene
 * que respetar también las opcionales — "opcional" quiere decir que la columna
 * acepta null, no que no haya filas que la usen. Había 80 reacciones, y varias
 * apuntaban a posts del foro que todavía no existían.
 *
 * La primera versión de esta prueba validaba el orden contra DEPENDE_DE y por
 * eso pasó en verde con el orden roto: comprobaba la lista equivocada.
 */
function relacionesDelEsquema() {
  const texto = fs.readFileSync(ESQUEMA, 'utf8');
  const relaciones = {};
  for (const [, nombre, cuerpo] of texto.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const destinos = new Set();
    for (const m of cuerpo.matchAll(/^\s*\w+\s+(\w+)(\?|\[\])?\s+@relation\([^)]*fields:/gm)) {
      destinos.add(m[1]);
    }
    relaciones[nombre] = [...destinos];
  }
  return relaciones;
}

module.exports = async function run() {
  const { results, check } = suite('RespaldoTablas', 'wtrtab');

  const enEsquema = modelosDelEsquema();
  const enMapa = MODELOS;

  console.log(`\n  — ${enEsquema.length} modelos en el esquema · ${enMapa.length} en el mapa del respaldo —`);

  const faltan = enEsquema.filter(m => !enMapa.includes(m));
  check('ningún modelo del esquema falta en MODELOS',
    faltan.length === 0,
    faltan.length
      ? `\n      FALTAN: ${faltan.join(', ')}\n      → agrégalos a MODELOS (en su lugar del orden de dependencias),\n        a DEPENDE_DE, y si aplica a un grupo de GRUPOS.`
      : '');

  const sobran = enMapa.filter(m => !enEsquema.includes(m));
  check('MODELOS no lista tablas que ya no existen',
    sobran.length === 0,
    sobran.length ? `\n      SOBRAN: ${sobran.join(', ')} — se quitaron del esquema y siguen en el mapa.` : '');

  const sinDependencias = enMapa.filter(m => !(m in DEPENDE_DE));
  check('cada tabla declara de qué depende (aunque sea de nada)',
    sinDependencias.length === 0,
    sinDependencias.length ? `\n      SIN ENTRADA en DEPENDE_DE: ${sinDependencias.join(', ')}` : '');

  // LA PROPIEDAD QUE IMPORTA EL DÍA MALO, y la que falló de verdad: el orden de
  // MODELOS es el orden de inserción, y una tabla no puede ir antes que
  // ninguna a la que apunte — con FK obligatoria U OPCIONAL. Se valida contra
  // el esquema, no contra DEPENDE_DE: ver el comentario de
  // `relacionesDelEsquema`.
  const relaciones = relacionesDelEsquema();
  const fueraDeOrden = [];
  enMapa.forEach((tabla, i) => {
    for (const destino of relaciones[tabla] || []) {
      if (destino === tabla) continue; // auto-referencias: es orden de filas, no de tablas
      const j = enMapa.indexOf(destino);
      if (j === -1 || j > i) {
        fueraDeOrden.push(`${tabla} (posición ${i}) se inserta ANTES que ${destino} (${j}), al que apunta`);
      }
    }
  });
  check('el orden de MODELOS es restaurable, contando también las FK opcionales',
    fueraDeOrden.length === 0,
    fueraDeOrden.length ? `\n      ${fueraDeOrden.join('\n      ')}` : '');

  const depsInventadas = [];
  for (const [tabla, deps] of Object.entries(DEPENDE_DE)) {
    for (const d of deps) if (!enMapa.includes(d)) depsInventadas.push(`${tabla} → ${d}`);
  }
  check('las dependencias apuntan a tablas que existen',
    depsInventadas.length === 0,
    depsInventadas.length ? `\n      ${depsInventadas.join(', ')}` : '');

  const gruposRotos = [];
  for (const [grupo, tablas] of Object.entries(GRUPOS)) {
    for (const t of tablas) if (!enMapa.includes(t)) gruposRotos.push(`${grupo} → ${t}`);
  }
  check('los grupos solo mencionan tablas reales',
    gruposRotos.length === 0,
    gruposRotos.length ? `\n      ${gruposRotos.join(', ')}` : '');

  // No se exige que toda tabla pertenezca a un grupo —los grupos son los
  // recortes que de verdad se piden, no una taxonomía completa— pero sí se
  // reporta, porque una tabla huérfana suele ser una que se olvidó de clasificar.
  const sinGrupo = enMapa.filter(m => !Object.values(GRUPOS).some(g => g.includes(m)));
  console.log(`  · fuera de todo grupo (informativo, no es error): ${sinGrupo.length ? sinGrupo.join(', ') : 'ninguna'}`);

  return results;
};
