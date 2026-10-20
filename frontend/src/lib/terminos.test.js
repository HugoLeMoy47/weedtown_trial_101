import { decidirAvisoDeTerminos, TERMINOS_VIGENTES } from './terminos';

const V = '2026-10-20';

describe('decidirAvisoDeTerminos', () => {
  test('ya aceptó la versión vigente: no se hace nada', () => {
    expect(decidirAvisoDeTerminos({ terminosVersion: V, terminosVigentes: V }, null)).toBe('nada');
    expect(decidirAvisoDeTerminos({ terminosVersion: V, terminosVigentes: V }, V)).toBe('nada');
  });

  test('sin sesión, o sin que el servidor diga cuál es la vigente, no se adivina', () => {
    expect(decidirAvisoDeTerminos(null, V)).toBe('nada');
    expect(decidirAvisoDeTerminos({ terminosVersion: null }, V)).toBe('nada');
    expect(decidirAvisoDeTerminos({ terminosVersion: null, terminosVigentes: '' }, V)).toBe('nada');
  });

  test('marcó la casilla de ESTA versión al entrar: se registra en silencio', () => {
    expect(decidirAvisoDeTerminos({ terminosVersion: null, terminosVigentes: V }, V)).toBe('registrar');
    expect(decidirAvisoDeTerminos({ terminosVersion: '2020-01-01', terminosVigentes: V }, V)).toBe('registrar');
  });

  test('una marca de otra versión NO cuenta como aceptación del texto nuevo', () => {
    expect(decidirAvisoDeTerminos({ terminosVersion: null, terminosVigentes: V }, '2020-01-01')).toBe('avisar');
  });

  test('las cuentas anteriores al 19.5 (sin versión) y sin casilla recién marcada reciben el aviso', () => {
    expect(decidirAvisoDeTerminos({ terminosVersion: null, terminosVigentes: V }, null)).toBe('avisar');
    expect(decidirAvisoDeTerminos({ terminosVersion: '2020-01-01', terminosVigentes: V }, null)).toBe('avisar');
  });

  test('la constante tiene forma de fecha AAAA-MM-DD', () => {
    expect(TERMINOS_VIGENTES).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
