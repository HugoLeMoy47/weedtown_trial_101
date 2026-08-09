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
if (!url) abortar('No hay base destino: define DATABASE_URL o pasa --url.');

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
const reviver = (_c, v) => (v && typeof v === 'object' && typeof v.__bytes === 'string')
  ? Buffer.from(v.__bytes, 'base64')
  : v;

async function main() {
  const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'), reviver);
  const destino = describir(url);
  const totalRespaldo = Object.values(respaldo.conteos).reduce((a, b) => a + b, 0);

  console.log('\n  Restauración de WeedTown');
  console.log(`  respaldo: ${path.basename(archivo)}`);
  console.log(`            tomado ${respaldo.tomadoEn} del proyecto ${respaldo.origen.proyecto || respaldo.origen.host} · ${totalRespaldo} filas`);
  console.log(`            migración de origen: ${respaldo.migracion}`);
  console.log(`  destino : proyecto ${destino.proyecto}  ·  ${destino.host}/${destino.base} (schema ${destino.schema})`);
  console.log(`  modo    : ${soloVerificar ? 'solo verificar (no escribe)' : 'RESTAURAR (borra el destino)'}\n`);

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

    if (!soloVerificar) {
      // Vaciar en orden inverso al de carga: los hijos antes que los padres.
      console.log('  Vaciando el destino…');
      for (const modelo of [...respaldo.orden].reverse()) {
        await delegado(modelo).deleteMany({});
      }

      console.log('  Cargando…');
      for (const modelo of respaldo.orden) {
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
      for (const modelo of respaldo.orden) {
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
    for (const modelo of respaldo.orden) {
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
