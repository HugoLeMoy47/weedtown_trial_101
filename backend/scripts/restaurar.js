#!/usr/bin/env node
// Restaura un respaldo de `respaldo.js` en una base, y comprueba que quedó
// igual.
//
// POR QUÉ EXISTE: un respaldo que nadie ha restaurado nunca no es un respaldo,
// es un archivo. El día que haga falta no es el día de descubrir que el orden
// de las tablas estaba mal o que las llaves de acceso se corrompieron al
// serializar. Este script es la mitad que convierte al otro en una garantía.
//
//   node scripts/restaurar.js --archivo "D:/respaldos-weedtown/weedtown-....json"
//   node scripts/restaurar.js --archivo "..." --url "postgresql://..."   (destino explícito)
//   node scripts/restaurar.js --archivo "..." --solo-verificar           (no escribe nada)
//
// Sin --url escribe en DATABASE_URL, es decir, en tu base de DESARROLLO. Es el
// default a propósito: verificar un respaldo es justo para lo que sirve tener
// una base desechable.
//
// BORRA TODO lo que haya en la base destino antes de cargar. Por eso se niega
// a correr contra la base de donde salió el respaldo salvo que se lo pidas dos
// veces (--forzar), y por eso el destino se imprime antes de tocar nada.
//
// El esquema tiene que existir ya y coincidir con el del respaldo: primero
// `npx prisma migrate deploy` contra el destino, luego esto.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { MODELOS } = require('./lib/respaldo-tablas');

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const bandera = (n) => args.includes(n);

const archivo = opcion('--archivo');
const url = opcion('--url') || process.env.DATABASE_URL;
const soloVerificar = bandera('--solo-verificar');
const forzar = bandera('--forzar');

function abortar(m) { console.error(`\n  ✖ ${m}\n`); process.exit(1); }

if (!archivo) abortar('Falta --archivo con la ruta del respaldo.');
if (!fs.existsSync(archivo)) abortar(`No existe: ${path.resolve(archivo)}`);

