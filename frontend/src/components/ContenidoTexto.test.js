import { describe, test, expect } from 'vitest';
import { extraerYoutubeId, parsearContenido } from './ContenidoTexto';

describe('ContenidoTexto - Extracción de YouTube ID', () => {
  test('extrae ID de enlace estándar watch?v=', () => {
    expect(extraerYoutubeId('Miren este video https://www.youtube.com/watch?v=dQw4w9WgXcQ genial')).toBe('dQw4w9WgXcQ');
  });

  test('extrae ID de enlace corto youtu.be', () => {
    expect(extraerYoutubeId('Escucha esto: https://youtu.be/dQw4w9WgXcQ?t=43')).toBe('dQw4w9WgXcQ');
  });

  test('extrae ID de YouTube Shorts', () => {
    expect(extraerYoutubeId('Un short https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extrae ID de YouTube Music', () => {
    expect(extraerYoutubeId('Rola: https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share')).toBe('dQw4w9WgXcQ');
  });

  test('devuelve null si no hay video de YouTube', () => {
    expect(extraerYoutubeId('Solo un texto normal https://example.com/pagina')).toBeNull();
    expect(extraerYoutubeId('')).toBeNull();
    expect(extraerYoutubeId(null)).toBeNull();
  });
});

describe('ContenidoTexto - Parseo de contenido', () => {
  test('parsea texto plano sin cambios', () => {
    const res = parsearContenido('Hola a todos');
    expect(res).toEqual(['Hola a todos']);
  });

  test('encuentra y procesa menciones y enlaces', () => {
    const res = parsearContenido('Hola @beto visita https://weedtown.social');
    expect(res.length).toBe(4); // 'Hola ', <Link @beto>, ' visita ', <Link url>
  });
});
