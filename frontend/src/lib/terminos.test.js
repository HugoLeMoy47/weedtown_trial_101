import { decidirAvisoDeTerminos, modoDePuerta, fechaLarga, franjaDeTerminos, DIAS_SIN_CERRAR, TERMINOS_VIGENTES } from './terminos';

const V = '2026-10-21';

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

describe('modoDePuerta (ciclo 20)', () => {
  const base = { terminosVigentes: V };

  test('ya aceptó la vigente: libre, aunque el servidor diga que se exige', () => {
    expect(modoDePuerta({ ...base, terminosVersion: V, terminosExigidos: true }, null)).toBe('libre');
  });

  test('sin sesión o sin que el servidor diga la vigente: libre (no se adivina)', () => {
    expect(modoDePuerta(null, V)).toBe('libre');
    expect(modoDePuerta({ terminosVersion: null, terminosExigidos: true }, V)).toBe('libre');
  });

  test('marcó la casilla de ESTA versión: se registra, haya o no plazo vencido', () => {
    expect(modoDePuerta({ ...base, terminosVersion: null, terminosExigidos: false }, V)).toBe('registrar');
    expect(modoDePuerta({ ...base, terminosVersion: null, terminosExigidos: true }, V)).toBe('registrar');
  });

  test('una marca de otra versión no registra nada', () => {
    expect(modoDePuerta({ ...base, terminosVersion: null, terminosExigidos: false }, '2020-01-01')).toBe('dialogo');
    expect(modoDePuerta({ ...base, terminosVersion: null, terminosExigidos: true }, '2020-01-01')).toBe('compuerta');
  });

  test('falta aceptar y aún hay plazo: diálogo con «Más tarde»', () => {
    expect(modoDePuerta({ ...base, terminosVersion: null, terminosExigidos: false }, null)).toBe('dialogo');
    expect(modoDePuerta({ ...base, terminosVersion: '2020-01-01', terminosExigidos: false }, null)).toBe('dialogo');
  });

  test('falta aceptar y el plazo venció: compuerta', () => {
    expect(modoDePuerta({ ...base, terminosVersion: null, terminosExigidos: true }, null)).toBe('compuerta');
  });

  test('el navegador no recalcula fechas: manda lo que dice el servidor', () => {
    // Sin `terminosExigidos` (campo ausente) nunca llega a la compuerta.
    expect(modoDePuerta({ ...base, terminosVersion: null }, null)).toBe('dialogo');
  });
});

describe('fechaLarga', () => {
  test('da el día sin desfase de zona horaria', () => {
    expect(fechaLarga('2026-11-19')).toMatch(/^19 de noviembre de 2026$/);
    expect(fechaLarga('2026-01-01')).toMatch(/^1 de enero de 2026$/);
  });
  test('lo que no es una fecha da null', () => {
    expect(fechaLarga('mañana')).toBeNull();
    expect(fechaLarga(null)).toBeNull();
    expect(fechaLarga('2026-11-19T00:00:00Z')).toBeNull();
  });
});

describe('franjaDeTerminos (ciclo 21)', () => {
  const sinAceptar = (dias, extra = {}) => ({ terminosVigentes: V, terminosVersion: null, terminosExigidos: false, terminosDiasRestantes: dias, ...extra });

  test('mientras hay plazo, muestra los días que dice el servidor', () => {
    expect(franjaDeTerminos(sinAceptar(30))).toEqual({ dias: 30, cerrable: true });
    expect(franjaDeTerminos(sinAceptar(8))).toEqual({ dias: 8, cerrable: true });
  });

  test('en los últimos 7 días ya no se puede cerrar (decisión del PO)', () => {
    expect(DIAS_SIN_CERRAR).toBe(7);
    expect(franjaDeTerminos(sinAceptar(7))).toEqual({ dias: 7, cerrable: false });
    expect(franjaDeTerminos(sinAceptar(1))).toEqual({ dias: 1, cerrable: false });
    expect(franjaDeTerminos(sinAceptar(0))).toEqual({ dias: 0, cerrable: false });
  });

  test('cerrada por la sesión, desaparece... salvo en los últimos 7 días', () => {
    expect(franjaDeTerminos(sinAceptar(20), true)).toBeNull();
    expect(franjaDeTerminos(sinAceptar(7), true)).toEqual({ dias: 7, cerrable: false });
  });

  test('ya aceptada la vigente: no hay nada que avisar', () => {
    expect(franjaDeTerminos(sinAceptar(20, { terminosVersion: V }))).toBeNull();
  });

  test('vencido el plazo la ocupa la compuerta, no la franja', () => {
    expect(franjaDeTerminos(sinAceptar(0, { terminosExigidos: true }))).toBeNull();
  });

  test('sin sesión, sin versión vigente o sin días del servidor: nada (no se adivina)', () => {
    expect(franjaDeTerminos(null)).toBeNull();
    expect(franjaDeTerminos({ terminosVersion: null, terminosDiasRestantes: 10 })).toBeNull();
    expect(franjaDeTerminos(sinAceptar(undefined))).toBeNull();
    expect(franjaDeTerminos(sinAceptar(null))).toBeNull();
  });
});
