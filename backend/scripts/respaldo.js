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
//   node scripts/respaldo.js --listar
//   node scripts/respaldo.js --base produccion --destino "D:/respaldos-weedtown"
//   node scripts/respaldo.js --base dev        --destino "..."
//   node scripts/respaldo.js --base produccion --destino "..." --solo cuentas,feed --acepto-parcial
//   node scripts/respaldo.js --base produccion --destino "..." --excepto chats     --acepto-parcial
//
// --base nombra la base explícitamente: `produccion` usa RESPALDO_DATABASE_URL
// de `backend/.env.produccion` (que .gitignore ya excluye por `.env.*`) y `dev`
// usa DATABASE_URL de `.env`. Es explícito a propósito — la resolución
// implícita ya respaldó la base equivocada una vez.
//
// --solo y --excepto aceptan tablas y grupos mezclados (`--listar` los muestra).
// La selección se valida contra las llaves foráneas ANTES de conectar: pedir
// Post sin User produce un archivo que no se puede restaurar, y ese es el tipo
// de cosa que no debe descubrirse durante una recuperación.
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
// Cada modelo con las tablas de las que DEPENDE por llave foránea obligatoria.
// Sacado del esquema, no de memoria: `grep '@relation.*fields:'` sobre
// schema.prisma, separando los campos opcionales (`Post?`) de los obligatorios.
//
// Las opcionales no se listan a propósito. Una `Reaction` apunta a Post O a
// Comment O a ForumPost, nunca a todos, así que tratarlas como dependencias
// duras obligaría a incluir el esquema entero en cualquier selección — y el
// respaldo selectivo dejaría de existir. El precio es que un subconjunto puede
// traer filas con una FK opcional colgando; `restaurar.js` las tolera porque
// la columna acepta null.
const DEPENDE_DE = {
  User: [], MagicLink: [], MastodonApp: [], Hashtag: [], Chat: [],
  Identity: ['User'],
  Passkey: ['Identity'],
  Block: ['User'],
  FriendRequest: ['User'],
  Post: ['User'],
  PalabraDescartada: [],
  HashtagOnPost: ['Post', 'Hashtag'],
  Comment: ['Post', 'User'],
  Reaction: ['User'],
  Message: ['Chat', 'User'],
  SubForum: ['User'],
  SubForumFollow: ['User', 'SubForum'],
  ForumPost: ['User', 'SubForum'],
  ForumComment: ['User', 'ForumPost'],
  Report: ['User'],
  ModerationAction: ['User'],
  Notification: ['User'],
  MarketItem: ['User'],
  PrivacyAction: ['User'],
  Media: []
};

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

// Grupos con nombre, para no tener que acordarse de qué tablas componen una
// idea. Son los recortes que de verdad se piden, no una taxonomía completa.
const GRUPOS = {
  cuentas:  ['User', 'Identity', 'Passkey', 'MagicLink'],
  feed:     ['Post', 'Hashtag', 'HashtagOnPost', 'Comment', 'Reaction', 'Media'],
  foros:    ['SubForum', 'SubForumFollow', 'ForumPost', 'ForumComment'],
  social:   ['Block', 'FriendRequest', 'Notification'],
  chats:    ['Chat', 'Message'],
  moderacion: ['Report', 'ModerationAction', 'PalabraDescartada', 'PrivacyAction']
};

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : null;
};
const lista = (v) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);

const base = (opcion('--base') || '').toLowerCase();
const destino = opcion('--destino');
const aceptoDesarrollo = args.includes('--acepto-desarrollo');
const aceptoParcial = args.includes('--acepto-parcial');
const soloListar = args.includes('--listar');

// --base es la forma explícita de elegir, y existe justamente porque la
// resolución implícita ya falló una vez (2026-08-09). `--url` sigue para casos
// sueltos, pero lo normal es nombrar la base.
let url, fuente;
if (opcion('--url')) {
  url = opcion('--url'); fuente = '--url (línea de comandos)';
} else if (base === 'produccion' || base === 'prod') {
  if (!process.env.RESPALDO_DATABASE_URL) {
    console.error(
      '\n  ✖ Pediste --base produccion pero no hay RESPALDO_DATABASE_URL.\n\n' +
      (hayArchivoProduccion
        ? '    backend/.env.produccion existe: revisa que la variable se llame\n    exactamente RESPALDO_DATABASE_URL.\n'
        : '    Crea backend/.env.produccion con:\n      RESPALDO_DATABASE_URL="postgresql://postgres.<ref>:...@...:5432/postgres"\n')
    );
    process.exit(1);
  }
  url = process.env.RESPALDO_DATABASE_URL;
  fuente = 'RESPALDO_DATABASE_URL de .env.produccion';
} else if (base === 'dev' || base === 'desarrollo') {
  url = process.env.DATABASE_URL; fuente = 'DATABASE_URL de .env (desarrollo, pedida con --base dev)';
} else if (base) {
  console.error(`\n  ✖ --base "${base}" no existe. Usa "produccion" o "dev".\n`);
  process.exit(1);
} else if (process.env.RESPALDO_DATABASE_URL) {
  url = process.env.RESPALDO_DATABASE_URL;
  fuente = hayArchivoProduccion ? 'RESPALDO_DATABASE_URL de .env.produccion' : 'RESPALDO_DATABASE_URL del entorno';
} else { url = process.env.DATABASE_URL; fuente = 'DATABASE_URL de .env — LA BASE DE DESARROLLO'; }

