// Rutas para perfil de usuario
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
// `optionalAuth` volvió en el 10B: el interruptor de perfil público habilita
// el caso anónimo, y la decisión de si pasa o no la toma `responderPerfil` a
// mano para poder mantener la antienumeración de los perfiles que NO son
// públicos.
const { requireAuth, optionalAuth } = require('../middlewares/requireAuth');
const { isBlockedBetween } = require('../lib/blocks');
const { friendStatusBetween } = require('../lib/friends');
const { camposVisibles, CAMPOS, esVisibilidadValida } = require('../lib/visibilidadPerfil');
const { cubetaInvitaciones } = require('../lib/invitaciones');
const avatar = require('../lib/avatar');
const handleLib = require('../lib/handle');
const privacy = require('../lib/privacy');
const { log } = require('../lib/logger');

// Perfil propio: incluye los datos personales opcionales
const profileSelect = {
  id: true, handle: true, displayName: true, email: true,
  name: true, avatar: true, mastodonAvatar: true, phone: true, fullName: true,
  bio: true, aboutMe: true, age: true, birthdate: true, gender: true, createdAt: true, updatedAt: true,
  // Sus propias preferencias de visibilidad (10B): solo viajan por /me. Nadie
  // más necesita saber qué decidió esconder — eso también es información.
  perfilPublico: true,
  // Su dueña ve el conteo EXACTO de invitaciones; hacia terceros solo sale la
  // cubeta. Ella repartió el enlace, así que ahí no hay nada que proteger.
  ...Object.fromEntries(Object.keys(CAMPOS).map(c => [c, true])),
  ...Object.fromEntries(Object.values(CAMPOS).map(p => [p, true])),
  // Con qué métodos puede entrar esta persona. Solo lo ve su dueño. `id` es lo
  // que usa DELETE /api/auth/identities/:id; `originHandle` trae, según el
  // proveedor, el acct de Mastodon, el correo o el nombre que se le dio a la llave.
  identities: {
    select: { id: true, provider: true, instance: true, originHandle: true, createdAt: true, lastLoginAt: true }
  }
};

// Perfil público: sin PII (email, teléfono, nombre real, edad, nacimiento, género)
// y tampoco los métodos de acceso.
//
// La instancia de Mastodon salió de aquí al desacoplar la identidad: era un dato
// de origen que ya no hace falta para identificar a nadie —para eso está el
// handle— y decía en qué servidor del fediverso está la cuenta de esa persona.
// Un dato menos publicado es un dato menos que correlacionar.
const publicProfileSelect = {
  id: true, handle: true, displayName: true,
  name: true, avatar: true, bio: true, createdAt: true
};

// Ciclo 10B: lo que hay que LEER para poder decidir qué sale. Trae los cuatro
// campos configurables, sus preferencias y el interruptor público — nada de
// esto se devuelve tal cual: `responderPerfil` lo recorta antes de responder.
const perfilConVisibilidadSelect = {
  ...publicProfileSelect,
  perfilPublico: true,
  // Los campos configurables Y sus preferencias salen del mapa, no de una
  // lista escrita a mano: así agregar uno (11A agregó `invitaciones`) no exige
  // acordarse de tocar este select.
  ...Object.fromEntries(Object.keys(CAMPOS).map(c => [c, true])),
  ...Object.fromEntries(Object.values(CAMPOS).map(p => [p, true]))
};

// Validación simple de perfil
function validateProfile(data) {
  const errors = [];
  if (data.phone && !/^\+?\d{7,15}$/.test(data.phone)) errors.push('Teléfono inválido');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 120)) errors.push('Edad inválida');
  if (data.birthdate && isNaN(Date.parse(data.birthdate))) errors.push('Fecha de nacimiento inválida');
  if (data.gender && !['masculino', 'femenino', 'otro', ''].includes(data.gender)) errors.push('Género inválido');
  if (data.fullName && data.fullName.length < 2) errors.push('Nombre completo muy corto');
  if (data.fullName && data.fullName.length > 120) errors.push('Nombre completo demasiado largo (máx. 120)');
  if (data.name && String(data.name).length > 80) errors.push('Nombre demasiado largo (máx. 80)');
  if (data.bio && String(data.bio).length > 500) errors.push('La bio no puede superar 500 caracteres');
  if (data.aboutMe && String(data.aboutMe).length > 1000) errors.push('El "sobre mí" no puede superar 1000 caracteres');
  return errors;
}

