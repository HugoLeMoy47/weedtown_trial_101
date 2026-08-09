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
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

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

const url = opcion('--url') || process.env.RESPALDO_DATABASE_URL || process.env.DATABASE_URL;
const destino = opcion('--destino');

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
function describir(cadena) {
  try {
    const u = new URL(cadena);
    return { host: u.hostname, puerto: u.port || '5432', base: u.pathname.replace(/^\//, ''), schema: u.searchParams.get('schema') || 'public' };
  } catch {
    return { host: '(cadena ilegible)', puerto: '?', base: '?', schema: '?' };
  }
}

async function main() {
  const donde = describir(url);
  console.log('\n  Respaldo de WeedTown');
  console.log(`  origen : ${donde.host}:${donde.puerto}/${donde.base} (schema ${donde.schema})`);
  console.log(`  destino: ${destinoAbs}\n`);

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
    const archivo = path.join(destinoAbs, `weedtown-${donde.host.split('.')[0]}-${sello}.json`);

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
      origen: { host: donde.host, base: donde.base, schema: donde.schema },
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
