// Ciclo 19A: medición agregada de actividad.
//
// Lo que hay que sostener, y por eso cada bloque:
//   1. Una persona suma 1 por día, no importa cuántas peticiones haga NI
//      cuántas veces se reinicie el proceso (la garantía vive en el WHERE del
//      UPDATE, no en el mapa en memoria).
//   2. Lo único que se guarda sobre la persona es UNA fecha que se sobrescribe:
//      nunca retrocede y nunca hay historia.
//   3. El día es el de México, no el de UTC.
//   4. Una cuenta eliminada no se cuenta, y su fecha se borra al anonimizarla.
//   5. Nunca lanza: una medición no puede tumbar una petición.
//
// La parte de memoria y de SQL se prueba llamando a la función directamente
// (con `ahora` inyectado, sobre días del futuro lejano para no tocar las
// cifras reales); la integración con el middleware, por HTTP.
const { suite } = require('./lib');
const { registrarActividad, _vaciarMemoria } = require('../src/lib/actividad');
const { diaMexicoISO } = require('../src/lib/diaMexico');

const DIA_PRUEBA = '2031-03-05';
const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('ActividadDiaria', 'wtact');

  const conteoDe = async (iso) => {
    const fila = await prisma.conteoActividad.findUnique({ where: { dia: dia(iso) } });
    return fila ? fila.conteo : 0;
  };
  const ultimaDe = async (u) => {
    const x = await prisma.user.findUnique({ where: { id: u.id }, select: { ultimaActividadDia: true } });
    return x.ultimaActividadDia ? x.ultimaActividadDia.toISOString().slice(0, 10) : null;
  };
  const limpiarDiasDePrueba = () => prisma.conteoActividad.deleteMany({ where: { dia: { gte: dia('2031-01-01'), lt: dia('2032-01-01') } } });

  await cleanup();
  await limpiarDiasDePrueba();
  _vaciarMemoria();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const caro = await mkUser('caro');
    const borrada = await mkUser('borrada', { deletedAt: new Date() });
    const al = (iso, hora = '18:00:00') => new Date(`${iso}T${hora}.000Z`); // 18:00Z = 12:00 en México

    console.log('\n  — Una persona suma 1 por día —');
    check('la primera vez del día cuenta (true)', (await registrarActividad(ana.id, { ahora: al(DIA_PRUEBA) })) === true);
    check('el contador del día subió a 1', (await conteoDe(DIA_PRUEBA)) === 1);
    check('la segunda vez, el mismo día, no cuenta (mapa en memoria)', (await registrarActividad(ana.id, { ahora: al(DIA_PRUEBA) })) === false);
    let veces = 0;
    for (let i = 0; i < 50; i++) if (await registrarActividad(ana.id, { ahora: al(DIA_PRUEBA) })) veces++;
    check('50 llamadas más no suman nada', veces === 0 && (await conteoDe(DIA_PRUEBA)) === 1);

    console.log('\n  — Un reinicio del proceso no la cuenta dos veces —');
    _vaciarMemoria();
    check('con el mapa vacío (proceso reiniciado) la base lo impide: false', (await registrarActividad(ana.id, { ahora: al(DIA_PRUEBA) })) === false);
    check('el contador sigue en 1', (await conteoDe(DIA_PRUEBA)) === 1);

    console.log('\n  — Dos personas, dos cuentas —');
    check('beto cuenta', (await registrarActividad(beto.id, { ahora: al(DIA_PRUEBA) })) === true);
    check('el contador del día es 2', (await conteoDe(DIA_PRUEBA)) === 2);

    console.log('\n  — La fecha se sobrescribe: no hay historia —');
    check('ana guarda el día de hoy', (await ultimaDe(ana)) === DIA_PRUEBA);
    check('al día siguiente vuelve a contar', (await registrarActividad(ana.id, { ahora: al('2031-03-06') })) === true);
    check('su fecha pasó a ser la nueva (el día anterior ya no se sabe)', (await ultimaDe(ana)) === '2031-03-06');
    check('cada día tiene su propio contador', (await conteoDe('2031-03-06')) === 1 && (await conteoDe(DIA_PRUEBA)) === 2);
    _vaciarMemoria();
    check('una marca de un día ANTERIOR no la retrocede ni cuenta', (await registrarActividad(ana.id, { ahora: al(DIA_PRUEBA) })) === false);
    check('...su fecha sigue siendo la más reciente', (await ultimaDe(ana)) === '2031-03-06');

    console.log('\n  — El día es el de México, no el de UTC —');
    // 03:00Z del 6 = 21:00 del 5 en México (UTC-6, sin horario de verano desde 2022).
    check('03:00Z del 6 de marzo cae en el día 5 de México', diaMexicoISO(new Date('2031-03-06T03:00:00.000Z')) === '2031-03-05');
    check('07:00Z del 6 de marzo cae en el día 6 de México', diaMexicoISO(new Date('2031-03-06T07:00:00.000Z')) === '2031-03-06');
    await registrarActividad(caro.id, { ahora: new Date('2031-03-06T03:00:00.000Z') });
    check('caro, a las 21:00 de México del día 5, queda en el día 5', (await ultimaDe(caro)) === DIA_PRUEBA);

    console.log('\n  — Cuentas eliminadas y entradas raras —');
    const antes = await conteoDe(DIA_PRUEBA);
    check('una cuenta eliminada no cuenta', (await registrarActividad(borrada.id, { ahora: al(DIA_PRUEBA) })) === false);
    check('...y el contador no se movió', (await conteoDe(DIA_PRUEBA)) === antes);
    let lanzo = false;
    for (const malo of [null, undefined, 0, -5, 'abc', 1.5, NaN, {}, []]) {
      try { await registrarActividad(malo, { ahora: al(DIA_PRUEBA) }); } catch { lanzo = true; }
    }
    check('ids inválidos nunca lanzan', lanzo === false);
    check('un id que no existe no cuenta ni lanza', (await registrarActividad(2147483000, { ahora: al(DIA_PRUEBA) })) === false);

    console.log('\n  — Integración con el middleware (HTTP) —');
    const dani = await mkUser('dani');
    const tDani = token(dani.id);
    const hoy = diaMexicoISO();
    const base = await conteoDe(hoy);
    for (let i = 0; i < 20; i++) await call('GET', '/api/profile/me', { tok: tDani });
    // El middleware no espera a la medición, así que se espera a que aparezca.
    let tras = base;
    for (let i = 0; i < 40 && tras === base; i++) {
      tras = await conteoDe(hoy);
      if (tras === base) await new Promise(r => setTimeout(r, 100));
    }
    check('20 peticiones autenticadas suben el contador de hoy en exactamente 1', tras === base + 1, `(antes ${base}, después ${tras})`);
    for (let i = 0; i < 30; i++) await call('GET', '/api/profile/me', { tok: tDani });
    await new Promise(r => setTimeout(r, 500));
    check('30 más no lo mueven', (await conteoDe(hoy)) === tras);
    check('la fecha guardada de dani es la de hoy en México', (await ultimaDe(dani)) === hoy);
    const sinSesion = await conteoDe(hoy);
    await call('GET', '/api/profile/me');
    await call('GET', '/api/profile/handle/nadie_con_este_handle');
    await new Promise(r => setTimeout(r, 300));
    check('las peticiones sin sesión no cuentan a nadie', (await conteoDe(hoy)) === sinSesion);

    console.log('\n  — Privacidad: se exporta y se borra con la cuenta —');
    let r = await call('GET', '/api/profile/me/export', { tok: tDani });
    check('mi exportación incluye ultimaActividadDia', r.status === 200 && Object.prototype.hasOwnProperty.call(r.data?.perfil || {}, 'ultimaActividadDia'));
    check('...con el día de hoy', r.data?.perfil?.ultimaActividadDia?.slice(0, 10) === hoy, `(${r.data?.perfil?.ultimaActividadDia})`);
    r = await call('DELETE', '/api/profile/me', { tok: tDani, body: { confirm: dani.handle } });
    check('eliminar la cuenta responde 200', r.status === 200, `(fue ${r.status})`);
    check('al anonimizarla, su fecha de actividad se borra', (await ultimaDe(dani)) === null);
  } finally {
    await limpiarDiasDePrueba();
    await cleanup();
  }
  return results;
};