// Igual que en respaldo.js: lo que identifica una base de Supabase es el
// PROJECT REF del usuario, no el host — todos los proyectos de una región
// comparten hostname. Comparar por host aquí tenía una consecuencia concreta:
// la guardia de "mismo origen" se disparaba al restaurar un respaldo de
// producción en desarrollo, que es exactamente la verificación que se quiere
// poder hacer.
function describir(c) {
  try {
    const u = new URL(c);
    return {
      proyecto: u.username.split('.')[1] || '(sin project-ref)',
      host: u.hostname,
      base: u.pathname.replace(/^\//, ''),
      schema: u.searchParams.get('schema') || 'public'
    };
  } catch { return { proyecto: '?', host: '(ilegible)', base: '?', schema: '?' }; }
}

// Al leer, deshacemos la marca que `respaldo.js` puso sobre los Bytes.
//
// Y también se rescatan los respaldos VIEJOS. Hasta el 12D el reemplazo de
// `respaldo.js` no reconocía los `Uint8Array` que devuelve Prisma 6, así que
// las claves públicas de las llaves de acceso quedaron guardadas como
// {"0":4,"1":91,…} en vez de base64. Los datos ESTÁN completos, solo con otra
// forma: se reconocen y se reconstruyen aquí en vez de exigir volver a tomar
// el respaldo. Un respaldo que ya existe y se puede leer vale más que uno
// perfecto que hay que rehacer — y el de producción del 2026-08-09 es ése.
function esBytesNumerado(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const claves = Object.keys(v);
  if (!claves.length) return false;
  // Todas las claves son índices consecutivos desde 0, y los valores son bytes.
  return claves.every((k, i) => k === String(i) && Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= 255);
}

const reviver = (_c, v) => {
  if (v && typeof v === 'object' && typeof v.__bytes === 'string') return Buffer.from(v.__bytes, 'base64');
  if (esBytesNumerado(v)) return Buffer.from(Object.values(v));
  return v;
};

// --revisar-archivo: coherencia del archivo consigo mismo, SIN base de datos.
//
// Existe porque fue esta comprobación la que encontró que las claves públicas
// de las llaves de acceso se habían guardado mal (12D) — algo que el viaje
// redondo contra la base de desarrollo NO podía ver, porque ahí no hay
// ninguna llave. Verificar contra una base solo prueba lo que esa base
// contiene; verificar el archivo prueba el archivo.
//
// NO IMPRIME NINGÚN DATO: solo nombres de tabla, conteos y booleanos. El
// archivo lleva correos, teléfonos y mensajes privados de personas reales, y
// comprobarlo no es motivo para leerlos.
if (bandera('--revisar-archivo')) {
  const j = JSON.parse(fs.readFileSync(archivo, 'utf8'), reviver);
  const mb = (fs.statSync(archivo).size / 1048576).toFixed(2);
  console.log(`\n  ${path.basename(archivo)} · ${mb} MB · versión ${j.version}`);
  console.log(`  proyecto ${j.origen?.proyecto || j.origen?.host} · migración ${j.migracion}`);
  // `completo` no existe antes de la versión 2: esos respaldos son completos
  // por construcción, porque el modo selectivo todavía no existía.
  const completo = j.version >= 2 ? j.completo === true : true;
  console.log(`  alcance: ${completo ? 'completo' : 'PARCIAL'}\n`);

  let fallos = 0;
  const revisar = (ok, msg) => { console.log(`  ${ok ? '✓' : '✖'} ${msg}`); if (!ok) fallos++; };

  revisar(Array.isArray(j.orden) && j.orden.length > 0, `${j.orden?.length} tablas en el orden de restauración`);
  const descuadres = (j.orden || []).filter(t => (j.datos?.[t]?.length ?? -1) !== j.conteos?.[t]);
  revisar(descuadres.length === 0,
    descuadres.length ? `el manifiesto NO cuadra en: ${descuadres.join(', ')}` : 'el manifiesto cuadra con los datos');

  // Los campos Bytes son los que se rompen en silencio: si no vuelven como
  // Buffer, restaurar deja una llave de acceso inservible y nadie se entera
  // hasta que alguien intenta recuperar su cuenta.
  const llaves = j.datos?.Passkey || [];
  revisar(llaves.every(k => Buffer.isBuffer(k.publicKey)),
    llaves.length ? `${llaves.length} llaves de acceso con su clave pública legible` : 'sin llaves de acceso que revisar');

  const total = Object.values(j.conteos || {}).reduce((a, b) => a + b, 0);
  console.log(`\n  ${total} filas en total.`);
  console.log(fallos ? `\n  ✖ ${fallos} problemas.\n` : '\n  ✔ El archivo es coherente y legible.\n');
  process.exit(fallos ? 1 : 0);
}

// A partir de aquí sí hace falta una base: --revisar-archivo ya salió arriba.
if (!url) abortar('No hay base destino: define DATABASE_URL o pasa --url.');

async function main() {
  const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'), reviver);
  const destino = describir(url);
  const totalRespaldo = Object.values(respaldo.conteos).reduce((a, b) => a + b, 0);

  console.log('\n  Restauración de WeedTown');
  console.log(`  respaldo: ${path.basename(archivo)}`);
  console.log(`            tomado ${respaldo.tomadoEn} del proyecto ${respaldo.origen.proyecto || respaldo.origen.host} · ${totalRespaldo} filas`);
  console.log(`            migración de origen: ${respaldo.migracion}`);
  console.log(`  destino : proyecto ${destino.proyecto}  ·  ${destino.host}/${destino.base} (schema ${destino.schema})`);
  console.log(`  modo    : ${soloVerificar ? 'solo verificar (no escribe)' : 'RESTAURAR (borra el destino)'}`);
  console.log(`  alcance : ${respaldo.completo === false ? `PARCIAL — sin ${(respaldo.omitidas || []).join(', ')}` : 'completo'}\n`);

  // Un respaldo parcial NO se puede usar como restauración: vaciar el destino
  // y cargar solo unas tablas deja la base con las demás en blanco. Es la
  // forma más fácil de destruir datos creyendo que se están recuperando, y el
  // nombre del archivo (`-parcial`) no basta si el script no lo comprueba.
  if (respaldo.completo === false && !soloVerificar) {
    abortar(
      'Este respaldo es PARCIAL y restaurar vacía el destino por completo.\n\n' +
      `    Solo trae: ${respaldo.orden.join(', ')}\n` +
      `    Le faltan: ${(respaldo.omitidas || []).join(', ')}\n\n` +
      '    Cargarlo dejaría las tablas faltantes VACÍAS: eso no es recuperar, es\n' +
      '    perder lo que no venía en el recorte.\n\n' +
      '    Usa --solo-verificar para inspeccionarlo, o restaura un respaldo completo.'
    );
  }

  // La guardia que importa: no restaurar encima del origen por accidente.
  // Restaurar es borrar primero, así que equivocarse aquí es el peor caso
  // posible — perder los datos que se estaban intentando proteger.
  // Respaldos de la versión 1 no guardaban `proyecto`; para esos se cae al
  // host, que es lo único que había.
  const origenId = respaldo.origen.proyecto || respaldo.origen.host;
  const destinoId = respaldo.origen.proyecto ? destino.proyecto : destino.host;
  if (origenId === destinoId && destino.schema === respaldo.origen.schema && !soloVerificar && !forzar) {
    abortar(
      'El destino es la MISMA base de la que salió este respaldo.\n\n' +
      '    Restaurar borra el destino antes de cargar. Si es un error, cambia\n' +
      '    --url. Si de verdad quieres sobrescribir el origen —una recuperación\n' +
      '    real— agrega --forzar.'
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Que el esquema del destino sea el mismo del respaldo. Cargar datos sobre
    // un esquema distinto produce errores raros a mitad del proceso, con la
    // base ya vaciada — el peor momento para descubrirlo.
    const m = await prisma.$queryRaw`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1
    `;
    const migracionDestino = m[0]?.migration_name || '(ninguna)';
    if (migracionDestino !== respaldo.migracion) {
      console.log(`  ⚠ El destino está en "${migracionDestino}" y el respaldo se tomó en "${respaldo.migracion}".`);
      if (!forzar) abortar('Corre `npx prisma migrate deploy` contra el destino, o agrega --forzar si sabes que da igual.');
    }

    const delegado = (modelo) => prisma[modelo[0].toLowerCase() + modelo.slice(1)];

    // EL ORDEN DE CARGA LO MANDA EL MAPA ACTUAL, no el que trae el archivo.
    //
    // Parece un detalle y es la diferencia entre tener respaldos y no tenerlos.
    // El 2026-08-11, la primera vez que se probó una restauración con un
    // archivo real de producción, falló: `Reaction` iba antes que `ForumPost`
    // porque su FK hacia el foro es opcional y el orden solo contemplaba las
    // obligatorias. Se corrigió el mapa — pero **todos los respaldos ya
    // tomados llevan el orden viejo grabado adentro**, así que respetarlo los
    // condenaba a seguir siendo irrestaurables para siempre.
    //
    // El orden correcto es una propiedad del ESQUEMA, no del archivo: vive en
    // el código, se corrige en el código, y así una corrección de hoy rescata
    // los respaldos de ayer. Del archivo se toma QUÉ tablas trae; de aquí, en
    // qué secuencia entran.
    const enElArchivo = new Set(respaldo.orden);
    const orden = MODELOS.filter(m => enElArchivo.has(m));
    const desconocidas = respaldo.orden.filter(m => !MODELOS.includes(m));
    if (desconocidas.length) {
      abortar(
        `El archivo trae tablas que el mapa actual no conoce: ${desconocidas.join(', ')}.\n\n` +
        '    Restaurarlas sin saber su lugar en el orden dejaría la base a medias.\n' +
        '    Agrégalas a scripts/lib/respaldo-tablas.js.'
      );
    }
    if (orden.join('|') !== respaldo.orden.join('|')) {
      console.log('  ℹ Se reordenan las tablas según el mapa actual (el archivo traía otro orden).');
    }

    if (!soloVerificar) {
      // Vaciar en orden inverso al de carga: los hijos antes que los padres.
      console.log('  Vaciando el destino…');
      for (const modelo of [...orden].reverse()) {
        await delegado(modelo).deleteMany({});
      }

      console.log('  Cargando…');
      for (const modelo of orden) {
        const filas = respaldo.datos[modelo] || [];
        if (!filas.length) continue;
        // createMany en lotes: de un jalón, un respaldo grande revienta el
        // límite de parámetros de Postgres.
        for (let i = 0; i < filas.length; i += 500) {
          await delegado(modelo).createMany({ data: filas.slice(i, i + 500), skipDuplicates: true });
        }
      }

      // Las secuencias de los id autoincrementales se quedan en 1 después de
      // insertar con ids explícitos: el siguiente insert de la app chocaría con
      // una llave duplicada. Es el error clásico de restaurar así, y aparece
      // horas después, cuando alguien intenta publicar.
      console.log('  Reajustando secuencias…');
      for (const modelo of orden) {
        const filas = respaldo.datos[modelo] || [];
        if (!filas.length || typeof filas[0].id !== 'number') continue;
        const max = Math.max(...filas.map(f => f.id));
        await prisma.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${modelo}"', 'id'), ${max}, true)`
        );
      }
    }

    // Verificación: contar en el destino y comparar contra el manifiesto.
    console.log('\n  Verificando…\n');
    let fallas = 0;
    for (const modelo of orden) {
      const esperado = respaldo.conteos[modelo] ?? 0;
      const real = await delegado(modelo).count();
      const ok = real === esperado;
      if (!ok) fallas++;
      if (!ok || esperado > 0) {
        console.log(`  ${ok ? '✓' : '✖'} ${modelo.padEnd(20)} esperado ${String(esperado).padStart(6)}  real ${String(real).padStart(6)}`);
      }
    }

    if (fallas) {
      console.log(`\n  ✖ ${fallas} tablas no coinciden. El respaldo NO está verificado.\n`);
      process.exit(1);
    }
    console.log(`\n  ✔ Las ${respaldo.orden.length} tablas coinciden. El respaldo se puede restaurar.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('\n  ✖', e.message, '\n'); process.exit(1); });