// Pedir --base dev es decir "sé que es desarrollo": no hace falta la segunda
// confirmación que sí exige el caso en que se llegó ahí por descarte.
const eligioDevAPropósito = aceptoDesarrollo || base === 'dev' || base === 'desarrollo';

// --solo y --excepto aceptan nombres de tabla y nombres de grupo, mezclados.
function expandir(nombres) {
  const out = new Set();
  for (const n of nombres) {
    if (GRUPOS[n.toLowerCase()]) GRUPOS[n.toLowerCase()].forEach(m => out.add(m));
    else {
      const real = MODELOS.find(m => m.toLowerCase() === n.toLowerCase());
      if (!real) {
        console.error(`\n  ✖ "${n}" no es una tabla ni un grupo. Corre --listar para ver las opciones.\n`);
        process.exit(1);
      }
      out.add(real);
    }
  }
  return out;
}

const pedidas = expandir(lista(opcion('--solo')));
const excluidas = expandir(lista(opcion('--excepto')));
const seleccion = MODELOS.filter(m =>
  (pedidas.size === 0 || pedidas.has(m)) && !excluidas.has(m)
);
const esParcial = seleccion.length !== MODELOS.length;

function abortar(mensaje) {
  console.error(`\n  ✖ ${mensaje}\n`);
  process.exit(1);
}

if (soloListar) {
  console.log('\n  Tablas (en orden de restauración) y de qué dependen:\n');
  for (const m of MODELOS) {
    const d = DEPENDE_DE[m];
    console.log(`    ${m.padEnd(20)}${d.length ? 'necesita ' + d.join(', ') : ''}`);
  }
  console.log('\n  Grupos:\n');
  for (const [g, ms] of Object.entries(GRUPOS)) console.log(`    ${g.padEnd(12)}${ms.join(', ')}`);
  console.log('\n  Ejemplos:\n');
  console.log('    npm run respaldo -- --base produccion --destino "D:\\respaldos-weedtown"');
  console.log('    npm run respaldo -- --base produccion --destino "..." --solo cuentas,feed');
  console.log('    npm run respaldo -- --base produccion --destino "..." --excepto chats');
  console.log('    npm run respaldo -- --base dev        --destino "..."\n');
  process.exit(0);
}

