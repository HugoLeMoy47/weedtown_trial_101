import {
  PRESETS,
  auditarEtiqueta,
  insertarIngredienteEnLista,
  generarCodigoLote,
  sanitizarDatosEtiqueta,
  esSubdominioEtiquetas,
  urlLoginParaEtiquetas,
  armarTextoPostEtiqueta
} from './etiquetaspe420';

describe('etiquetaspe420 — Estudio de Etiquetado Artesanal & RRD', () => {
  test('los 4 presets preconfigurados pasan el semáforo regulatorio COFEPRIS/PROFECO sin alertas', () => {
    for (const key of ['unguento', 'termico', 'gotas', 'gomitas']) {
      const resultado = auditarEtiqueta(PRESETS[key]);
      expect(resultado.optimo).toBe(true);
      expect(resultado.alertas).toEqual([]);
    }
  });

  test('detecta verbos médicos curativos prohibidos (Art. 270 LGS y NOM-141)', () => {
    const res = auditarEtiqueta({
      ...PRESETS.unguento,
      proposito: 'Pomada que cura el dolor articular al instante.'
    });
    expect(res.optimo).toBe(false);
    expect(res.alertas.some(a => a.motivo.includes('Art. 270 LGS'))).toBe(true);
  });

  test('detecta menciones de patologías clínicas sujetas a registro sanitario COFEPRIS', () => {
    const res = auditarEtiqueta({
      ...PRESETS.gotas,
      proposito: 'Auxiliar para artritis y epilepsia.'
    });
    expect(res.optimo).toBe(false);
    expect(res.alertas.some(a => a.motivo.includes('COFEPRIS'))).toBe(true);
  });

  test('aplica la Regla de Aislamiento: bloquea nombres de A.C. o colectivos cívicos en la etiqueta', () => {
    const resLazo = auditarEtiqueta({
      ...PRESETS.unguento,
      elaborador: 'Elaborado por Fundación Lazo'
    });
    expect(resLazo.optimo).toBe(false);
    expect(resLazo.alertas.some(a => a.motivo.includes('Regla de Aislamiento'))).toBe(true);

    const resComuna = auditarEtiqueta({
      ...PRESETS.gomitas,
      elaborador: 'Colectivo La Comuna 420'
    });
    expect(resComuna.optimo).toBe(false);
    expect(resComuna.alertas.some(a => a.motivo.includes('Regla de Aislamiento'))).toBe(true);
  });

  test('advierte cuando el contenido neto no declara unidad oficial NOM-030 (g o ml)', () => {
    const res = auditarEtiqueta({
      ...PRESETS.unguento,
      contNeto: '1 frasco grande'
    });
    expect(res.optimo).toBe(false);
    expect(res.alertas.some(a => a.motivo.includes('NOM-030-SCFI'))).toBe(true);
  });

  test('insertarIngredienteEnLista respeta el punto final de la lista INCI', () => {
    expect(insertarIngredienteEnLista('', 'Vitamina E (Tocopherol)'))
      .toBe('Vitamina E (Tocopherol)');
    expect(insertarIngredienteEnLista('Cera de abeja (Cera Alba).', 'Vitamina E (Tocopherol)'))
      .toBe('Cera de abeja (Cera Alba), Vitamina E (Tocopherol).');
    expect(insertarIngredienteEnLista('Cera de abeja (Cera Alba)', 'Vitamina E (Tocopherol)'))
      .toBe('Cera de abeja (Cera Alba), Vitamina E (Tocopherol)');
  });

  test('generarCodigoLote arma código NOM-259 con fecha AA-MM-DD', () => {
    const fecha = new Date(2026, 9, 15); // 15 de octubre de 2026
    expect(generarCodigoLote('Ungüento Botánico', fecha)).toBe('PE420-ALV-UNGEN-261015');
    expect(generarCodigoLote('', fecha)).toBe('PE420-ALV-ART-261015');
  });

  test('sanitizarDatosEtiqueta rellena defaults seguros ante JSON incompleto', () => {
    const s = sanitizarDatosEtiqueta({ categoria: 'invalida', copias: 99, marca: 'MI TALLER' });
    expect(s.categoria).toBe('topico');
    expect(s.copias).toBe(3);
    expect(s.marca).toBe('MI TALLER');
    expect(s.nombre).toBe(PRESETS.unguento.nombre);
  });

  test('esSubdominioEtiquetas y urlLoginParaEtiquetas resuelven etkt420.weedtown.social', () => {
    expect(esSubdominioEtiquetas('etkt420.weedtown.social')).toBe(true);
    expect(esSubdominioEtiquetas('weedtown.social')).toBe(false);
    expect(urlLoginParaEtiquetas('etkt420.weedtown.social'))
      .toBe('https://weedtown.social/login?next=%2Fetiquetas');
    expect(urlLoginParaEtiquetas('weedtown.social'))
      .toBe('/login?next=%2Fetiquetas');
  });

  test('armarTextoPostEtiqueta genera texto y hashtags para compartir en el feed', () => {
    const post = armarTextoPostEtiqueta(PRESETS.gomitas);
    expect(post.content).toContain('GUMMIES & CHILL');
    expect(post.content).toContain('ALIVE FUN!');
    expect(post.content).toContain('https://etkt420.weedtown.social');
    expect(post.hashtags).toContain('PE420');
  });
});
