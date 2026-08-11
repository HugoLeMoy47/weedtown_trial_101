// El día de calendario en México, como 'YYYY-MM-DD'.
//
// Vive aparte porque desde el ciclo 13A lo necesitan DOS lugares que no se
// parecen: `indicadores.js`, que agrupa series al consultarlas, y
// `atribucion.js`, que tiene que decidir a qué día pertenece un conteo al
// ESCRIBIRLO. Si cada uno se lo calculara por su cuenta, bastaría con que uno
// olvidara la zona horaria para que la escritura y la lectura cayeran en días
// distintos — un desfase de seis horas que no falla, solo cuenta mal. Es la
// misma clase de bug que el panóptico llama "Trampa 2".
//
// `en-CA` no es un capricho: es el locale que formatea como 'YYYY-MM-DD'. Y va
// con `timeZone` explícito porque el proceso de Node puede correr en UTC (en
// Render corre así), y entonces `toISOString().slice(0,10)` daría el día
// equivocado desde las 18:00 hora de México — justo antes del pico de uso.
const ZONA = 'America/Mexico_City';

function diaMexicoISO(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(fecha);
}

module.exports = { diaMexicoISO, ZONA };
