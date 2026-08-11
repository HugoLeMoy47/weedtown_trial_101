#!/usr/bin/env node
// Consolida los subforos (ciclo 13C).
//
// POR QUÉ: 13 subforos activos, 3 posts en total, 3 salas con algún post.
// Cada sala vacía es una promesa incumplida a quien acaba de llegar: parece un
// lugar abandonado, y con esta actividad lo parece con razón. La estructura de
// trece se pensó para una comunidad más grande y volverá a tener sentido
// cuando la haya — por eso se ARCHIVA, que es reversible, y no se borra nada.
//
// UN SCRIPT Y NO UNA FUNCIÓN DE ADMIN, decidido en el ciclo: mover posts entre
// subforos es una operación que se hace una vez en la vida del proyecto. Una
// pantalla de admin para eso sería peso muerto que hay que mantener y que
// además invita a reorganizar el foro por capricho. Pero el script vive en el
// repo y tiene prueba (tests/consolidacionForos.test.js), que es la otra mitad
// del trato.
//
// Uso:
//   node scripts/consolidar-foros.js --base dev                 (plan, no toca nada)
//   node scripts/consolidar-foros.js --base dev --aplicar
//   node scripts/consolidar-foros.js --base produccion          (plan)
//   node scripts/consolidar-foros.js --base produccion --aplicar
//
// IDEMPOTENTE: correrlo dos veces no hace nada la segunda. El plan se calcula
// contra el estado real cada vez, así que si algo ya está movido, no se mueve.
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

// Mismo cargado en dos pasos que respaldo.js, y por la misma razón: `.env`
// solo trae desarrollo, y sin leer también `.env.produccion` un `--base
// produccion` operaría sobre la base equivocada anunciando éxito.
dotenv.config();
const RUTA_PRODUCCION = path.join(__dirname, '..', '.env.produccion');
if (fs.existsSync(RUTA_PRODUCCION)) dotenv.config({ path: RUTA_PRODUCCION });

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const base = (opcion('--base') || '').toLowerCase();
const aplicar = args.includes('--aplicar');

let url, fuente;
if (opcion('--url')) { url = opcion('--url'); fuente = '--url'; }
else if (base === 'produccion' || base === 'prod') {
  url = process.env.RESPALDO_DATABASE_URL;
  fuente = 'RESPALDO_DATABASE_URL de .env.produccion';
} else if (base === 'dev' || base === 'desarrollo') {
  url = process.env.DATABASE_URL;
  fuente = 'DATABASE_URL de .env (desarrollo)';
} else {
  console.error('\n  ✖ Falta --base: "produccion" o "dev". No hay default a propósito.\n');
  process.exit(1);
}
if (!url) { console.error(`\n  ✖ No hay URL de base para --base ${base}.\n`); process.exit(1); }

const refProyecto = /postgres\.([a-z0-9]{20})/.exec(url)?.[1] || '(sin ref)';

// Las señas de la base SIN credenciales: host, puerto, base y schema. El ref
// del proyecto solo existe en Supabase —el Postgres efímero del CI no tiene
// uno— así que esto es lo único que identifica la base en todos los entornos.
// Se imprime para que quien lea la salida sepa dónde se escribió, y para que
// la prueba pueda comprobarlo (ver tests/consolidacionForos.test.js).
function señasDeLaBase(u) {
  try {
    const x = new URL(u);
    return `${x.hostname}:${x.port || 5432}${x.pathname}?schema=${x.searchParams.get('schema') || 'public'}`;
  } catch { return '(url ilegible)'; }
}
const señas = señasDeLaBase(url);

