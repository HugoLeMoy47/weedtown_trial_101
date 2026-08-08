// El texto de cuánto le queda a una intención (ciclo 10C).
//
// Existe por un bug real: la primera versión pisaba las horas y redondeaba los
// minutos por separado, así que al declarar 4 horas la pantalla decía
// "quedan 3 h 60 min" — porque a los pocos milisegundos ya faltaban 3 h 59 min
// 58 s. Se vio en el navegador, no leyendo el código.
import { tiempoRestante, intencionPor, INTENCIONES } from './intencionCerca';

const enMs = (ms) => new Date(Date.now() + ms).toISOString();
const MIN = 60 * 1000;
const HORA = 60 * MIN;

describe('tiempoRestante', () => {
  test('el caso del bug: casi 4 horas no dice "3 h 60 min"', () => {
    const t = tiempoRestante(enMs(4 * HORA - 2000));
    expect(t).not.toMatch(/60 min/);
    expect(t).toBe('quedan 4 h');
  });

  test('redondea al minuto más cercano, sin desbordar', () => {
    expect(tiempoRestante(enMs(2 * HORA - 500))).toBe('quedan 2 h');
    expect(tiempoRestante(enMs(8 * HORA - 1000))).toBe('quedan 8 h');
  });

  test('horas y minutos juntos', () => {
    expect(tiempoRestante(enMs(3 * HORA + 25 * MIN))).toBe('quedan 3 h 25 min');
  });

  test('menos de una hora, solo minutos', () => {
    expect(tiempoRestante(enMs(45 * MIN))).toBe('quedan 45 min');
  });

  test('concuerda en singular', () => {
    expect(tiempoRestante(enMs(1 * HORA))).toBe('queda 1 h');
    expect(tiempoRestante(enMs(1 * MIN))).toBe('queda 1 min');
  });

  test('vencida y vacía', () => {
    expect(tiempoRestante(enMs(-1000))).toBe('ya caducó');
    expect(tiempoRestante(null)).toBe('');
  });
});

describe('catálogo de intenciones', () => {
  test('las tres tienen los textos que usan el selector y la lista', () => {
    expect(INTENCIONES).toHaveLength(3);
    for (const i of INTENCIONES) {
      expect(i.valor).toMatch(/^(ROLAR|CONECTAR|MIRANDO)$/);
      expect(i.propia).toBeTruthy();
      expect(i.ajena).toBeTruthy();
      expect(i.emoji).toBeTruthy();
    }
  });

  test('una intención desconocida no revienta: devuelve null', () => {
    expect(intencionPor('FIESTA')).toBeNull();
    expect(intencionPor(null)).toBeNull();
  });
});
