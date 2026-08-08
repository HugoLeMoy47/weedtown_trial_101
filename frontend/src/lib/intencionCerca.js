// Cómo se dice y se pinta cada intención de Cerca (ciclo 10C).
//
// Vive aparte porque lo usan tres lugares —el selector propio, la lista de
// personas y el mapa— y una etiqueta distinta en cada uno haría que la misma
// intención se lea como tres cosas.
//
// El texto está en primera persona para el selector ("ando para rolar") y en
// tercera para la lista ("anda para rolar"): es la misma intención vista desde
// dos lados, y forzar una sola redacción hace que una de las dos suene rara.
export const INTENCIONES = [
  {
    valor: 'ROLAR',
    emoji: '🌿',
    propia: 'Ando para rolar',
    ajena: 'anda para rolar',
    color: 'success'
  },
  {
    valor: 'CONECTAR',
    emoji: '👋',
    propia: 'Abierto a conectar',
    ajena: 'abierta a conectar',
    color: 'primary'
  },
  {
    valor: 'MIRANDO',
    emoji: '👀',
    propia: 'Solo mirando',
    ajena: 'solo mirando',
    color: 'default'
  }
];

export const intencionPor = (valor) => INTENCIONES.find(i => i.valor === valor) || null;

// Cuánto le queda, en palabras. Se usa solo en el estado propio: a los demás no
// se les dice cuándo caduca la intención de alguien — es mecánica interna.
export function tiempoRestante(hasta) {
  if (!hasta) return '';
  const ms = new Date(hasta) - Date.now();
  if (ms <= 0) return 'ya caducó';
  // Se redondea PRIMERO a minutos y luego se descompone. Al revés —pisar las
  // horas y redondear el resto por separado— produce "3 h 60 min" cuando
  // faltan 3 h 59 min 58 s, que es justo el caso normal al declarar 4 horas.
  const totalMin = Math.round(ms / 60000);
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  if (horas >= 1) return `queda${horas === 1 && !minutos ? '' : 'n'} ${horas} h${minutos ? ` ${minutos} min` : ''}`;
  return `queda${minutos === 1 ? '' : 'n'} ${minutos} min`;
}
