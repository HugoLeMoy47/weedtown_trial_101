#!/usr/bin/env node
// Respaldo de la base a un archivo JSON.
//
// POR QUÉ EXISTE, dicho sin adornos: el plan gratuito de Supabase NO hace
// respaldos automáticos. Hay cuentas reales con posteos, foros y chats que la
// comunidad no puede reconstruir, y hasta hoy no existía ninguna copia. Es el
// único pendiente del proyecto cuyo peor caso no se puede arreglar después.
//
// POR QUÉ NO ES UN pg_dump. Sería el artefacto estándar, pero esta máquina no
// tiene las herramientas cliente de PostgreSQL instaladas ni Docker para
// prestarlas. Un respaldo que existe hoy vale más que el respaldo perfecto de
// la semana que viene, así que esto usa lo que ya está: Prisma y Node.
//
//   node scripts/respaldo.js --destino "D:/respaldos-weedtown"
//   node scripts/respaldo.js --destino "..." --url "postgresql://..."
//
// La cadena de conexión se toma, en este orden: --url, RESPALDO_DATABASE_URL,
// o DATABASE_URL del .env. Para respaldar PRODUCCIÓN, lo más seguro es poner
// RESPALDO_DATABASE_URL en `backend/.env.produccion` (que .gitignore ya excluye
// por el patrón `.env.*`) en vez de pasarla por línea de comandos, donde queda
// en el historial de la terminal.
//
// LO QUE ESTE RESPALDO **NO** CUBRE:
//   - Las imágenes. Viven en Supabase Storage, no en la base; aquí solo se
//     guarda su URL. Restaurar esto deja los posteos con enlaces a archivos
//     que hay que respaldar aparte.
//   - El esquema. Se reconstruye con `prisma migrate deploy`, que sí está en
//     git. Por eso el archivo guarda con qué migración se tomó: restaurar
//     sobre un esquema distinto al de origen es cómo un respaldo falla el día
//     que se necesita.
//
// EL ARCHIVO CONTIENE DATOS PERSONALES REALES: correos, teléfonos, mensajes
// privados de chat y posteos de solo-amistades. Guárdalo cifrado o en un lugar
// que solo tú abras, y NUNCA dentro del repositorio.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

// Se cargan LOS DOS archivos, y en este orden. La primera versión solo hacía
// `dotenv.config()` —que lee `.env`— mientras el README mandaba a poner
// RESPALDO_DATABASE_URL en `.env.produccion`. Resultado: el archivo existía,
// estaba bien escrito, y el script lo ignoraba y respaldaba desarrollo
// anunciando "✔ respaldo completo". Un respaldo de la base equivocada que se
// reporta como éxito es peor que no tener respaldo: da confianza falsa.
// (2026-08-09: pasó de verdad; lo cachó el PO porque sabía cuántas cuentas hay.)
dotenv.config();
const RUTA_PRODUCCION = path.join(__dirname, '..', '.env.produccion');
const hayArchivoProduccion = fs.existsSync(RUTA_PRODUCCION);
if (hayArchivoProduccion) dotenv.config({ path: RUTA_PRODUCCION });

// Orden de exportación = orden de restauración. Las tablas sin llaves foráneas
// primero, y cada una después de aquellas a las que apunta. Restaurar en otro
// orden falla por violación de FK, así que el orden vive aquí y no en la
// cabeza de quien restaure a las 3 de la mañana.
const MODELOS = [
  'User', 'Identity', 'Passkey', 'MagicLink', 'MastodonApp',
  'Block', 'FriendRequest',
  'SubForum', 'SubForumFollow',
  'Post', 'Hashtag', 'HashtagOnPost', 'PalabraDescartada',
  'Comment', 'Reaction',
  'ForumPost', 'ForumComment',
  'Chat', 'Message',
  'Report', 'ModerationAction', 'Notification',
  'MarketItem', 'PrivacyAction', 'Media'
];

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : null;
};

