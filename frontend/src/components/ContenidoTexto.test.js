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

  // Ciclo 15D: la mención lleva la misma guarda de carácter previo que el
  // backend (menciones.js:HANDLE_REGEX). Sin ella, un correo como
  // hugo@gmail.com no dispara notificación (el backend ya lo filtraba) pero
  // SÍ renderizaba "@gmail" como enlace clicable a /@gmail.
  const esEnlaceDeMencion = (el) => Boolean(el && typeof el === 'object' && el.props && typeof el.props.to === 'string');

  test('un correo no produce enlace de mención', () => {
    const res = parsearContenido('escríbeme a hugo@gmail.com');
    expect(res.some(esEnlaceDeMencion)).toBe(false);
  });

  test('una mención real (precedida de espacio) sí produce enlace', () => {
    const res = parsearContenido('hola @hugo');
    const enlace = res.find(esEnlaceDeMencion);
    expect(enlace).toBeTruthy();
    expect(enlace.props.to).toBe('/@hugo');
  });
});