// El avatar no puede ser una URL cualquiera. Solo se aceptan dos cosas: uno de
// los avatares que genera este servidor, o la foto de la propia instancia de
// Mastodon. Antes valía cualquier http(s), lo que permitía apuntar el avatar a
// un rastreador externo — cada vez que alguien viera tu perfil, ese servidor se
// enteraba — o colgar la foto de otra persona.
function validarAvatar(valor, mastodonAvatar) {
  if (!valor) return { ok: true, valor: null };
  const url = String(valor);
  if (avatar.esUrlDeAvatar(url)) return { ok: true, valor: url };
  if (mastodonAvatar && url === mastodonAvatar) return { ok: true, valor: url };
  return {
    ok: false,
    error: 'Avatar inválido: usa uno generado en WeedTown o tu foto de Mastodon'
  };
}

// Perfil propio
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: profileSelect });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (e) {
    console.error('Error al obtener perfil propio:', e);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Actualizar perfil propio
router.put('/me', requireAuth, async (req, res) => {
  const data = req.body;
  const errors = validateProfile(data);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  try {
    // El handle es el identificador público: cambiarlo exige validarlo y
    // comprobar que esté libre. Se normaliza primero para que "Hugo LeMoy" y
    // "hugolemoy" no sean dos intentos distintos.
    let nuevoHandle;
    if (data.handle !== undefined) {
      const propuesto = handleLib.normalizar(data.handle);
      const motivo = handleLib.motivoInvalido(propuesto);
      if (motivo) return res.status(400).json({ errors: [motivo] });

      const tomado = await prisma.user.findUnique({
        where: { handle: propuesto },
        select: { id: true }
      });
      if (tomado && tomado.id !== req.user.id) {
        return res.status(409).json({ errors: ['Ese handle ya está en uso'] });
      }
      nuevoHandle = propuesto;
    }

    // Preferencias de visibilidad (10B). Se aceptan sueltas: mandar solo
    // `visibilidadBio` no debe tocar las otras tres ni el interruptor. Un valor
    // fuera de TODOS/AMIGOS/NADIE se rechaza en vez de guardarse: `campoVisible`
    // falla cerrado ante lo desconocido, pero un dato inválido en la base es
    // deuda silenciosa y aquí sí hay a quién avisarle.
    const preferencias = {};
    for (const preferencia of Object.values(CAMPOS)) {
      if (data[preferencia] === undefined) continue;
      if (!esVisibilidadValida(data[preferencia])) {
        return res.status(400).json({ errors: [`Valor de visibilidad inválido para ${preferencia}`] });
      }
      preferencias[preferencia] = data[preferencia];
    }
    if (data.perfilPublico !== undefined) {
      if (typeof data.perfilPublico !== 'boolean') {
        return res.status(400).json({ errors: ['perfilPublico debe ser true o false'] });
      }
      preferencias.perfilPublico = data.perfilPublico;
    }

    let nuevoAvatar;
    if (data.avatar !== undefined) {
      const propio = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { mastodonAvatar: true }
      });
      const check = validarAvatar(data.avatar, propio?.mastodonAvatar);
      if (!check.ok) return res.status(400).json({ errors: [check.error] });
      nuevoAvatar = check.valor;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: data.name || undefined,
        ...(nuevoHandle !== undefined && { handle: nuevoHandle }),
        ...(nuevoAvatar !== undefined && { avatar: nuevoAvatar }),
        // Solo se toca lo que VIENE en el cuerpo.
        //
        // Antes del 10B esto era un reemplazo total: cualquier campo ausente se
        // ponía en null. Nunca se notó porque el formulario de perfil siempre
        // manda todo, pero significa que un envío parcial —como el que hace el
        // interruptor de visibilidad, que solo manda su preferencia— BORRABA la
        // bio, el "sobre mí", la edad y el teléfono. Lo encontró la prueba de
        // este ciclo al mandar una sola preferencia.
        //
        // Mandar el campo vacío ("") sigue limpiándolo, que es como la interfaz
        // borra un dato a propósito. Lo que cambia es omitirlo: eso ahora lo
        // deja como estaba.
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.fullName !== undefined && { fullName: data.fullName || null }),
        ...(data.bio !== undefined && { bio: data.bio || null }),
        ...(data.aboutMe !== undefined && { aboutMe: data.aboutMe || null }),
        ...(data.age !== undefined && { age: data.age ? Number(data.age) : null }),
        ...(data.birthdate !== undefined && { birthdate: data.birthdate ? new Date(data.birthdate) : null }),
        ...(data.gender !== undefined && { gender: data.gender || null }),
        ...preferencias
      },
      select: profileSelect
    });
    res.json({ message: 'Perfil actualizado', user });
  } catch (e) {
    console.error('Error al actualizar perfil:', e);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// Exportar mis propios datos (HU-PRIV-001) — derecho de acceso/portabilidad.
router.get('/me/export', requireAuth, async (req, res) => {
  try {
    const datos = await privacy.exportarDatos(req.user.id);
    await prisma.privacyAction.create({ data: { userId: req.user.id, type: 'EXPORTAR_DATOS' } });
    log('privacidad_exportar_datos', { userId: req.user.id, requestId: req.id });
    res.setHeader('Content-Disposition', `attachment; filename="weedtown-datos-${req.user.id}.json"`);
    res.json(datos);
  } catch (e) {
    console.error('Error al exportar datos:', e);
    res.status(500).json({ error: 'Error al exportar tus datos' });
  }
});

// Eliminar (anonimizar) mi cuenta (HU-PRIV-001). Exige repetir el propio
// handle como confirmación explícita — no hay contraseña que volver a pedir,
// y es la única acción de la cuenta que no se puede deshacer desde el perfil.
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { handle: true, deletedAt: true } });
    if (!user || user.deletedAt) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (req.body?.confirm !== user.handle) {
      return res.status(400).json({ error: 'Escribe tu handle exacto en "confirm" para eliminar la cuenta' });
    }
    await privacy.anonimizarCuenta(req.user.id);
    res.json({ message: 'Tu cuenta fue eliminada. Ya no podrás iniciar sesión con ningún método.' });
  } catch (e) {
    console.error('Error al eliminar cuenta:', e);
    res.status(500).json({ error: 'Error al eliminar la cuenta' });
  }
});