// GUARDIA: escribir en producción exige haberlo PEDIDO POR SU NOMBRE.
//
// Sin esto, `--url <la url de producción> --aplicar` escribe en producción sin
// que nada lo distinga de una corrida de pruebas — y `--url` es justo la forma
// que usan las pruebas automatizadas. El 2026-08-10 la consolidación apareció
// aplicada en producción sin que se pudiera reconstruir qué invocación la
// ejecutó; el estado final era el correcto y aprobado, pero "salió bien" no es
// lo mismo que "no pudo salir mal".
//
// Es la misma lección que respaldo.js aprendió el 2026-08-09 con la base
// equivocada: la elección de base tiene que ser explícita, y lo implícito
// tiene que fallar ruidoso en vez de funcionar en silencio.
const refProduccion = /postgres\.([a-z0-9]{20})/.exec(process.env.RESPALDO_DATABASE_URL || '')?.[1];
if (aplicar && refProduccion && refProyecto === refProduccion && base !== 'produccion' && base !== 'prod') {
  console.error(
    `\n  ✖ Esta URL es la de PRODUCCIÓN (proyecto ${refProyecto}) y no la pediste por su nombre.\n\n` +
    '    Para escribir en producción:  --base produccion --aplicar\n' +
    '    `--url` sirve para bases sueltas y para las pruebas; con --aplicar\n' +
    '    nunca va a tocar producción por descarte.\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// EL MAPA. Lo decidió el PO el 2026-08-10 sobre la propuesta del análisis; el
// script no elige nada. Cada destino REUTILIZA una sala existente (se le
// cambia nombre, slug y descripción) en vez de crear una nueva: así conserva
// sus posts y su historia, y no aparece un id nuevo sin pasado.
//
// El PO autorizó cambiar también las direcciones: la comunidad es chica y no
// hay enlaces compartidos que valga la pena preservar.
// ---------------------------------------------------------------------------
const PLAN = [
  {
    baseSlug: 'cultivo-de-cannabis',
    nombre: 'Cultivo y elaboración',
    slug: 'cultivo-y-elaboracion',
    descripcion: 'De la semilla al producto: genéticas, sustratos, luz, riego y plagas; y qué hacer después — extracciones, comestibles, tópicos y demás usos de la planta.',
    absorbe: ['metodos-de-extraccion', 'aprovechamiento-de-la-cannabis']
  },
  {
    baseSlug: 'gestion-de-placeres',
    nombre: 'Consumo y cuidado',
    slug: 'consumo-y-cuidado',
    descripcion: 'Cómo se consume y cómo se cuida uno: variedades y efectos, rituales y maridajes, dosis, mezclas, tolerancia y reducción de riesgos. Y de dónde viene todo esto.',
    absorbe: ['reduccion-de-riesgos-y-danos', 'nos-gustan-las-indicas', 'historia-de-la-cannabis']
  },
  {
    baseSlug: 'situacion-legal-de-la-cannabis-en-mexico',
    nombre: 'Legal y calle',
    slug: 'legal-y-calle',
    descripcion: 'Qué dice la ley y qué haces cuando te para una patrulla: amparos, COFEPRIS, derechos ante una revisión, noticias del país y cómo se sostiene económicamente todo esto.',
    absorbe: ['protocolo-ciudadano-y-autoridad', 'noticias-cannabicas', 'economia-de-la-cannabis']
  },
  {
    // Es la sala MÁS SEGUIDA de la red y la creó la comunidad, no el catálogo.
    // Solo se renombra: no absorbe nada y no absorbe a nadie.
    baseSlug: 'este-sitio-web-que-pedo',
    nombre: 'Sobre WeedTown',
    slug: 'sobre-weedtown',
    descripcion: 'Qué falla, qué falta y qué estaría bueno. Aquí se habla del sitio, no de la planta.',
    absorbe: []
  }
];

// Salas que se archivan sin que nadie las absorba: cero posts y cero
// seguidores fuera de quien la creó.
const ARCHIVAR_SUELTAS = ['senadito-420'];

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`\n  Base: ${fuente}  ·  proyecto ${refProyecto}  ·  ${señas}`);
  console.log(`  Modo: ${aplicar ? 'APLICAR (escribe)' : 'plan (no toca nada)'}\n`);

  const todas = await prisma.subForum.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, slug: true }
  });
  const porSlug = new Map(todas.map(s => [s.slug, s]));

  // Antes de escribir nada: que el mapa cuadre con la realidad. Un slug que ya
  // no existe significa que alguien renombró algo o que el script ya corrió a
  // medias, y en los dos casos hay que mirar antes de seguir.
  const faltantes = [];
  for (const d of PLAN) {
    if (!porSlug.has(d.baseSlug) && !porSlug.has(d.slug)) faltantes.push(d.baseSlug);
    for (const s of d.absorbe) if (!porSlug.has(s)) faltantes.push(`${s} (absorbida por ${d.nombre})`);
  }
  for (const s of ARCHIVAR_SUELTAS) if (!porSlug.has(s)) faltantes.push(`${s} (archivar suelta)`);

  if (faltantes.length) {
    console.log('  Salas del plan que ya no están activas (probablemente ya se procesaron):');
    faltantes.forEach(f => console.log(`    · ${f}`));
    console.log('');
  }

  let acciones = 0;

  for (const destino of PLAN) {
    const sala = porSlug.get(destino.baseSlug) || porSlug.get(destino.slug);
    if (!sala) continue;

    const renombrar = sala.name !== destino.nombre || sala.slug !== destino.slug;
    if (renombrar) {
      console.log(`  ${sala.name}  (/${sala.slug})`);
      console.log(`    → «${destino.nombre}»  (/${destino.slug})`);
      acciones++;
    } else {
      console.log(`  «${destino.nombre}» ya tiene su nombre y dirección`);
    }

    for (const slugOrigen of destino.absorbe) {
      const origen = porSlug.get(slugOrigen);
      if (!origen) continue;
      const posts = await prisma.forumPost.count({ where: { subforumId: origen.id } });
      const seguidores = await prisma.subForumFollow.count({ where: { subforumId: origen.id } });
      console.log(`    ← absorbe «${origen.name}»: ${posts} post(s), ${seguidores} seguimiento(s), y se archiva`);
      acciones++;
    }

    if (aplicar) {
      await prisma.$transaction(async (tx) => {
        if (renombrar) {
          await tx.subForum.update({
            where: { id: sala.id },
            data: { name: destino.nombre, slug: destino.slug, description: destino.descripcion }
          });
        }
        for (const slugOrigen of destino.absorbe) {
          const origen = porSlug.get(slugOrigen);
          if (!origen) continue;

          // Los posts se mudan enteros: sus comentarios cuelgan del post, no
          // del subforo, así que viajan solos.
          await tx.forumPost.updateMany({
            where: { subforumId: origen.id },
            data: { subforumId: sala.id }
          });

          // Los seguimientos se MUEVEN, no se borran: quien siguió "Cultivo"
          // quería cultivo, y merece seguir enterándose en la sala que ahora
          // lo cubre.
          //
          // Se identifican por (userId, subforumId), que es la llave primaria
          // compuesta de la tabla — NO tiene columna `id`. Y hay que saltarse
          // a quien ya seguía el destino: un updateMany ciego chocaría contra
          // esa misma llave.
          const seguidores = await tx.subForumFollow.findMany({
            where: { subforumId: origen.id },
            select: { userId: true }
          });
          const yaSiguen = new Set(
            (await tx.subForumFollow.findMany({
              where: { subforumId: sala.id, userId: { in: seguidores.map(s => s.userId) } },
              select: { userId: true }
            })).map(s => s.userId)
          );
          const mover = seguidores.filter(s => !yaSiguen.has(s.userId)).map(s => s.userId);
          if (mover.length) {
            await tx.subForumFollow.updateMany({
              where: { subforumId: origen.id, userId: { in: mover } },
              data: { subforumId: sala.id }
            });
          }
          // Lo que quede apuntando al origen son los duplicados de quien ya
          // seguía el destino: se borran para no dejar filas colgando de una
          // sala archivada.
          await tx.subForumFollow.deleteMany({ where: { subforumId: origen.id } });

          await tx.subForum.update({ where: { id: origen.id }, data: { archivedAt: new Date() } });
        }
      });
    }
    console.log('');
  }

  for (const slug of ARCHIVAR_SUELTAS) {
    const sala = porSlug.get(slug);
    if (!sala) continue;
    const posts = await prisma.forumPost.count({ where: { subforumId: sala.id } });
    console.log(`  «${sala.name}» se archiva sin absorber a nadie (${posts} post(s))`);
    acciones++;
    if (aplicar) {
      if (posts > 0) {
        // Guardia: archivar una sala con contenido lo dejaría solo accesible
        // por enlace directo. El plan dice que está vacía; si no lo está, el
        // plan envejeció y hay que mirarlo, no seguir de largo.
        console.log('    ✖ tiene posts: NO se archiva. Revisa el plan.');
        acciones--;
        continue;
      }
      await prisma.subForum.update({ where: { id: sala.id }, data: { archivedAt: new Date() } });
    }
  }

  // ---- Verificación, siempre, aplique o no ----
  const activasFinal = await prisma.subForum.count({ where: { archivedAt: null } });
  const archivadasFinal = await prisma.subForum.count({ where: { archivedAt: { not: null } } });
  const huerfanos = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS c FROM "ForumPost" fp
    LEFT JOIN "SubForum" s ON s.id = fp."subforumId" WHERE s.id IS NULL`);
  const enArchivadas = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS c FROM "ForumPost" fp
    JOIN "SubForum" s ON s.id = fp."subforumId" WHERE s."archivedAt" IS NOT NULL`);

  console.log('  ─────────────────────────────────────────────');
  console.log(`  ${acciones} cambio(s) ${aplicar ? 'aplicados' : 'por aplicar'}`);
  console.log(`  Estado: ${activasFinal} salas activas · ${archivadasFinal} archivadas`);
  console.log(`  Posts huérfanos: ${huerfanos[0].c}  ·  posts en salas archivadas: ${enArchivadas[0].c}`);
  if (!aplicar && acciones > 0) console.log('\n  Nada se tocó. Agrega --aplicar para ejecutarlo.');
  console.log('');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n  ✖ Error consolidando:', e.message, '\n');
  await prisma.$disconnect();
  process.exit(1);
});
