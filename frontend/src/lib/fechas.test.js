// Ciclo 13E. Todo con RELOJ FIJO: `ahora` entra como parámetro y nunca se lee
// el reloj real. No es estilo — es la lección directa de la Ola 4, donde una
// aserción que sí lo leía pasó en verde y tumbó el CI seis horas después sin
// que hubiera cambiado una línea de código.
//
// Las fronteras se prueban por los dos lados (59 s y 60 s, 23 h y 24 h, día 6
// y día 7): un formateador de fechas se equivoca justo ahí y en ningún otro
// lado.
import { describe, it, expect } from 'vitest';
import { fechaRelativa, fechaCorta, fechaCompleta, etiquetaAccesible, etiquetaDeDia } from './fechas';

// Un martes a media tarde, para que restarle horas no cruce la medianoche por
// accidente y las pruebas digan lo que parecen decir.
const AHORA = new Date('2026-08-11T15:30:00');
const hace = (ms) => new Date(AHORA.getTime() - ms);
const SEG = 1000, MIN = 60 * SEG, HORA = 60 * MIN, DIA = 24 * HORA;

describe('fechaRelativa: la escala', () => {
  it('menos de un minuto es "ahora"', () => {
    expect(fechaRelativa(hace(0), AHORA)).toBe('ahora');
    expect(fechaRelativa(hace(59 * SEG), AHORA)).toBe('ahora');
  });

  it('al cumplir el minuto cambia, y en singular', () => {
    expect(fechaRelativa(hace(60 * SEG), AHORA)).toBe('hace un minuto');
    expect(fechaRelativa(hace(2 * MIN), AHORA)).toBe('hace 2 minutos');
    expect(fechaRelativa(hace(59 * MIN), AHORA)).toBe('hace 59 minutos');
  });

  it('al cumplir la hora cambia, y en singular', () => {
    expect(fechaRelativa(hace(60 * MIN), AHORA)).toBe('hace una hora');
    expect(fechaRelativa(hace(2 * HORA), AHORA)).toBe('hace 2 horas');
    expect(fechaRelativa(hace(23 * HORA), AHORA)).toBe('hace 23 horas');
  });

  it('a las 24 horas deja de contar horas', () => {
    expect(fechaRelativa(hace(24 * HORA), AHORA)).toBe('ayer');
  });

  it('de 2 a 6 días cuenta días', () => {
    expect(fechaRelativa(hace(2 * DIA), AHORA)).toBe('hace 2 días');
    expect(fechaRelativa(hace(6 * DIA), AHORA)).toBe('hace 6 días');
  });

  it('al séptimo día vuelve la fecha', () => {
    const r = fechaRelativa(hace(7 * DIA), AHORA);
    expect(r).not.toMatch(/hace/);
    expect(r).toContain('4'); // 4 de agosto
  });
});

describe('fechaRelativa: "ayer" es calendario, no 24 horas', () => {
  // Es la distinción que hace que la función se sienta natural, y la que se
  // equivoca cualquier implementación que solo divida milisegundos.
  it('algo de anoche a las 23:50, visto a las 00:10, lleva 20 minutos — no es "ayer"', () => {
    const medianochePasada = new Date('2026-08-11T00:10:00');
    const anoche = new Date('2026-08-10T23:50:00');
    expect(fechaRelativa(anoche, medianochePasada)).toBe('hace 20 minutos');
  });

  it('algo de ayer a las 08:00, visto hoy a las 22:00, son 38 horas — y sí es "ayer"', () => {
    const hoyDeNoche = new Date('2026-08-11T22:00:00');
    const ayerTemprano = new Date('2026-08-10T08:00:00');
    expect(fechaRelativa(ayerTemprano, hoyDeNoche)).toBe('ayer');
  });

  it('cruzar la medianoche no convierte 30 minutos en un día', () => {
    const justoDespues = new Date('2026-08-11T00:05:00');
    const justoAntes = new Date('2026-08-10T23:35:00');
    expect(fechaRelativa(justoAntes, justoDespues)).toBe('hace 30 minutos');
  });
});

describe('fechaRelativa: casos que rompen a las implementaciones ingenuas', () => {
  it('una fecha en el FUTURO se muestra como "ahora", nunca "en 3 minutos"', () => {
    // Pasa de verdad: el reloj del dispositivo va atrasado respecto al del
    // servidor y el posteo recién creado llega con fecha "futura".
    const futuro = new Date(AHORA.getTime() + 3 * MIN);
    expect(fechaRelativa(futuro, AHORA)).toBe('ahora');
  });

  it('una fecha inválida devuelve cadena vacía, no "Invalid Date"', () => {
    expect(fechaRelativa('no soy una fecha', AHORA)).toBe('');
    expect(fechaRelativa(null, AHORA)).toBe('');
    expect(fechaRelativa(undefined, AHORA)).toBe('');
  });

  it('acepta cadenas ISO igual que objetos Date', () => {
    const iso = hace(2 * HORA).toISOString();
    expect(fechaRelativa(iso, AHORA)).toBe('hace 2 horas');
  });
});

describe('fechaCorta: el año solo cuando hace falta', () => {
  it('dentro del mismo año no lo incluye', () => {
    expect(fechaCorta(new Date('2026-03-04T12:00:00'), AHORA)).not.toContain('2026');
  });

  it('de otro año sí lo incluye, porque ahí sí es ambiguo', () => {
    expect(fechaCorta(new Date('2025-03-04T12:00:00'), AHORA)).toContain('2025');
  });
});

describe('la fecha exacta no se pierde', () => {
  it('fechaCompleta trae día y hora', () => {
    const c = fechaCompleta(new Date('2026-08-09T13:37:00'));
    expect(c).toMatch(/2026/);
    expect(c).toMatch(/9/);
    expect(c).toMatch(/13:37|1:37/);
  });

  it('la etiqueta accesible dice las DOS cosas: lo relativo y lo exacto', () => {
    const e = etiquetaAccesible(hace(2 * HORA), AHORA);
    expect(e).toContain('hace 2 horas');
    expect(e).toContain('2026');
  });

  it('una fecha inválida no produce una etiqueta a medias', () => {
    expect(etiquetaAccesible('basura', AHORA)).toBe('');
  });
});

describe('etiquetaDeDia: separadores del chat', () => {
  it('el mismo día es "hoy", sin importar la hora', () => {
    expect(etiquetaDeDia(new Date('2026-08-11T00:01:00'), AHORA)).toBe('hoy');
    expect(etiquetaDeDia(hace(10 * MIN), AHORA)).toBe('hoy');
  });

  it('el día anterior es "ayer" aunque hayan pasado pocas horas', () => {
    const apenasAyer = new Date('2026-08-10T23:00:00');
    expect(etiquetaDeDia(apenasAyer, AHORA)).toBe('ayer');
  });

  it('a la semana pasa a fecha', () => {
    expect(etiquetaDeDia(hace(3 * DIA), AHORA)).toBe('hace 3 días');
    expect(etiquetaDeDia(hace(9 * DIA), AHORA)).not.toMatch(/hace/);
  });
});
