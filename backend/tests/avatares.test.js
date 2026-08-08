// Avatares pixel art generados.
//
// Cubre las tres propiedades que sostienen la función:
//   1. El dibujo es determinista y versionado — la misma semilla da siempre el
//      mismo SVG, y ampliar el catálogo no puede cambiar avatares existentes.
//   2. El default es un avatar generado, no la foto de Mastodon, y volver a
//      entrar no sobrescribe lo que la persona haya elegido.
//   3. El avatar no puede apuntar a una URL cualquiera.
const { suite } = require('./lib');
const avatar = require('../src/lib/avatar');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Avatares', 'wtava');

  await cleanup();
  try {
    const BASE = `http://localhost:${process.env.PORT || 4010}`;

    console.log('\n  — El motor —');
    const cat = avatar.catalogo();
    const combos = cat.ranuras.reduce((n, r) => n * r.opciones.length, 1);
    check(`el catálogo da ${combos.toLocaleString('es-MX')} combinaciones`, combos > 20000, `(son ${combos})`);
    check('hay 8 bases', cat.ranuras.find(r => r.clave === 'base').opciones.length === 8);
    check('hay 10 accesorios', cat.ranuras.find(r => r.clave === 'acc').opciones.length === 10);
    check('más de la mitad de las bases no son humanas',
      cat.ranuras.find(r => r.clave === 'base').opciones.filter(n => n !== 'Persona').length >= 5);

    const s1 = avatar.semillaDesde('mastodon.social:42');
    check('la semilla derivada es válida', avatar.esSemillaValida(s1), `(${s1})`);
    check('derivar es determinista', avatar.semillaDesde('mastodon.social:42') === s1);
    check('identidades distintas dan semillas distintas',
      avatar.semillaDesde('mastodon.social:43') !== s1);
    check('renderizar es determinista', avatar.render(s1) === avatar.render(s1));
    check('la semilla lleva versión', s1.startsWith(avatar.VERSION + '-'));

    check('rechaza índice fuera del catálogo', !avatar.esSemillaValida('wt1-99-0-0-0-0-0'));
    check('rechaza otra versión', !avatar.esSemillaValida('wt2-0-0-0-0-0-0'));
    check('rechaza basura', !avatar.esSemillaValida('../../etc/passwd'));
    check('render devuelve null con semilla inválida', avatar.render('nope') === null);

    // Toda combinación posible debe dibujar y quedar dentro del lienzo
    let malas = 0, fuera = 0;
    for (let b = 0; b < 8; b++) for (let a = 0; a < 10; a++) for (let p = 0; p < 6; p++) {
      const svg = avatar.render(`wt1-${b}-0-0-0-${a}-${p}`);
      if (!svg) { malas++; continue; }
      for (const m of svg.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)) {
        if (+m[1] + +m[3] > 16 || +m[2] + +m[4] > 16) fuera++;
      }
    }
    check('todas las bases × accesorios × paletas dibujan', malas === 0, `(${malas} fallaron)`);
    check('ningún píxel se sale del lienzo de 16×16', fuera === 0, `(${fuera} fuera)`);

    console.log('\n  — El endpoint —');
    let res = await fetch(`${BASE}/api/avatars/${s1}.svg`);
    check('sirve el SVG sin sesión → 200', res.status === 200, `(fue ${res.status})`);
    check('con el tipo correcto', (res.headers.get('content-type') || '').includes('image/svg+xml'));
    check('cacheable para siempre', (res.headers.get('cache-control') || '').includes('immutable'));
    const cuerpo = await res.text();
    check('el cuerpo es un SVG', cuerpo.startsWith('<svg') && cuerpo.includes('</svg>'));
    check('no trae nada externo', !/https?:\/\//.test(cuerpo.replace(/xmlns="[^"]*"/g, '')));

    res = await fetch(`${BASE}/api/avatars/wt1-99-0-0-0-0-0.svg`);
    check('semilla inválida → 404', res.status === 404, `(fue ${res.status})`);
    res = await fetch(`${BASE}/api/avatars/catalogo`);
    check('el catálogo se sirve sin sesión → 200', res.status === 200, `(fue ${res.status})`);

    console.log('\n  — El default es un avatar generado —');
    // Simula lo que hace el login: crear la cuenta con avatar generado
    const semillaAna = avatar.semillaDesde('wtava.test:ana');
    const ana = await mkUser('ana', {
      avatar: avatar.urlDeAvatar(semillaAna),
      mastodonAvatar: 'https://ejemplo.mx/foto-real.jpg'
    });
    const tAna = token(ana.id);

    let r = await call('GET', '/api/auth/me', { tok: tAna });
    check('la sesión trae un avatar generado', avatar.esUrlDeAvatar(r.data.avatar), `(${r.data.avatar})`);
    check('y la foto de Mastodon aparte, como opción', r.data.mastodonAvatar === 'https://ejemplo.mx/foto-real.jpg');

    console.log('\n  — Elegir avatar —');
    const otra = 'wt1-1-2-3-1-4-5';
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { avatar: avatar.urlDeAvatar(otra) } });
    check('se puede elegir otro generado → 200', r.status === 200, `(fue ${r.status})`);
    check('quedó guardado', r.data.user.avatar === avatar.urlDeAvatar(otra));

    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { avatar: 'https://ejemplo.mx/foto-real.jpg' } });
    check('se puede elegir la propia foto de Mastodon → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { avatar: 'https://rastreador.example/pixel.gif' } });
    check('una URL externa cualquiera se rechaza → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { avatar: 'https://ejemplo.mx/foto-de-otra-persona.jpg' } });
    check('la foto de Mastodon de OTRA cuenta se rechaza → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { avatar: `${BASE}/api/avatars/wt1-99-0-0-0-0-0.svg` } });
    check('una URL nuestra con semilla inválida se rechaza → 400', r.status === 400, `(fue ${r.status})`);

    // Guardar el perfil sin tocar el avatar no debe borrarlo
    await call('PUT', '/api/profile/me', { tok: tAna, body: { avatar: avatar.urlDeAvatar(otra) } });
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { bio: 'hola' } });
    check('editar el perfil sin mandar avatar no lo borra', r.data.user.avatar === avatar.urlDeAvatar(otra));

    console.log('\n  — El avatar elegido sobrevive —');
    // Regresión: el login sobrescribía `avatar` en cada entrada, así que un
    // avatar elegido se revertía solo a la foto de Mastodon.
    const elegido = await prisma.user.findUnique({ where: { id: ana.id }, select: { avatar: true } });
    await prisma.user.update({
      where: { id: ana.id },
      data: { mastodonAvatar: 'https://ejemplo.mx/foto-nueva.jpg' } // lo que hace el login ahora
    });
    const despues = await prisma.user.findUnique({ where: { id: ana.id }, select: { avatar: true, mastodonAvatar: true } });
    check('refrescar la foto de la instancia no toca el avatar elegido',
      despues.avatar === elegido.avatar, `(${despues.avatar})`);
    check('pero la foto de la instancia sí se actualiza',
      despues.mastodonAvatar === 'https://ejemplo.mx/foto-nueva.jpg');

    console.log('\n  — Se ve donde tiene que verse —');
    const post = await prisma.post.create({ data: { content: 'wtava con avatar', authorId: ana.id } });
    r = await call('GET', '/api/posts', { tok: tAna });
    const enFeed = r.data.posts.find(p => p.id === post.id);
    check('el avatar viaja en el feed', avatar.esUrlDeAvatar(enFeed?.author?.avatar));
    r = await call('GET', `/api/profile/${ana.id}`, { tok: tAna });
    check('y en el perfil público', avatar.esUrlDeAvatar(r.data.avatar));
    check('el perfil público NO expone la foto de Mastodon', r.data.mastodonAvatar === undefined);
  } finally {
    await cleanup();
  }

  return results;
};
