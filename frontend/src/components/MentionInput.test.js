import { describe, test, expect } from 'vitest';
import { detectarMencion } from './MentionInput';

describe('MentionInput - Detección de menciones', () => {
  test('detecta arroba con prefijo', () => {
    const res = detectarMencion('Hola @beto', 10);
    expect(res.activo).toBe(true);
    expect(res.query).toBe('beto');
    expect(res.inicio).toBe(5);
    expect(res.fin).toBe(10);
  });

  test('detecta arroba al inicio del texto', () => {
    const res = detectarMencion('@ana', 4);
    expect(res.activo).toBe(true);
    expect(res.query).toBe('ana');
    expect(res.inicio).toBe(0);
  });

  test('ignora texto sin arroba', () => {
    const res = detectarMencion('Hola mundo', 10);
    expect(res.activo).toBe(false);
  });

  test('ignora arroba solitaria sin letras', () => {
    const res = detectarMencion('Hola @', 6);
    expect(res.activo).toBe(false);
  });
});
