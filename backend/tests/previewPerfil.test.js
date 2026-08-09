// Ciclo 11B: la ficha Open Graph de un perfil.
//
// Es la superficie MÁS EXTERNA de la red: un rastreador la pide sin sesión,
// sin cookies y sin ninguna relación con nadie. Lo que salga aquí es público
// de verdad y con caché de por medio.
//
// Las dos propiedades que sostiene esta suite:
//
//   1. La ficha rica trae SOLO lo que estaba en TODOS. La regla de composición
//      del 10B no se reimplementa aquí, se llama — y esta prueba comprueba que
//      de verdad se aplicó en el caso extremo (sin sesión, sin amistad).
//   2. Los cuatro casos sin ficha rica responden IDÉNTICO. Se aserta
//      comparando los cuerpos ENTRE SÍ, no cada uno contra un literal: así la
//      prueba sigue sirviendo el día que el genérico cambie de texto.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, mkUser, cleanup, prisma } = suite('PreviewPerfil', 'wtfperfil');

  await cleanup();
  try {
    const publica = await mkUser('publica', {
      name: 'Luna Verde', displayName: 'Luna Verde',
      bio: 'Cultivo en maceta y tomo mucho café.',
      aboutMe: 'Esto es privado y no debe salir jamás en una ficha.',
      age: 29, gender: 'femenino',
      email: 'luna@ejemplo.mx', phone: '+525512345678', fullName: 'Luna Verde Pérez',
      perfilPublico: true,
      visibilidadBio: 'TODOS', visibilidadAboutMe: 'AMIGOS',
      visibilidadAge: 'TODOS', visibilidadGender: 'NADIE'
    });
    const privada = await mkUser('privada', { bio: 'No debería salir', perfilPublico: false });
    const suspendida = await mkUser('suspendida', {
      bio: 'Tampoco', perfilPublico: true,
      suspendedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    const eliminada = await mkUser('eliminada', {
      bio: 'Menos', perfilPublico: true, deletedAt: new Date()
    });

    const ficha = (handle) => call('GET', `/api/profile/handle/${handle}/preview`);

    console.log('\n  — Perfil público: ficha rica, y solo con lo que está en TODOS —');
    const rica = await ficha(publica.handle);
    check('responde 200', rica.status === 200, `(fue ${rica.status})`);
    check('el título lleva el nombre y el handle',
      rica.data.titulo.includes('Luna Verde') && rica.data.titulo.includes(`@${publica.handle}`),
      `(fue ${JSON.stringify(rica.data.titulo)})`);
    check('la descripción es la bio, que estaba en TODOS',
      rica.data.descripcion.includes('Cultivo en maceta'), `(fue ${JSON.stringify(rica.data.descripcion)})`);
    check('viene marcada como indexable', rica.data.indexable === true);

    // El corazón del ciclo: lo que NO puede salir. Se revisa contra el JSON
    // completo, no campo por campo, porque lo que hay que sostener es que ese
    // dato no está en NINGUNA PARTE de la respuesta.
    const crudo = JSON.stringify(rica.data);
    check('"sobre mí" (AMIGOS) NO sale — fuera de la red no hay amistades',
      !crudo.includes('privado y no debe salir'));
    check('el género (NADIE) no sale', !crudo.includes('femenino'));
    check('el correo no sale', !crudo.includes('luna@ejemplo.mx'));
    check('el teléfono no sale', !crudo.includes('5512345678'));
    check('el nombre real completo no sale', !crudo.includes('Pérez'));

    console.log('\n  — Los cuatro casos sin ficha rica responden IDÉNTICO —');
    const noExiste = await ficha('nadieconestehandle');
    const noPublica = await ficha(privada.handle);
    const conSuspension = await ficha(suspendida.handle);
    const borrada = await ficha(eliminada.handle);
    const casos = [
      ['handle inexistente', noExiste],
      ['perfil no público', noPublica],
      ['cuenta suspendida', conSuspension],
      ['cuenta eliminada', borrada]
    ];
    for (const [nombre, r] of casos) {
      check(`${nombre} → 200 (nunca 404: un 404 sería un oráculo de existencia)`,
        r.status === 200, `(fue ${r.status})`);
    }
    const cuerpos = casos.map(([, r]) => JSON.stringify(r.data));
    check('los cuatro cuerpos son idénticos entre sí',
      cuerpos.every(c => c === cuerpos[0]),
      `\n        ${cuerpos.join('\n        ')}`);
    check('y ninguno viene marcado como indexable',
      casos.every(([, r]) => r.data.indexable === false));

    console.log('\n  — El genérico no menciona el handle: el handle es información —');
    const generico = JSON.stringify(noPublica.data);
    check('no aparece el handle del perfil privado', !generico.includes(privada.handle));
    check('ni el de la cuenta suspendida', !generico.includes(suspendida.handle));
    check('ni la bio de nadie', !generico.includes('No debería salir'));

    console.log('\n  — Apagar el interruptor apaga la ficha —');
    await prisma.user.update({ where: { id: publica.id }, data: { perfilPublico: false } });
    const apagada = await ficha(publica.handle);
    check('deja de salir la ficha rica', apagada.data.indexable === false);
    check('y responde exactamente el genérico', JSON.stringify(apagada.data) === cuerpos[0]);
    await prisma.user.update({ where: { id: publica.id }, data: { perfilPublico: true } });

    console.log('\n  — Sin bio en TODOS, descripción fija (no se cae a otro campo) —');
    await prisma.user.update({ where: { id: publica.id }, data: { visibilidadBio: 'AMIGOS' } });
    const sinBio = await ficha(publica.handle);
    check('la ficha sigue siendo rica (el perfil es público)', sinBio.data.indexable === true);
    check('pero la bio NO sale', !JSON.stringify(sinBio.data).includes('Cultivo en maceta'));
    check('y la descripción no se rellena con "sobre mí"',
      !JSON.stringify(sinBio.data).includes('privado y no debe salir'));

    console.log('\n  — Detalles del contrato con el Worker —');
    check('el JSON llega SIN escapar (el escapado vive en el Worker, HU-SEC-001)',
      !JSON.stringify(rica.data).includes('&quot;') && !JSON.stringify(rica.data).includes('&amp;'));
    check('el handle no distingue mayúsculas',
      (await ficha(publica.handle.toUpperCase())).data.indexable === true);
    check('un handle con formato imposible cae en el genérico, sin romper',
      JSON.stringify((await ficha('a')).data) === cuerpos[0]);
  } finally {
    await cleanup();
  }
  return results;
};
