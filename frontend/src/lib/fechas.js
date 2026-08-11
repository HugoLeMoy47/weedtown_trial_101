// Fechas legibles para las superficies sociales (ciclo 13E).
//
// Hasta este ciclo toda fecha se pintaba igual: "9 ago 2026, 13:37", en siete
// lugares distintos y cada uno con su propia llamada a toLocaleString. Para
// algo de la semana pasada está bien. Para un posteo de hace diez minutos es
// precisión inútil: obliga a hacer una resta mental para contestar lo único
// que importa en un feed, que es si esto está fresco.
//
// FUNCIONES PURAS, y `ahora` entra COMO PARÁMETRO. No es purismo: es lo que
// hace que se puedan probar con reloj fijo. La Ola 4 dejó la lección cara —
// una aserción que leía el reloj real pasó en verde y tumbó el CI seis horas
// después, sin que hubiera cambiado ningún código.
//
// La escala la decidió el PO:
//   < 1 min          ahora
//   < 1 h            hace X minutos
//   < 24 h           hace X horas
//   día anterior     ayer
//   2 a 6 días       hace X días
//   7 días o más     la fecha
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

// "Ayer" es un concepto de CALENDARIO, no una ventana de 24 horas, y por eso
// la escala tiene dos mitades:
//
//   - Algo de las 23:50 visto a las 00:10 lleva 20 minutos. Decir "ayer"
//     sería técnicamente cierto y absurdo: manda "hace 20 minutos".
//   - Algo de ayer a las 08:00 visto hoy a las 22:00 lleva 38 horas. Decir
//     "hace 38 horas" obliga a la resta que veníamos a evitar: manda "ayer".
//
// Por eso hasta 24 h gana el TIEMPO TRANSCURRIDO y de ahí en adelante gana el
// DÍA DE CALENDARIO. La cuenta de días se hace sobre medianoches locales, no
// dividiendo milisegundos, para que un cambio de horario de verano no corra la
// frontera un día entero (México ya no lo aplica, pero quien lea puede estar
// en otro huso).
function diasDeCalendario(desde, hasta) {
  const a = new Date(desde); a.setHours(0, 0, 0, 0);
  const b = new Date(hasta); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / DIA);
}

// `null` y `''` se descartan ANTES de construir el Date, y no es defensa de
// más: `new Date(null)` **no** da una fecha inválida, da el epoch. Sin esta
// línea, un campo de fecha que llega vacío —una notificación sin `createdAt`,
// un post a medio cargar— se pintaría como "31 dic 1969" en vez de no
// pintarse. Lo encontró la prueba de este mismo ciclo, no una revisión.
export function aFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// La zona horaria es la DEL DISPOSITIVO, no America/Mexico_City forzada: el
// corte de medianoche tiene que coincidir con el de quien lee. Es al revés que
// en el backend, donde las métricas del panóptico sí se truncan a hora de
// México a propósito — ahí se mide una red que vive en México; aquí se le
// habla a una persona que puede estar en cualquier lado.
export function fechaCorta(valor, ahora = new Date()) {
  const d = aFecha(valor);
  if (!d) return '';
  // El año solo aparece cuando de verdad hace falta. Dentro del mismo año
  // "9 ago" no es ambiguo y ocupa menos; cruzando el año, "9 ago" sí lo es.
  const mismoAnio = d.getFullYear() === new Date(ahora).getFullYear();
  return d.toLocaleDateString('es-MX', mismoAnio
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fechaCompleta(valor) {
  const d = aFecha(valor);
  if (!d) return '';
  return d.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
}

export function fechaRelativa(valor, ahora = new Date()) {
  const d = aFecha(valor);
  if (!d) return '';
  const ms = new Date(ahora).getTime() - d.getTime();

  // Fechas en el FUTURO: pasa cuando el reloj del dispositivo va atrasado
  // respecto al del servidor, y con posteos recién creados es de lo más
  // normal. "en 3 minutos" para algo que la persona acaba de publicar se lee
  // como un error del sitio; "ahora" es cierto en la práctica.
  if (ms < MINUTO) return 'ahora';

  if (ms < HORA) {
    const n = Math.floor(ms / MINUTO);
    return n === 1 ? 'hace un minuto' : `hace ${n} minutos`;
  }
  if (ms < DIA) {
    const n = Math.floor(ms / HORA);
    return n === 1 ? 'hace una hora' : `hace ${n} horas`;
  }

  const dias = diasDeCalendario(d, ahora);
  if (dias <= 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fechaCorta(d, ahora);
}

// Lo que oye quien usa un lector de pantalla: las dos cosas, no una. El texto
// relativo solo lo dejaría sin la fecha exacta; la fecha exacta sola le
// quitaría la información que el resto ve de un vistazo.
export function etiquetaAccesible(valor, ahora = new Date()) {
  const relativa = fechaRelativa(valor, ahora);
  const completa = fechaCompleta(valor);
  if (!relativa) return '';
  return `${relativa}, ${completa}`;
}

// Hacia el FUTURO: cuánto falta para algo. Lo usa el aviso de cuarentena
// (13B), que hasta ahora tenía su propia versión dentro de cuarentena.js.
// Vive aquí para que exista UNA sola forma de decir el tiempo en esta
// aplicación — la de arriba mira al pasado y ésta al futuro, pero si alguien
// cambia el tono de una debe ver la otra al lado.
//
// Redondea hacia ARRIBA a propósito: prometer menos espera de la real y que
// la acción siga bloqueada al volver es peor que prometer de más.
export function faltaPara(valor, ahora = new Date()) {
  const d = aFecha(valor);
  if (!d) return '';
  const ms = d.getTime() - new Date(ahora).getTime();
  if (ms <= 0) return 'ya';
  if (ms < MINUTO) return 'en menos de un minuto';
  if (ms < HORA) {
    const n = Math.ceil(ms / MINUTO);
    return n === 1 ? 'en un minuto' : `en ${n} minutos`;
  }
  const n = Math.ceil(ms / HORA);
  return n === 1 ? 'en una hora' : `en unas ${n} horas`;
}

// Separadores de día del chat: ahí no se dice "hace 3 horas", se dice de qué
// día es el bloque de mensajes que viene abajo.
export function etiquetaDeDia(valor, ahora = new Date()) {
  const d = aFecha(valor);
  if (!d) return '';
  const dias = diasDeCalendario(d, ahora);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fechaCorta(d, ahora);
}