// El perfil ajeno, resuelto por id o por handle (ciclo 10A).
//
// EXIGE SESIÓN, y eso es un CAMBIO de comportamiento: hasta el 10A esta ruta
// usaba `optionalAuth` y cualquiera podía leer el perfil de cualquiera sin
// cuenta, sabiendo solo el id. Su único consumidor vivía detrás de
// RequireAuth, así que la puerta llevaba tiempo abierta sin que nadie la
// usara — cerrarla no rompe ningún flujo, quita una fuga.
//
// El criterio es de RECIPROCIDAD DE EXPOSICIÓN: quien mira también puede ser
// mirado. No es simetría abstracta — impide que alguien con poder sobre los
// participantes (un empleador, un periodista, una autoridad) navegue perfiles
// sin poner nada propio, que en una comunidad con estigma es el riesgo real.
// Es además el mismo criterio que HU-FOR-012 ya aplicó a los foros: directorio
// abierto, contenido con sesión.
//
// ANTIENUMERACIÓN, que sale gratis y conviene entender por qué: `requireAuth`
// corre ANTES del handler, así que sin sesión un handle que existe y uno
// inventado reciben el mismo 401, sin llegar a tocar la base. No hay forma de
// mapear quién está en la red probando handles. Es la misma propiedad que
// `/p/:id` consigue no distinguiendo "privado" de "no existe".
// Ciclo 10B: la ruta pasa a `optionalAuth` porque el interruptor de perfil
// público habilita el caso anónimo. La antienumeración se mantiene A MANO, y
// hay que tener presente qué se revela en cada caso:
//
//   sin sesión + perfil NO público  → 401, idéntico a...
//   sin sesión + handle inexistente → 401, el mismo cuerpo
//   sin sesión + perfil público     → 200. Revela que existe, y eso ES el
//                                     sentido de haber opt-in: la persona pidió
//                                     ser visible desde afuera.
function noAutorizado(res) {
  return res.status(401).json({ error: 'No autenticado' });
}