// De dónde salió la cadena se RASTREA, no solo se resuelve: es lo que se
// imprime después para que no haya que adivinar qué base se está leyendo.
let url, fuente;
if (opcion('--url')) { url = opcion('--url'); fuente = '--url (línea de comandos)'; }
else if (process.env.RESPALDO_DATABASE_URL) {
  url = process.env.RESPALDO_DATABASE_URL;
  fuente = hayArchivoProduccion ? 'RESPALDO_DATABASE_URL de .env.produccion' : 'RESPALDO_DATABASE_URL del entorno';
} else { url = process.env.DATABASE_URL; fuente = 'DATABASE_URL de .env — LA BASE DE DESARROLLO'; }

const destino = opcion('--destino');
const aceptoDesarrollo = args.includes('--acepto-desarrollo');

function abortar(mensaje) {
  console.error(`\n  ✖ ${mensaje}\n`);
  process.exit(1);
}

if (!url) abortar('No hay cadena de conexión. Usa --url, RESPALDO_DATABASE_URL o DATABASE_URL.');
if (!destino) {
  abortar(
    'Falta --destino.\n\n' +
    '    Se exige a propósito y no tiene default: el respaldo NO debe caer dentro\n' +
    '    del repositorio. Lleva correos, teléfonos y mensajes privados de personas\n' +
    '    reales, y un `git add .` distraído lo publicaría.\n\n' +
    '      node scripts/respaldo.js --destino "D:/respaldos-weedtown"'
  );
}

// Guardia: el destino no puede estar dentro del repositorio. No basta con
// decirlo en un comentario — la comprobación es la que evita el accidente.
const raizRepo = path.resolve(__dirname, '..', '..');
const destinoAbs = path.resolve(destino);
if (destinoAbs === raizRepo || destinoAbs.startsWith(raizRepo + path.sep)) {
  abortar(
    `El destino está dentro del repositorio (${raizRepo}).\n\n` +
    '    Elige una carpeta fuera: el archivo contiene datos personales reales y\n' +
    '    no debe convivir con código versionado.'
  );
}

