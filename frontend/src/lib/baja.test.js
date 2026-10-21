import { leerTokenDeBaja } from './baja';

describe('leerTokenDeBaja', () => {
  test('toma el token de la URL', () => {
    expect(leerTokenDeBaja('?token=MTIzLmF2aXNvcw.abc_DEF-123')).toBe('MTIzLmF2aXNvcw.abc_DEF-123');
  });

  test('sin token o con token vacío: null', () => {
    expect(leerTokenDeBaja('')).toBeNull();
    expect(leerTokenDeBaja('?otra=cosa')).toBeNull();
    expect(leerTokenDeBaja('?token=')).toBeNull();
    expect(leerTokenDeBaja(undefined)).toBeNull();
    expect(leerTokenDeBaja(null)).toBeNull();
  });

  test('un token desmesurado se trata como ausente (no se manda al servidor)', () => {
    expect(leerTokenDeBaja(`?token=${'a'.repeat(300)}`)).toBeNull();
    expect(leerTokenDeBaja(`?token=${'a'.repeat(256)}`)).toBe('a'.repeat(256));
  });

  test('ignora los demás parámetros y no interpreta el token', () => {
    expect(leerTokenDeBaja('?utm_source=correo&token=abc.def&x=1')).toBe('abc.def');
  });
});
