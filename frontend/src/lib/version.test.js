import { etiquetaDeVersion, etiquetaDeApi, fechaCorta, VERSION } from './version';

describe('etiquetaDeVersion', () => {
  test('arma «ciclo N · commit · fecha»', () => {
    expect(etiquetaDeVersion({ ciclo: '18', commit: '5b7c9be', construidoEn: '2026-10-20T22:41:03.000Z' }))
      .toBe('ciclo 18 · 5b7c9be · 2026-10-20');
  });

  test('lo que falta se omite: nunca «undefined» ni «null»', () => {
    expect(etiquetaDeVersion({ ciclo: '18', commit: 'desconocido', construidoEn: null })).toBe('ciclo 18');
    expect(etiquetaDeVersion({ ciclo: 'desconocido', commit: 'abc1234', construidoEn: null })).toBe('abc1234');
    expect(etiquetaDeVersion({})).toBe('versión desconocida');
  });

  test('un commit con forma rara no se muestra (no se cuela texto arbitrario al pie)', () => {
    expect(etiquetaDeVersion({ ciclo: '1', commit: '<script>', construidoEn: null })).toBe('ciclo 1');
  });

  test('en pruebas, sin Vite, VERSION cae a «dev» y no truena', () => {
    expect(typeof VERSION.ciclo).toBe('string');
    expect(() => etiquetaDeVersion()).not.toThrow();
  });
});

describe('fechaCorta', () => {
  test('toma el día de un ISO', () => expect(fechaCorta('2026-10-20T03:04:05.000Z')).toBe('2026-10-20'));
  test('lo que no es una fecha da null', () => {
    expect(fechaCorta('mañana')).toBeNull();
    expect(fechaCorta(null)).toBeNull();
    expect(fechaCorta(undefined)).toBeNull();
  });
});

describe('etiquetaDeApi', () => {
  test('commit y arranque', () => {
    expect(etiquetaDeApi({ commit: 'e869cd9', iniciadoEn: '2026-10-20T10:00:00.000Z' }))
      .toBe('api · e869cd9 · activa desde 2026-10-20');
  });
  test('sin commit (fuera de Render) pero con arranque', () => {
    expect(etiquetaDeApi({ commit: null, iniciadoEn: '2026-10-20T10:00:00.000Z' })).toBe('api · activa desde 2026-10-20');
  });
  test('sin nada que mostrar, null', () => {
    expect(etiquetaDeApi({ commit: null })).toBeNull();
    expect(etiquetaDeApi(null)).toBeNull();
  });
});
