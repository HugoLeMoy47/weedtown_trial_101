// Pruebas de HU-FOR-010/011: slugify compartida y siembra idempotente de
// subforos. El script se corre como el proceso aparte que es (igual que
// `npm run subforos` en uso real), no importado — así la prueba cubre el
// comportamiento real de la CLI, incluida la validación del handle creador.
const path = require('path');
const { spawnSync } = require('child_process');
const { suite } = require('./lib');
const { slugify } = require('../src/lib/slugify');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'subforos.js');

const NOMBRES = [
  'Reducción de riesgos y daños',
  'Gestión de placeres',
  'Cultivo de cannabis',
  'Historia de la cannabis',
  'Aprovechamiento de la cannabis',
  'Métodos de extracción',
  'Economía de la cannabis',
  'Noticias cannábicas',
  'Situación legal de la cannabis en México',
  'Protocolo ciudadano y autoridad'
];

function correrScript(handleCreador) {
  return spawnSync('node', [SCRIPT, `--creador=${handleCreador}`], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
}

module.exports = async function run() {
  const { results, check, mkUser, cleanup, prisma } = suite('Subforos', 'wtsub');
  const slugsCatalogo = NOMBRES.map(slugify);

  async function limpiarSubforos() {
    const subs = await prisma.subForum.findMany({ where: { slug: { in: slugsCatalogo } }, select: { id: true } });
    const ids = subs.map(s => s.id);
    if (ids.length) {
      await prisma.subForumFollow.deleteMany({ where: { subforumId: { in: ids } } });
      await prisma.subForum.deleteMany({ where: { id: { in: ids } } });
    }
  }

  await cleanup();
  await limpiarSubforos();
  try {
    console.log('\n  — slugify: los 10 nombres del catálogo (HU-FOR-011) —');
    check('slugify produce 10 slugs no vacíos', slugsCatalogo.length === 10 && slugsCatalogo.every(Boolean));
    check('los 10 slugs son únicos entre sí', new Set(slugsCatalogo).size === 10);
    check(
      '#9 ("Situación legal…") mide exactamente 40 caracteres — el tope de la ruta HTTP',
      NOMBRES[8].length === 40,
      `nombre midió ${NOMBRES[8].length}`
    );
    check(
      '#9 produce el slug esperado',
      slugsCatalogo[8] === 'situacion-legal-de-la-cannabis-en-mexico',
      slugsCatalogo[8]
    );
    check(
      '#10 ("Protocolo ciudadano y autoridad") no produce el slug pegado que dejaría un guion largo',
      slugsCatalogo[9] === 'protocolo-ciudadano-y-autoridad' && !slugsCatalogo[9].includes('ciudadanoautoridad'),
      slugsCatalogo[9]
    );

    console.log('\n  — el script no crea usuarios: falla si el creador no existe —');
    const sinCreador = correrScript('wtsub_no_existe');
    check('sin la cuenta creadora, el script termina con código distinto de 0', sinCreador.status !== 0);
    const noCreoNada = await prisma.subForum.count({ where: { slug: { in: slugsCatalogo } } });
    check('y no crea ningún subforo en el intento', noCreoNada === 0);

    console.log('\n  — siembra idempotente (HU-FOR-010) —');
    const creador = await mkUser('creador');

    const primera = correrScript(creador.handle);
    check('primera corrida termina en 0', primera.status === 0, primera.stderr);
    const trasPrimera = await prisma.subForum.count({ where: { slug: { in: slugsCatalogo } } });
    check('primera corrida crea las 10 filas del catálogo', trasPrimera === 10, `filas=${trasPrimera}`);

    const propios = await prisma.subForum.count({ where: { slug: { in: slugsCatalogo }, creatorId: creador.id } });
    check('las 10 quedan atribuidas al creador indicado', propios === 10, `propios=${propios}`);

    const siguiendo = await prisma.subForumFollow.count({ where: { userId: creador.id, subforum: { slug: { in: slugsCatalogo } } } });
    check('el creador queda siguiendo cada subforo que creó (igual que POST /forum/subforums)', siguiendo === 10, `siguiendo=${siguiendo}`);

    const sinContenido = await prisma.forumPost.count({ where: { subforum: { slug: { in: slugsCatalogo } } } });
    check('nacen sin contenido sembrado dentro', sinContenido === 0);

    // La comunidad edita una descripción — la segunda corrida no debe pisarla.
    const primerSubforo = await prisma.subForum.findUnique({ where: { slug: slugsCatalogo[0] } });
    await prisma.subForum.update({ where: { id: primerSubforo.id }, data: { description: 'Editado por la comunidad, no tocar' } });

    const segunda = correrScript(creador.handle);
    check('segunda corrida también termina en 0', segunda.status === 0, segunda.stderr);
    const trasSegunda = await prisma.subForum.count({ where: { slug: { in: slugsCatalogo } } });
    check('correr el script dos veces deja 10 filas, no 20', trasSegunda === 10, `filas=${trasSegunda}`);

    const sigueEditado = await prisma.subForum.findUnique({ where: { slug: slugsCatalogo[0] } });
    check('la segunda corrida no sobreescribe una descripción editada por la comunidad', sigueEditado.description === 'Editado por la comunidad, no tocar');
  } finally {
    await limpiarSubforos();
    await cleanup();
  }

  return results;
};