async function responderPerfil(req, res, where) {
  try {
    const user = await prisma.user.findUnique({ where, select: perfilConVisibilidadSelect });
    const viewerId = req.user?.id;

    // Sin sesión: solo pasan los perfiles públicos, y todo lo demás —incluido
    // "no existe"— responde exactamente igual.
    if (!viewerId) {
      if (!user || !user.perfilPublico) return noAutorizado(res);
    } else {
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (await isBlockedBetween(viewerId, user.id)) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
    }

    const esDueña = viewerId === user.id;
    const { status, requestId } = !viewerId
      ? { status: 'none' }
      : esDueña ? { status: 'self' } : await friendStatusBetween(viewerId, user.id);

    // Los cuatro campos configurables los recorta una sola función (10B), que
    // es donde vive la regla de composición entre los dos controles.
    const campos = camposVisibles(user, {
      esDueña,
      esAmistad: status === 'friends',
      tieneSesion: Boolean(viewerId)
    });

    // Lo que sale siempre: sin los campos configurables en crudo ni las
    // preferencias, que son asunto de su dueña y viajan solo por /me.
    //
    // Los dos borrados se hacen RECORRIENDO EL MAPA, no destructurando a mano.
    // Antes del 11A esta línea era `const { bio, aboutMe, age, gender, ... }`,
    // y eso quería decir que agregar un quinto campo configurable filtraba su
    // valor en crudo salvo que alguien se acordara de tocar aquí — justo lo
    // que el mapa `CAMPOS` existía para evitar. Se descubrió al usarlo por
    // primera vez.
    const { perfilPublico, ...resto } = user;
    for (const campo of Object.keys(CAMPOS)) delete resto[campo];
    for (const preferencia of Object.values(CAMPOS)) delete resto[preferencia];

    // El contador nunca sale exacto hacia terceros: solo su cubeta. Su dueña
    // sí ve el número —ella repartió el enlace, ahí no hay nada que proteger—.
    if (campos.invitaciones !== null && campos.invitaciones !== undefined) {
      campos.invitaciones = esDueña ? campos.invitaciones : cubetaInvitaciones(campos.invitaciones);
    }

    res.json({
      ...resto,
      ...campos,
      perfilPublico,
      friendStatus: status,
      friendRequestId: requestId ?? null
    });
  } catch (e) {
    console.error('Error al obtener perfil:', e);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
}

// Por handle: es la forma compartible (`/@handle` en la web) y la que hace que
// picarle al handle de alguien lleve a algún lado suyo. Va ANTES de `/:id`
// porque si no, Express toma "handle" como si fuera un id.
//
// Se normaliza con la misma función que usa el alta (handle.js): los handles
// se guardan en minúsculas, así que `/@Luna` y `/@luna` son la misma persona.
router.get('/handle/:handle', optionalAuth, async (req, res) => {
  const handle = handleLib.normalizar(req.params.handle);
  if (!handle) return res.status(404).json({ error: 'Usuario no encontrado' });
  return responderPerfil(req, res, { handle });
});

router.get('/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID requerido' });
  return responderPerfil(req, res, { id });
});

module.exports = router;
