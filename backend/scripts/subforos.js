#!/usr/bin/env node
// Siembra el catálogo inicial de subforos temáticos (HU-FOR-010/011).
//
// Prerrequisito manual: la cuenta creadora (por defecto @weedtown) se da de
// alta por el flujo normal ANTES de correr este script. El script NO crea
// usuarios — si el handle no existe, falla con un mensaje claro, igual que
// rol.js falla si el handle o el id no existen.
//
// Idempotente: upsert por slug. Si el subforo ya existe se salta entero (ni
// nombre ni descripción se tocan) — así una descripción que la comunidad ya
// editó nunca se sobreescribe por correr el script de nuevo.
//
// Uso:
//   npm run subforos
//   npm run subforos -- --creador=weedtown
//   SUBFORUM_SEED_CREATOR=weedtown npm run subforos
require('dotenv').config();
const prisma = require('../src/lib/prisma');
const { slugify } = require('../src/lib/slugify');

// Mismo tope que exige POST /api/forum/subforums (forumRoutes.js) — no es un
// límite del modelo, así que este script no necesita replicar su lógica,
// solo respetar los mismos números.
const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 300;

// MAX_SUBFORUMS_PER_USER = 3 en forumRoutes.js NO se aplica aquí a propósito:
// es una regla de la ruta HTTP pensada para frenar el spam de una cuenta
// cualquiera creando subforos a mano, no una restricción del modelo de datos.
// Estos 10 son el catálogo institucional de arranque, atribuido a una cuenta
// del proyecto (@weedtown) y revisado en PR — el caso que esa regla no
// necesita frenar.

// Catálogo tal cual la sección 5 (HU-FOR-011) de
// .planeacion/2026-08-05_iteracion7_previews_cta_subforos_plan.md — verificado
// ejecutando slugify(), no a ojo. Dos casos delicados quedan comprobados por
// las pruebas de integración (backend/tests/subforos.test.js):
//   #9 mide exactamente 40 caracteres, el tope de MAX_NAME_LENGTH.
//   #10 usa "y" en vez de guion largo (–): slugify() elimina el guion largo
//   por no estar en [^a-z0-9\s-], y produciría el slug pegado
//   "protocolo-ciudadanoautoridad".
const CATALOGO = [
  {
    name: 'Reducción de riesgos y daños',
    description: 'Información práctica para consumir con menos riesgo: dosis, mezclas, contextos, señales de alerta y qué hacer ante un malviaje.'
  },
  {
    name: 'Gestión de placeres',
    description: 'Disfrutar con intención: rituales, maridajes, música, cocina, ritmo propio y la diferencia entre gozar y arrastrarse.'
  },
  {
    name: 'Cultivo de cannabis',
    description: 'Autocultivo de principio a fin: genéticas, sustratos, luz, riego, plagas, cosecha y curado.'
  },
  {
    name: 'Historia de la cannabis',
    description: 'De dónde viene la planta y cómo llegó aquí: usos ancestrales, prohibición, contracultura y memoria cannábica mexicana.'
  },
  {
    name: 'Aprovechamiento de la cannabis',
    description: 'Usos más allá de fumar: comestibles, tópicos, textil, semilla, fibra y aprovechamiento integral de la planta.'
  },
  {
    name: 'Métodos de extracción',
    description: 'Hachís, hielo seco, rosin, solventes y sus riesgos. Técnicas, equipo, resultados y seguridad ante todo.'
  },
  {
    name: 'Economía de la cannabis',
    description: 'Mercado, precios, oficios cannábicos, emprendimiento y cómo se sostiene económicamente la comunidad.'
  },
  {
    name: 'Noticias cannábicas',
    description: 'Lo que está pasando en México y el mundo: fallos, iniciativas, ciencia, industria y movimiento social.'
  },
  {
    name: 'Situación legal de la cannabis en México',
    description: 'Qué se puede y qué no según la ley vigente: amparos, COFEPRIS, jurisprudencia y cambios normativos, en lenguaje claro.'
  },
  {
    name: 'Protocolo ciudadano y autoridad',
    description: 'Qué hacer ante una revisión o detención: derechos, conducta recomendada, documentación del incidente y a quién acudir.'
  }
];

function args() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

(async () => {
  const a = args();
  const handleCreador = String(a.creador || process.env.SUBFORUM_SEED_CREATOR || 'weedtown')
    .replace(/^@/, '')
    .toLowerCase();

  console.log(`\nSembrando subforos temáticos, atribuidos a @${handleCreador}…\n`);

  const creador = await prisma.user.findUnique({
    where: { handle: handleCreador },
    select: { id: true, handle: true }
  });
  if (!creador) {
    console.error(`✗ No existe ninguna cuenta con handle "${handleCreador}".`);
    console.error(`  Este script no crea usuarios: da de alta @${handleCreador} por el flujo normal y vuelve a correrlo.\n`);
    process.exitCode = 1;
    return;
  }

  const resumen = { creados: [], existentes: [], errores: [] };

  for (const { name, description } of CATALOGO) {
    try {
      if (name.length > MAX_NAME_LENGTH) {
        throw new Error(`nombre de ${name.length} caracteres excede el tope de ${MAX_NAME_LENGTH}`);
      }
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(`descripción de ${description.length} caracteres excede el tope de ${MAX_DESCRIPTION_LENGTH}`);
      }
      const slug = slugify(name);
      if (!slug) throw new Error('el nombre no produjo un slug válido');

      const existente = await prisma.subForum.findUnique({ where: { slug }, select: { id: true, name: true } });
      if (existente) {
        resumen.existentes.push(`${name} (${slug})`);
        console.log(`  · ya existe: ${name} → /${slug}`);
        continue;
      }

      // También puede chocar por nombre si alguien ya creó uno con el mismo
      // texto pero un slug distinto (no debería pasar con este catálogo, pero
      // la ruta HTTP hace la misma comprobación doble).
      const chocaPorNombre = await prisma.subForum.findFirst({ where: { name }, select: { id: true } });
      if (chocaPorNombre) {
        resumen.existentes.push(`${name} (nombre ya usado, slug distinto)`);
        console.log(`  · ya existe con otro slug: ${name}`);
        continue;
      }

      await prisma.subForum.create({
        data: {
          name,
          slug,
          description,
          creatorId: creador.id,
          // Igual que POST /api/forum/subforums: el creador sigue su propio subforo
          followers: { create: { userId: creador.id } }
        }
      });
      resumen.creados.push(`${name} (${slug})`);
      console.log(`  ✓ creado: ${name} → /${slug}`);
    } catch (e) {
      resumen.errores.push(`${name}: ${e.message}`);
      console.error(`  ✗ error en "${name}": ${e.message}`);
    }
  }

  console.log('\nResumen:');
  console.log(`  Creados:    ${resumen.creados.length}`);
  console.log(`  Existentes: ${resumen.existentes.length}`);
  console.log(`  Errores:    ${resumen.errores.length}`);
  console.log('');

  if (resumen.errores.length) process.exitCode = 1;
})()
  .catch(e => {
    console.error('\n✗ Error inesperado:', e.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