// De qué base estamos hablando. Se imprime SIN la contraseña, igual que el log
// `arranque_base_de_datos` de app.js: la pregunta "¿esto es producción?" tiene
// que contestarse de un vistazo, y la respuesta no exige ver el secreto.
//
// El PROYECTO es lo que hay que mirar, no el host. Todos los proyectos de
// Supabase de una misma región comparten el hostname del pooler
// (aws-0-us-west-1.pooler.supabase.com), así que desarrollo y producción se
// ven IDÉNTICOS por host. El discriminador vive en el usuario:
// `postgres.<project-ref>`. Un banner que solo muestre el host no ayuda a
// contestar "¿esto es producción?" — que es justo la pregunta.
function describir(cadena) {
  try {
    const u = new URL(cadena);
    return {
      host: u.hostname,
      puerto: u.port || '5432',
      proyecto: u.username.split('.')[1] || '(sin project-ref)',
      base: u.pathname.replace(/^\//, ''),
      schema: u.searchParams.get('schema') || 'public'
    };
  } catch {
    return { host: '(cadena ilegible)', puerto: '?', proyecto: '?', base: '?', schema: '?' };
  }
}

// ¿Esta cadena es la misma que usa el desarrollo? Se compara por PROJECT REF,
// no por cadena literal: el mismo proyecto se puede escribir con el pooler
// (6543) o con la conexión directa (5432) y seguir siendo la misma base.
function esLaDeDesarrollo(cadena) {
  const propia = describir(cadena).proyecto;
  const dev = process.env.DATABASE_URL ? describir(process.env.DATABASE_URL).proyecto : null;
  return dev && propia === dev;
}

async function main() {
  const donde = describir(url);
  console.log('\n  Respaldo de WeedTown');
  console.log(`  origen  : proyecto ${donde.proyecto}  ·  ${donde.host}:${donde.puerto}/${donde.base} (schema ${donde.schema})`);
  console.log(`  cadena  : ${fuente}`);
  console.log(`  destino : ${destinoAbs}\n`);

  // La guardia que faltaba el 2026-08-09. Respaldar desarrollo es legítimo
  // —así se prueba la herramienta— pero tiene que ser una decisión, no el
  // resultado de que un archivo no se cargó.
  if (esLaDeDesarrollo(url) && !aceptoDesarrollo) {
    abortar(
      `El proyecto ${donde.proyecto} es EL MISMO que tu DATABASE_URL de .env: esto es DESARROLLO.\n\n` +
      (hayArchivoProduccion
        ? '    .env.produccion existe, así que revisa que dentro diga exactamente\n' +
          '    RESPALDO_DATABASE_URL= (ese nombre) y que la cadena sea la del otro proyecto.\n\n'
        : '    No existe backend/.env.produccion. Créalo con una línea:\n' +
          '      RESPALDO_DATABASE_URL="postgresql://postgres.<ref-de-produccion>:...@...:5432/postgres"\n\n') +
      '    OJO: todos los proyectos de Supabase de una región comparten hostname.\n' +
      '    Lo que distingue producción de desarrollo es el <ref> del usuario, no el host.\n\n' +
      '    Si de verdad quieres respaldar desarrollo, agrega --acepto-desarrollo.'
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const datos = {};
  const conteos = {};
  let total = 0;

  try {
    // Con qué migración se tomó. Restaurar datos sobre un esquema distinto al
    // de origen es cómo un respaldo falla justo el día que hace falta.
    const migraciones = await prisma.$queryRaw`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1
    `;
    const migracion = migraciones[0]?.migration_name || '(desconocida)';

    for (const modelo of MODELOS) {
      const delegado = prisma[modelo[0].toLowerCase() + modelo.slice(1)];
      if (!delegado) abortar(`El modelo ${modelo} no existe en el cliente de Prisma. ¿Cambió el esquema sin actualizar MODELOS?`);
      const filas = await delegado.findMany();
      datos[modelo] = filas;
      conteos[modelo] = filas.length;
      total += filas.length;
      console.log(`  ${String(filas.length).padStart(6)}  ${modelo}`);
    }

    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(destinoAbs, { recursive: true });
    // El nombre lleva el PROJECT REF, no el host: con el host, el respaldo de
    // desarrollo y el de producción se llamaban igual y no había forma de
    // distinguirlos después en la carpeta.
    const archivo = path.join(destinoAbs, `weedtown-${donde.proyecto}-${sello}.json`);

    // `Bytes` (Passkey.publicKey) no sobrevive a JSON.stringify: sale como
    // {"0":4,"1":91,...}, que al restaurar deja de ser un Buffer y la llave de
    // acceso queda inservible. Se marca explícitamente para poder revertirlo.
    const reemplazo = (_clave, valor) =>
      (valor?.type === 'Buffer' && Array.isArray(valor.data))
        ? { __bytes: Buffer.from(valor.data).toString('base64') }
        : valor;

    fs.writeFileSync(archivo, JSON.stringify({
      version: 1,
      tomadoEn: new Date().toISOString(),
      origen: { proyecto: donde.proyecto, host: donde.host, base: donde.base, schema: donde.schema },
      migracion,
      conteos,
      orden: MODELOS,
      datos
    }, reemplazo, 2));

    const mb = (fs.statSync(archivo).size / 1024 / 1024).toFixed(2);
    console.log(`\n  ✔ ${total} filas en ${mb} MB`);
    console.log(`    ${archivo}`);
    console.log(`    migración de origen: ${migracion}\n`);
    console.log('  Falta lo que este archivo NO cubre:');
    console.log('    · Las imágenes de Supabase Storage (aquí solo viajan sus URLs).');
    console.log('    · Comprobar que se puede restaurar. Un respaldo sin probar no es un');
    console.log('      respaldo: `node scripts/restaurar.js` lo carga en la base de');
    console.log('      desarrollo y compara los conteos.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('\n  ✖', e.message, '\n'); process.exit(1); });
