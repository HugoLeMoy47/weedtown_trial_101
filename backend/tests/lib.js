// Utilidades compartidas por las suites de prueba.
//
// Las pruebas son de INTEGRACIÓN: hablan con el backend por HTTP igual que el
// frontend, y usan Prisma solo para sembrar y limpiar datos. Es a propósito —
// los bloqueantes que cubren son de autorización, y esos solo se demuestran de
// verdad atravesando middlewares, rutas y consultas reales.
const jwt = require('jsonwebtoken');
const prisma = require('../src/lib/prisma');

const BASE = `http://localhost:${process.env.PORT || 4010}`;

// Cada suite marca sus datos con un prefijo propio para poder limpiarlos sin
// tocar nada más de la base.
function suite(name, mark) {
  const results = { name, pass: 0, fail: 0, failures: [] };

  function check(label, ok, detail = '') {
    if (ok) {
      results.pass++;
      console.log(`  ✓ ${label}`);
    } else {
      results.fail++;
      results.failures.push(label);
      console.log(`  ✗ ${label} ${detail}`);
    }
  }

  const token = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  async function call(method, path, { tok, body } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let data = null;
    try { data = await res.json(); } catch { /* respuestas sin cuerpo */ }
    return { status: res.status, data };
  }

  const instance = `${mark}.test`;

  // Cada cuenta de prueba nace con su handle (el identificador público, marcado
  // con el prefijo de la suite para poder limpiarlo después) y una identidad de
  // Mastodon, que es como las crea el login real.
  const mkUser = (suffix, extra = {}) => prisma.user.create({
    data: {
      handle: `${mark}_${suffix}`.toLowerCase().slice(0, 20),
      name: `${mark}_${suffix}`,
      identities: {
        create: {
          provider: 'MASTODON',
          externalId: `${instance}:${mark}-${suffix}-${Date.now()}`,
          instance,
          originHandle: `${mark}_${suffix}`
        }
      },
      ...extra
    }
  });

  // Borra todo lo que sembró la suite, en orden de dependencias. Se ejecuta al
  // empezar (por si una corrida anterior se cayó a la mitad) y al terminar.
  async function cleanup() {
    const subs = await prisma.subForum.findMany({
      where: { slug: { startsWith: mark } },
      select: { id: true }
    });
    const subIds = subs.map(s => s.id);
    if (subIds.length) {
      const posts = await prisma.forumPost.findMany({ where: { subforumId: { in: subIds } }, select: { id: true } });
      const postIds = posts.map(p => p.id);
      const comentarios = await prisma.forumComment.findMany({ where: { postId: { in: postIds } }, select: { id: true } });
      // Los reportes referencian el contenido con FK: van antes que él
      await prisma.report.deleteMany({
        where: {
          OR: [
            { subforumId: { in: subIds } },
            { forumPostId: { in: postIds } },
            { forumCommentId: { in: comentarios.map(c => c.id) } }
          ]
        }
      });
      await prisma.reaction.deleteMany({
        where: { OR: [{ forumPostId: { in: postIds } }, { forumComment: { postId: { in: postIds } } }] }
      });
      await prisma.notification.deleteMany({
        where: { OR: [{ subforumId: { in: subIds } }, { forumPostId: { in: postIds } }] }
      });
      await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { subforumId: { in: subIds } } });
      await prisma.subForumFollow.deleteMany({ where: { subforumId: { in: subIds } } });
      await prisma.subForum.deleteMany({ where: { id: { in: subIds } } });
    }

    const users = await prisma.user.findMany({
      where: { handle: { startsWith: mark } },
      select: { id: true }
    });
    const ids = users.map(u => u.id);
    if (!ids.length) return;

    const chats = await prisma.chat.findMany({
      where: { users: { some: { id: { in: ids } } } },
      select: { id: true }
    });
    const chatIds = chats.map(c => c.id);

    await prisma.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: ids } }, { actorId: { in: ids } }] } });
    await prisma.moderationAction.deleteMany({ where: { moderatorId: { in: ids } } });
    // Los reportes cuelgan de contenido y de cuentas: se borran antes que ambos
    await prisma.report.deleteMany({
      where: {
        OR: [
          { reporterId: { in: ids } },
          { targetUserId: { in: ids } },
          { resolvedById: { in: ids } },
          { post: { authorId: { in: ids } } },
          { comment: { authorId: { in: ids } } },
          { forumPost: { authorId: { in: ids } } },
          { forumComment: { authorId: { in: ids } } }
        ]
      }
    });
    // Suspensiones y ocultamientos hechos por estas cuentas apuntan a ellas
    await prisma.user.updateMany({ where: { suspendedById: { in: ids } }, data: { suspendedById: null } });
    await prisma.post.updateMany({ where: { hiddenById: { in: ids } }, data: { hiddenById: null } });
    await prisma.comment.updateMany({ where: { hiddenById: { in: ids } }, data: { hiddenById: null } });
    await prisma.forumPost.updateMany({ where: { hiddenById: { in: ids } }, data: { hiddenById: null } });
    await prisma.forumComment.updateMany({ where: { hiddenById: { in: ids } }, data: { hiddenById: null } });
    await prisma.subForum.updateMany({ where: { archivedById: { in: ids } }, data: { archivedById: null } });
    await prisma.reaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.comment.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.hashtagOnPost.deleteMany({ where: { post: { authorId: { in: ids } } } });
    await prisma.media.deleteMany({ where: { OR: [{ userId: { in: ids } }, { post: { authorId: { in: ids } } }] } });
    await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
    if (chatIds.length) {
      await prisma.message.deleteMany({ where: { chatId: { in: chatIds } } });
      await prisma.chat.deleteMany({ where: { id: { in: chatIds } } });
    }
    await prisma.identity.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  return { results, check, call, token, mkUser, cleanup, prisma };
}

module.exports = { suite, BASE };
