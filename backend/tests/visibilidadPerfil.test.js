// Ciclo 10B: visibilidad por dato + interruptor de perfil público.
//
// Lo que de verdad hay que sostener aquí es UNA regla:
//
//   El interruptor de perfil público NUNCA amplía lo que la visibilidad por
//   dato ya restringió.
//
// Por eso la mayoría de estos casos son la matriz completa de las dos
// dimensiones cruzadas, y el que más importa es el que la rompería: un campo
// en AMIGOS, con el perfil público, visto sin sesión.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('VisibilidadPerfil', 'wtvis');

  await cleanup();
  try {
    const ana = await mkUser('ana');     // la dueña del perfil
    const beto = await mkUser('beto');   // su amistad
    const caro = await mkUser('caro');   // con sesión, sin amistad
    const tAna = token(ana.id), tBeto = token(beto.id), tCaro = token(caro.id);

    await prisma.friendRequest.create({
      data: { requesterId: ana.id, addresseeId: beto.id, status: 'ACCEPTED', respondedAt: new Date() }
    });
    await prisma.user.update({
      where: { id: ana.id },
      data: {
        bio: 'bio de ana', aboutMe: 'sobre mi de ana', age: 30, gender: 'femenino',
        phone: '+525512345678', fullName: 'Ana Real', birthdate: new Date('1996-01-01')
      }
    });

    const ponerVisibilidad = (campos) => prisma.user.update({ where: { id: ana.id }, data: campos });
    const ver = async (tok) => (await call('GET', `/api/profile/handle/${ana.handle}`, tok ? { tok } : {}));

    console.log('\n  — Los defaults reproducen el comportamiento anterior al 10B —');
    let r = await ver(tCaro);
    check('la bio se ve con sesión (default TODOS)', r.data.bio === 'bio de ana', `(fue ${r.data.bio})`);
    check('"sobre mí" NO se ve sin amistad (default AMIGOS)', r.data.aboutMe === null, `(fue ${r.data.aboutMe})`);
    check('la edad no se ve (default NADIE)', r.data.age === null, `(fue ${r.data.age})`);
    check('el género no se ve (default NADIE)', r.data.gender === null, `(fue ${r.data.gender})`);
    r = await ver(tBeto);
    check('una amistad SÍ ve "sobre mí"', r.data.aboutMe === 'sobre mi de ana');

    console.log('\n  — Los campos que NUNCA son exponibles no salen en ninguna combinación —');
    await ponerVisibilidad({ perfilPublico: true, visibilidadBio: 'TODOS' });
    for (const [quien, tok] of [['sin sesión', null], ['con sesión', tCaro], ['una amistad', tBeto]]) {
      const res = await ver(tok);
      const filtra = res.data.phone === undefined && res.data.fullName === undefined &&
                     res.data.birthdate === undefined && res.data.email === undefined;
      check(`${quien}: ni teléfono, ni nombre real, ni nacimiento, ni correo`, filtra,
        `(${JSON.stringify({ phone: res.data.phone, fullName: res.data.fullName, birthdate: res.data.birthdate, email: res.data.email })})`);
    }

    console.log('\n  — NADIE es nadie, en las cuatro combinaciones —');
    await ponerVisibilidad({ visibilidadBio: 'NADIE', perfilPublico: true });
    check('no lo ve una amistad', (await ver(tBeto)).data.bio === null);
    check('no lo ve alguien con sesión', (await ver(tCaro)).data.bio === null);
    check('no lo ve nadie sin sesión, aunque el perfil sea público', (await ver(null)).data.bio === null);

    console.log('\n  — AMIGOS no se amplía por el interruptor: LA REGLA DURA —');
    await ponerVisibilidad({ visibilidadBio: 'AMIGOS', perfilPublico: true });
    check('la amistad sí lo ve', (await ver(tBeto)).data.bio === 'bio de ana');
    check('alguien con sesión SIN amistad no lo ve', (await ver(tCaro)).data.bio === null);
    r = await ver(null);
    check('y SIN SESIÓN no lo ve aunque el perfil sea público', r.data.bio === null,
      `(fue ${r.data.bio}) ← si esto falla, el interruptor está ampliando lo que el dato restringió`);
    check('pero el perfil sí responde 200 (es público)', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — TODOS: con sesión siempre; sin sesión solo si el perfil es público —');
    await ponerVisibilidad({ visibilidadBio: 'TODOS', perfilPublico: false });
    check('con sesión lo ve', (await ver(tCaro)).data.bio === 'bio de ana');
    r = await ver(null);
    check('sin sesión y perfil NO público → 401', r.status === 401, `(fue ${r.status})`);
    await ponerVisibilidad({ perfilPublico: true });
    r = await ver(null);
    check('sin sesión y perfil público → 200 con la bio', r.status === 200 && r.data.bio === 'bio de ana',
      `(${r.status}/${r.data.bio})`);

    console.log('\n  — La antienumeración sigue en pie para los perfiles NO públicos —');
    await ponerVisibilidad({ perfilPublico: false });
    const privado = await ver(null);
    const inexistente = await call('GET', '/api/profile/handle/nadieconestehandle');
    check('un perfil privado y un handle inventado responden idéntico',
      privado.status === inexistente.status && JSON.stringify(privado.data) === JSON.stringify(inexistente.data),
      `(${privado.status}:${JSON.stringify(privado.data)} vs ${inexistente.status}:${JSON.stringify(inexistente.data)})`);

    console.log('\n  — Las preferencias son asunto de su dueña —');
    r = await ver(tCaro);
    check('no viajan en el perfil ajeno', r.data.visibilidadBio === undefined && r.data.visibilidadAboutMe === undefined);
    r = await call('GET', '/api/profile/me', { tok: tAna });
    check('pero sí en /me', r.data.visibilidadBio === 'TODOS' && typeof r.data.perfilPublico === 'boolean');

    console.log('\n  — PUT /me: se guardan sueltas y se validan —');
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { visibilidadAge: 'TODOS' } });
    check('cambiar una no toca las otras', r.status === 200 &&
      r.data.user.visibilidadAge === 'TODOS' && r.data.user.visibilidadBio === 'TODOS' &&
      r.data.user.visibilidadAboutMe === 'AMIGOS', `(${JSON.stringify(r.data.user && {a: r.data.user.visibilidadAge, b: r.data.user.visibilidadBio, c: r.data.user.visibilidadAboutMe})})`);
    check('y ahora la edad sí se ve con sesión', (await ver(tCaro)).data.age === 30);
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { visibilidadBio: 'CUALQUIERA' } });
    check('un valor inválido se rechaza → 400', r.status === 400, `(fue ${r.status})`);

    console.log('\n  — Un envío parcial NO borra lo que no mandó (bug encontrado en este ciclo) —');
    // Antes del 10B, PUT /me era un reemplazo total: mandar solo una
    // preferencia ponía en null la bio, el "sobre mí", la edad y el teléfono.
    // Lo destapó la prueba de arriba, porque el interruptor de visibilidad es
    // el primer cliente que hace envíos parciales.
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { perfilPublico: false } });
    check('la bio sobrevive', r.data.user.bio === 'bio de ana', `(fue ${r.data.user.bio})`);
    check('el "sobre mí" sobrevive', r.data.user.aboutMe === 'sobre mi de ana', `(fue ${r.data.user.aboutMe})`);
    check('la edad sobrevive', r.data.user.age === 30, `(fue ${r.data.user.age})`);
    check('y el teléfono también', r.data.user.phone === '+525512345678', `(fue ${r.data.user.phone})`);
    // Lo que sí debe seguir funcionando: mandar el campo VACÍO lo limpia, que
    // es como la interfaz borra un dato a propósito.
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { bio: '' } });
    check('pero mandar el campo vacío sí lo limpia', r.data.user.bio === null, `(fue ${r.data.user.bio})`);
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { perfilPublico: 'sí' } });
    check('perfilPublico que no es booleano se rechaza → 400', r.status === 400, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }
  return results;
};