// LA COMPROBACIÓN QUE HACE SEGURA LA SELECCIÓN. Un respaldo de Post sin User
// es un archivo que no se puede restaurar: la carga muere por violación de
// llave foránea. El momento de enterarse es AHORA, no durante una
// recuperación, así que las dependencias obligatorias se verifican antes de
// abrir la conexión.
if (esParcial) {
  const faltantes = [];
  for (const m of seleccion) {
    for (const dep of DEPENDE_DE[m]) {
      if (!seleccion.includes(dep) && !faltantes.some(f => f.tabla === m && f.falta === dep)) {
        faltantes.push({ tabla: m, falta: dep });
      }
    }
  }
  if (faltantes.length) {
    const sugerido = [...new Set([...seleccion, ...faltantes.map(f => f.falta)])];
    abortar(
      'La selección deja fuera tablas de las que otras dependen:\n\n' +
      faltantes.map(f => `      ${f.tabla} necesita ${f.falta}`).join('\n') +
      '\n\n    Un respaldo así NO se puede restaurar: la carga muere por violación de\n' +
      '    llave foránea. Mejor enterarse ahora que durante una recuperación.\n\n' +
      '    Selección que sí funciona:\n' +
      `      --solo ${MODELOS.filter(m => sugerido.includes(m)).join(',')}`
    );
  }
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
  console.log(`  destino : ${destinoAbs}`);
  console.log(`  alcance : ${esParcial ? `PARCIAL — ${seleccion.length} de ${MODELOS.length} tablas` : `completo — las ${MODELOS.length} tablas`}\n`);

  // La guardia que faltaba el 2026-08-09. Respaldar desarrollo es legítimo
  // —así se prueba la herramienta— pero tiene que ser una decisión, no el
  // resultado de que un archivo no se cargó.
  if (esLaDeDesarrollo(url) && !eligioDevAPropósito) {
    abortar(
      `El proyecto ${donde.proyecto} es EL MISMO que tu DATABASE_URL de .env: esto es DESARROLLO.\n\n` +
      (hayArchivoProduccion
        ? '    .env.produccion existe, así que revisa que dentro diga exactamente\n' +
          '    RESPALDO_DATABASE_URL= (ese nombre) y que la cadena sea la del otro proyecto.\n\n'
        : '    No existe backend/.env.produccion. Créalo con una línea:\n' +
          '      RESPALDO_DATABASE_URL="postgresql://postgres.<ref-de-produccion>:...@...:5432/postgres"\n\n') +
      '    OJO: todos los proyectos de Supabase de una región comparten hostname.\n' +
      '    Lo que distingue producción de desarrollo es el <ref> del usuario, no el host.\n\n' +
      '    Si de verdad quieres respaldar desarrollo, usa --base dev.'
    );
  }

  // Un respaldo parcial de PRODUCCIÓN es la combinación peligrosa: sirve para
  // llevarse un recorte, pero no sirve para recuperar. Lo que se está
  // protegiendo es justo lo que queda fuera, así que se pide decirlo aparte.
  if (esParcial && !esLaDeDesarrollo(url) && !aceptoParcial) {
    const fuera = MODELOS.filter(m => !seleccion.includes(m));
    abortar(
      'Respaldo PARCIAL de producción.\n\n' +
      `    Quedan fuera: ${fuera.join(', ')}\n\n` +
      '    Esto sirve para llevarse un recorte, NO como respaldo de recuperación:\n' +
      '    lo que no está aquí no se puede reconstruir desde este archivo. Si lo que\n' +
      '    buscas es la copia de seguridad, quita --solo/--excepto.\n\n' +
      '    Si de verdad quieres el recorte, agrega --acepto-parcial.'
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

    // Que el esquema no haya crecido sin que nadie actualizara MODELOS: una
    // tabla nueva que no esté en la lista se quedaría fuera de TODOS los
    // respaldos, en silencio y para siempre.
    const enElCliente = Object.keys(prisma).filter(k => /^[a-z]/.test(k) && prisma[k]?.findMany);
    const sinRegistrar = enElCliente.filter(k => !MODELOS.some(m => m[0].toLowerCase() + m.slice(1) === k));
    if (sinRegistrar.length) {
      abortar(
        `El esquema tiene tablas que este script no conoce: ${sinRegistrar.join(', ')}.\n\n` +
        '    Agrégalas a MODELOS (en su lugar del orden de dependencias) y a\n' +
        '    DEPENDE_DE. Si no, quedarían fuera de todos los respaldos sin avisar.'
      );
    }

    for (const modelo of seleccion) {
      const delegado = prisma[modelo[0].toLowerCase() + modelo.slice(1)];
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
    // Y el sufijo `-parcial` porque en una carpeta con varios archivos, el que
    // no sirve para recuperar tiene que decirlo desde el nombre.
    const archivo = path.join(destinoAbs, `weedtown-${donde.proyecto}-${sello}${esParcial ? '-parcial' : ''}.json`);

    // `Bytes` (Passkey.publicKey) no sobrevive a JSON.stringify: sale como
    // {"0":4,"1":91,...}, que al restaurar deja de ser un Buffer y la llave de
    // acceso queda inservible. Se marca explícitamente para poder revertirlo.
    const reemplazo = (_clave, valor) =>
      (valor?.type === 'Buffer' && Array.isArray(valor.data))
        ? { __bytes: Buffer.from(valor.data).toString('base64') }
        : valor;

    fs.writeFileSync(archivo, JSON.stringify({
      version: 2,
      tomadoEn: new Date().toISOString(),
      origen: { proyecto: donde.proyecto, host: donde.host, base: donde.base, schema: donde.schema },
      migracion,
      // `completo` es lo que `restaurar.js` mira para decidir si puede vaciar
      // el destino: cargar un recorte encima de una base es reemplazar unas
      // tablas y borrar otras, que no es restaurar, es perder datos.
      completo: !esParcial,
      omitidas: MODELOS.filter(m => !seleccion.includes(m)),
      conteos,
      orden: seleccion,
      datos
    }, reemplazo, 2));

    const mb = (fs.statSync(archivo).size / 1024 / 1024).toFixed(2);
    console.log(`\n  ✔ ${total} filas en ${mb} MB`);
    console.log(`    ${archivo}`);
    console.log(`    migración de origen: ${migracion}\n`);
    if (esParcial) {
      console.log('  ⚠ PARCIAL. Fuera quedaron: ' + MODELOS.filter(m => !seleccion.includes(m)).join(', '));
      console.log('    Sirve para llevarse un recorte; NO es un respaldo de recuperación.\n');
    }
    console.log('  Falta lo que este archivo NO cubre:');
    console.log('    · Las imágenes de Supabase Storage (aquí solo viajan sus URLs).');
    console.log('    · Comprobar que se puede restaurar. Un respaldo sin probar no es un');
    console.log('      respaldo: `npm run restaurar -- --archivo "..."` lo carga en la base');
    console.log('      de desarrollo y compara los conteos.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('\n  ✖', e.message, '\n'); process.exit(1); });
