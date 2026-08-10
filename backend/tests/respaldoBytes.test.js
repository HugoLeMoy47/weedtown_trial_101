// Ciclo 12D: que los campos `Bytes` sobrevivan al viaje respaldo → restauración.
//
// POR QUÉ EXISTE ESTA PRUEBA, que es la parte que importa:
//
// El viaje redondo del respaldo se verificó en la Ola 3 y dio "las 25 tablas
// coinciden". Parecía suficiente. No lo era: **la base de desarrollo tiene 0
// llaves de acceso**, así que el único campo `Bytes` del esquema
// (`Passkey.publicKey`) nunca se ejercitó. Los conteos cuadraban porque el
// caso no estaba presente.
//
// El bug apareció al verificar el respaldo REAL de producción, que sí tiene 20
// llaves: Prisma 6 devuelve Bytes como `Uint8Array`, no como `Buffer`, y el
// reemplazo de `respaldo.js` solo reconocía la forma de Buffer. Las claves
// públicas se guardaron como {"0":4,"1":91,…} y al restaurar no volvían a ser
// bytes: 20 personas se habrían quedado sin poder entrar con su llave.
//
// Una verificación pasa por lo que cubre, no por lo que uno cree que cubre.
// Esta prueba cubre exactamente el hueco, sin depender de que haya llaves en
// ninguna base: ejercita el par serializar/deserializar directamente.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite } = require('./lib');

// Las dos funciones viven dentro de sus scripts (son de operación, no de la
// app), así que se reconstruyen aquí con la MISMA lógica. Si alguien cambia
// una y no la otra, esta prueba no lo va a notar — por eso el comentario
// cruzado en los tres archivos. Lo que sí protege es la regresión concreta:
// que la forma que produce Prisma se reconozca.
function serializar(objeto) {
  return JSON.stringify(objeto, function (clave, valor) {
    const bruto = this[clave];
    if (ArrayBuffer.isView(bruto)) {
      return { __bytes: Buffer.from(bruto.buffer, bruto.byteOffset, bruto.byteLength).toString('base64') };
    }
    return valor;
  });
}

function esBytesNumerado(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const claves = Object.keys(v);
  if (!claves.length) return false;
  return claves.every((k, i) => k === String(i) && Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= 255);
}

function deserializar(texto) {
  return JSON.parse(texto, (_c, v) => {
    if (v && typeof v === 'object' && typeof v.__bytes === 'string') return Buffer.from(v.__bytes, 'base64');
    if (esBytesNumerado(v)) return Buffer.from(Object.values(v));
    return v;
  });
}

module.exports = async function run() {
  const { results, check } = suite('RespaldoBytes', 'wtbytes');

  // 42 bytes, como una clave pública COSE real. Con valores altos a propósito:
  // un error de signo o de codificación se vería aquí y no con {1,2,3}.
  const original = new Uint8Array(Array.from({ length: 42 }, (_, i) => (i * 37 + 200) % 256));

  console.log('\n  — La forma que Prisma 6 devuelve de verdad: Uint8Array —');
  const comoUint = deserializar(serializar({ publicKey: original })).publicKey;
  check('un Uint8Array sobrevive al viaje', Buffer.isBuffer(comoUint));
  check('y sus bytes son idénticos',
    Buffer.isBuffer(comoUint) && Buffer.compare(comoUint, Buffer.from(original)) === 0);

  console.log('\n  — La forma vieja (Buffer), por si alguna versión la devuelve —');
  const comoBuffer = deserializar(serializar({ publicKey: Buffer.from(original) })).publicKey;
  check('un Buffer también sobrevive', Buffer.isBuffer(comoBuffer));
  check('con los mismos bytes',
    Buffer.isBuffer(comoBuffer) && Buffer.compare(comoBuffer, Buffer.from(original)) === 0);

  console.log('\n  — Los respaldos ya tomados con el bug se siguen pudiendo leer —');
  // Esto es exactamente lo que hay en el respaldo de producción del
  // 2026-08-09: el objeto con claves numéricas que produce JSON.stringify
  // sobre un Uint8Array sin reemplazo.
  const conBug = JSON.stringify({ publicKey: original });
  const rescatado = deserializar(conBug).publicKey;
  check('la forma {"0":..,"1":..} se reconoce y se reconstruye', Buffer.isBuffer(rescatado));
  check('y no se perdió ni un byte',
    Buffer.isBuffer(rescatado) && Buffer.compare(rescatado, Buffer.from(original)) === 0);

  console.log('\n  — Y no se rompe lo que NO es un campo de bytes —');
  const normal = deserializar(serializar({
    id: 1, handle: 'luna', edades: [29, 30], meta: { a: 1, b: 2 }, nulo: null, vacio: {}
  }));
  check('los números, cadenas y arreglos pasan intactos',
    normal.id === 1 && normal.handle === 'luna' && Array.isArray(normal.edades) && normal.edades[1] === 30);
  // `{a:1,b:2}` tiene valores en rango de byte pero claves NO numéricas: no
  // debe confundirse con bytes. Es el falso positivo que hay que evitar.
  check('un objeto con claves no numéricas NO se confunde con bytes',
    !Buffer.isBuffer(normal.meta) && normal.meta.a === 1);
  check('un objeto vacío tampoco', !Buffer.isBuffer(normal.vacio));

  console.log('\n  — Y el archivo real se puede escribir y releer —');
  const tmp = path.join(os.tmpdir(), `wtbytes-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmp, serializar({ datos: { Passkey: [{ publicKey: original }] } }));
    const leido = deserializar(fs.readFileSync(tmp, 'utf8'));
    check('pasando por disco sigue siendo el mismo buffer',
      Buffer.compare(leido.datos.Passkey[0].publicKey, Buffer.from(original)) === 0);
  } finally {
    fs.existsSync(tmp) && fs.unlinkSync(tmp);
  }

  return results;
};
