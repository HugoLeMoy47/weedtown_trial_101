// Ciclo 9D: la aritmética del recorte.
//
// Lo que se prueba aquí es lo que falla SIN QUE NADA AVISE: un rectángulo que
// se sale del lienzo (y produce un recorte con franjas negras o un `drawImage`
// fuera de rango), un tirador que cruza al lado opuesto y voltea la caja, una
// rotación con un signo invertido que manda el encuadre al otro extremo de la
// foto. Nada de eso lanza un error: produce una imagen mal cortada, que se ve
// como un descuido de quien publicó.
//
// El `<canvas>` no se prueba aquí a propósito — jsdom no trae contexto 2d ni
// `toBlob`, así que no hay nada que probar sin montar un navegador de verdad.
// La verificación de que el archivo exportado sale bien (y SIN EXIF) se hizo a
// mano en un navegador real, que es donde esa pregunta se puede contestar.
import {
  RECORTE_COMPLETO, LADO_MINIMO, NOMBRES_ESQUINA,
  rotarRecorte90, moverRecorte, redimensionarRecorte, recorteEsCompleto
} from './recorte';

const casi = (a, b) => expect(a).toBeCloseTo(b, 10);
const casiIgual = (r, esperado) => {
  casi(r.x, esperado.x); casi(r.y, esperado.y);
  casi(r.w, esperado.w); casi(r.h, esperado.h);
};

// Un rectángulo es válido si cabe entero en la imagen y no está volteado.
const esValido = (r) =>
  r.w >= LADO_MINIMO - 1e-9 && r.h >= LADO_MINIMO - 1e-9
  && r.x >= -1e-9 && r.y >= -1e-9
  && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

describe('rotarRecorte90', () => {
  test('el recorte completo sigue siendo el recorte completo', () => {
    casiIgual(rotarRecorte90(RECORTE_COMPLETO), RECORTE_COMPLETO);
  });

  test('gira en sentido horario: el cuarto superior izquierdo pasa a ser el superior derecho', () => {
    casiIgual(rotarRecorte90({ x: 0, y: 0, w: 0.5, h: 0.5 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  test('intercambia ancho y alto (la imagen pasa de W×H a H×W)', () => {
    const girado = rotarRecorte90({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    casi(girado.w, 0.4);
    casi(girado.h, 0.3);
  });

  test('cuatro vueltas devuelven EXACTAMENTE el rectángulo original', () => {
    // La prueba más barata que existe para detectar un signo invertido: con
    // el signo al revés, una y tres vueltas se ven plausibles y cuatro no.
    const original = { x: 0.13, y: 0.21, w: 0.34, h: 0.42 };
    let r = original;
    for (let i = 0; i < 4; i++) r = rotarRecorte90(r);
    casiIgual(r, original);
  });

  test('el resultado siempre cabe en el lienzo', () => {
    let r = { x: 0, y: 0.6, w: 0.25, h: 0.4 };
    for (let i = 0; i < 4; i++) {
      r = rotarRecorte90(r);
      expect(esValido(r)).toBe(true);
    }
  });
});

describe('moverRecorte', () => {
  test('mueve sin cambiar el tamaño', () => {
    const r = moverRecorte({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 }, 0.1, -0.05);
    casiIgual(r, { x: 0.3, y: 0.15, w: 0.4, h: 0.3 });
  });

  test('se detiene en el borde en vez de salirse (arrastre largo a la derecha y abajo)', () => {
    const r = moverRecorte({ x: 0.5, y: 0.5, w: 0.4, h: 0.3 }, 5, 5);
    casiIgual(r, { x: 0.6, y: 0.7, w: 0.4, h: 0.3 });
    expect(esValido(r)).toBe(true);
  });

  test('y también en el borde contrario, sin coordenadas negativas', () => {
    const r = moverRecorte({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 }, -5, -5);
    casiIgual(r, { x: 0, y: 0, w: 0.4, h: 0.3 });
  });
});

describe('redimensionarRecorte', () => {
  test('la esquina noroeste mueve los bordes izquierdo y superior, no los otros dos', () => {
    const base = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    const r = redimensionarRecorte(base, 'no', 0.1, 0.1);
    casiIgual(r, { x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
  });

  test('la esquina sureste mueve los bordes derecho e inferior', () => {
    const r = redimensionarRecorte({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'se', -0.1, -0.2);
    casiIgual(r, { x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
  });

  test('un tirador arrastrado más allá del lado opuesto NO voltea la caja', () => {
    // Sin el tope, esto daría ancho y alto negativos y `drawImage` recortaría
    // cualquier cosa.
    for (const esquina of NOMBRES_ESQUINA) {
      const r = redimensionarRecorte({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, esquina, 9, 9);
      expect(esValido(r)).toBe(true);
      const r2 = redimensionarRecorte({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, esquina, -9, -9);
      expect(esValido(r2)).toBe(true);
    }
  });

  test('respeta el lado mínimo, que es lo que evita que las 4 esquinas se encimen', () => {
    const r = redimensionarRecorte({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'se', -0.49, -0.49);
    casi(r.w, LADO_MINIMO);
    casi(r.h, LADO_MINIMO);
  });

  test('nunca se sale del lienzo por ninguna esquina', () => {
    const base = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    for (const esquina of NOMBRES_ESQUINA) {
      for (const [dx, dy] of [[0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [2, -2]]) {
        expect(esValido(redimensionarRecorte(base, esquina, dx, dy))).toBe(true);
      }
    }
  });

  test('una esquina desconocida no rompe nada: devuelve la base sin tocar', () => {
    const base = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(redimensionarRecorte(base, 'xx', 0.1, 0.1)).toBe(base);
  });
});

describe('recorteEsCompleto', () => {
  test('el recorte completo lo es', () => {
    expect(recorteEsCompleto(RECORTE_COMPLETO)).toBe(true);
  });

  test('cualquier recorte real no lo es', () => {
    expect(recorteEsCompleto({ x: 0, y: 0, w: 0.9, h: 1 })).toBe(false);
    expect(recorteEsCompleto({ x: 0.05, y: 0, w: 0.95, h: 1 })).toBe(false);
  });

  test('tolera el error de redondeo de arrastrar y volver al borde', () => {
    expect(recorteEsCompleto({ x: 0.0001, y: 0, w: 0.9999, h: 1 })).toBe(true);
  });
});
