// Trampa 5 (redirección abierta): `next` decide a dónde navega el propio
// navegador después del login, así que si aceptara una URL completa,
// `/login?next=https://sitio-malo` convertiría a WeedTown en trampolín de
// phishing — y el enlace se vería legítimo porque lo es. Esta validación es
// puramente de cliente (nunca llega al backend), así que se prueba aquí,
// junto al módulo real que usa Login.jsx y AuthCallback.jsx — no una copia.
import { esRutaInterna } from './rutaInterna';

describe('esRutaInterna (HU-CTA-002 / HU-CTA-003, Trampa 5)', () => {
  test('rechaza //evil.com (protocol-relative: salta de dominio sin esquema)', () => {
    expect(esRutaInterna('//evil.com')).toBeNull();
  });

  test('rechaza https://evil.com (URL absoluta con esquema)', () => {
    expect(esRutaInterna('https://evil.com')).toBeNull();
  });

  test('rechaza /\\evil.com (backslash: algunos navegadores lo tratan como //)', () => {
    expect(esRutaInterna('/\\evil.com')).toBeNull();
  });

  test('acepta /perfil/1 (ruta interna legítima)', () => {
    expect(esRutaInterna('/perfil/1')).toBe('/perfil/1');
  });

  test('acepta /p/42 (destino real del CTA de HU-CTA-003)', () => {
    expect(esRutaInterna('/p/42')).toBe('/p/42');
  });

  test('rechaza javascript:alert(1) (sin "/" inicial)', () => {
    expect(esRutaInterna('javascript:alert(1)')).toBeNull();
  });

  test('rechaza una ruta con esquema disfrazado antes de la primera barra', () => {
    expect(esRutaInterna('/x:y/evil.com')).toBeNull();
  });

  test('rechaza vacío, null y undefined', () => {
    expect(esRutaInterna('')).toBeNull();
    expect(esRutaInterna(null)).toBeNull();
    expect(esRutaInterna(undefined)).toBeNull();
  });
});
