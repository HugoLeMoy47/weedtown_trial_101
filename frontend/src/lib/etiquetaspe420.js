// Estudio de Etiquetado Artesanal & Reducción de Riesgos (WeedTown × PE420)
// Lógica pura 100% client-side (Zero-Backend para datos de taller/recetas):
// presets regulatorios, auditor COFEPRIS/PROFECO en tiempo real, generador de
// lote NOM-259, detección del subdominio etkt420.weedtown.social y renderizado
// a PNG en Canvas para compartir la etiqueta como publicación en el feed.

export const STORAGE_KEY = 'weedtown_pe420_etiqueta_actual_v1';

export const CATEGORIAS_ETIQUETA = [
  { value: 'topico', label: 'Caso 1: Tópico / Cosmético (NOM-141)' },
  { value: 'herbolario', label: 'Caso 2: Remedio / Tintura Herbolaria (NOM-072)' },
  { value: 'comestible', label: 'Caso 3: Comestible / Gomitas (NOM-051 + RRD)' }
];

export const BADGE_NORMA = {
  topico: 'Estándar: NOM-141-SSA1/SCFI-2012 (Cosmético/Tópico) + NOM-030-SCFI',
  herbolario: 'Estándar: NOM-072-SSA1-2012 + Art. 9.D.7 CPCDMX (Preparación Herbolaria)',
  comestible: 'Estándar: NOM-051-SCFI/SSA1-2010 + Reducción de Riesgos y Daños (RRD)'
};

export const NORMA_CORTA = {
  topico: 'NOM-141 + NOM-030',
  herbolario: 'NOM-072 + Art. 9.D.7 CPCDMX',
  comestible: 'NOM-051 + Estándar RRD'
};

export const INGREDIENTES_RAPIDOS = [
  { label: '+ Aceite MCT', valor: 'Aceite de coco MCT (Caprylic/Capric Triglyceride)' },
  { label: '+ Cera Abeja', valor: 'Cera de abeja (Cera Alba)' },
  { label: '+ Karité', valor: 'Manteca de karité (Butyrospermum parkii Butter)' },
  { label: '+ Árnica', valor: 'Extracto de árnica (Arnica montana Flower Extract)' },
  { label: '+ Romero', valor: 'Extracto de romero (Rosmarinus officinalis Extract)' },
  { label: '+ Vitamina E', valor: 'Vitamina E (Tocopherol)' }
];

export const LISTA_PRESETS = [
  {
    key: 'unguento',
    titulo: '🌿 Caso 1A: Ungüento',
    subtitulo: 'NOM-141 · Cosmético Tópico'
  },
  {
    key: 'termico',
    titulo: '🌶️ Caso 1B: Crema Térmica',
    subtitulo: 'NOM-141 · Fricción / Calor'
  },
  {
    key: 'gotas',
    titulo: '💧 Caso 2: Gotas / Tintura',
    subtitulo: 'NOM-072 + Saberes Tradicionales'
  },
  {
    key: 'gomitas',
    titulo: '🍬 Caso 3: Comestibles',
    subtitulo: 'NOM-051 + Estándar RRD'
  }
];

export const PRESETS = {
  unguento: {
    categoria: 'topico',
    copias: 3,
    marca: 'LÍNEA ALIVE',
    contNeto: 'Cont. Neto: 50 g',
    nombre: 'UNGÜENTO BOTÁNICO ALIVE',
    generico: 'Bálsamo Tópico Artesanal para Masaje y Confort Corporal',
    dosis: 'Con Árnica, Romero, Lavanda y Extracto Botánico',
    via: 'USO EXTERNO / CUTÁNEO',
    proposito: 'Bálsamo tópico de elaboración artesanal que humecta la piel y facilita el masaje corporal en zonas de tensión muscular o fatiga física, brindando una sensación reconfortante y relajante.',
    ingredientes: 'Aceite de semilla de uva (Vitis vinifera Seed Oil), Cera de abeja orgánica (Cera Alba), Extracto de flor de árnica (Arnica montana Flower Extract), Extracto de hoja de romero (Rosmarinus officinalis Leaf Extract), Extracto botánico de Cannabis sativa L. (FECO), Aceite esencial de lavanda (Lavandula angustifolia Oil), Vitamina E (Tocopherol).',
    modoUso: 'Aplique una pequeña cantidad sobre la piel limpia y seca en la zona deseada, dando un suave masaje circular hasta su absorción. Lave sus manos después de aplicar.',
    advertencias: 'EXCLUSIVO PARA USO EXTERNO CUTÁNEO. NO SE INGIERA. Exclusivo para mayores de 18 años. No se deje al alcance de los niños. No se aplique sobre heridas abiertas, mucosas ni ojos. No se use en embarazo o lactancia. ESTE PRODUCTO ES UN COSMÉTICO BOTÁNICO ARTESANAL Y NO ES UN MEDICAMENTO.',
    lote: 'PE420-ALV-UNG50-261015',
    caducidad: '10/2027',
    elaborador: 'Hecho en México · Elaboración Artesanal en CDMX · PE420'
  },
  termico: {
    categoria: 'topico',
    copias: 3,
    marca: 'LÍNEA ALIVE',
    contNeto: 'Cont. Neto: 60 g',
    nombre: 'HEMP + CHILE',
    generico: 'Crema Tópica Botánica de Acción Térmica para Masaje Corporal',
    dosis: 'Aceite de Semilla de Cáñamo + Capsaicina (Efecto Calor)',
    via: 'USO EXTERNO / TÉRMICO',
    proposito: 'Crema tópica artesanal de masaje con acción rubefaciente (efecto calor) que reconforta la piel y acompaña el descanso físico después de la actividad intensa o en zonas de rigidez corporal.',
    ingredientes: 'Agua purificada (Aqua), Aceite de semilla de cáñamo (Cannabis sativa Seed Oil), Alcohol cetílico (Cetyl Alcohol), Glicerina vegetal (Glycerin), Manteca de karité (Butyrospermum parkii Butter), Oleorresina de chile / Capsaicina (Capsicum frutescens Fruit Extract), Vitamina E (Tocopherol), Conservador cosmético.',
    modoUso: 'Aplique una capa delgada sobre la zona deseada dando un suave masaje. Lave sus manos con abundante agua y jabón inmediatamente después de usar.',
    advertencias: 'USO EXTERNO ÚNICAMENTE. Produce sensación de calor local. Evite el contacto con ojos, mucosas, nariz, boca o piel irritada. No aplicar antes de bañarse con agua caliente ni cubrir con vendas oclusivas. Prohibido en menores de 18 años, embarazo o lactancia. ESTE PRODUCTO NO ES UN MEDICAMENTO.',
    lote: 'PE420-ALV-HMPC60-261015',
    caducidad: '04/2027',
    elaborador: 'Hecho en México · Elaboración Artesanal en CDMX · PE420'
  },
  gotas: {
    categoria: 'herbolario',
    copias: 3,
    marca: 'LÍNEA ALIVE',
    contNeto: 'Cont. Neto: 30 ml',
    nombre: 'GOTAS FULL SPECTRUM',
    generico: 'Preparación Herbolaria Tradicional en Aceite MCT',
    dosis: 'Total: 3000 mg Fitocomplejo (100 mg/ml · ~5 mg por gota)',
    via: 'PREPARACIÓN HERBOLARIA',
    proposito: 'Preparación herbolaria artesanal elaborada conforme a saberes tradicionales (Art. 9.D.7 CPCDMX), en vehículo de aceite de coco fraccionado (MCT) para bienestar y relajación en personas adultas.',
    ingredientes: 'Aceite de coco fraccionado grado alimenticio (Caprylic/Capric Triglyceride) 90%, Extracto botánico de espectro completo de Cannabis sativa L. (inflorescencias y hojas descarboxiladas) equivalente a 3000 mg por envase de 30 ml.',
    modoUso: 'CRITERIO RRD ("Empieza bajo y ve despacio"): Agitar bien antes de usar. En usuarios iniciales, comenzar con 1 a 2 gotas sublinguales y esperar al menos 2 horas para evaluar sensibilidad antes de ajustar la porción.',
    advertencias: 'EXCLUSIVO PARA ADULTOS MAYORES DE 18 AÑOS. No se deje al alcance de los niños ni mascotas. Prohibido en embarazo y lactancia. Puede producir somnolencia: NO conduzca vehículos ni opere maquinaria. No mezclar con alcohol. ESTE PRODUCTO ES UNA PREPARACIÓN HERBOLARIA ARTESANAL Y NO ES UN MEDICAMENTO.',
    lote: 'PE420-ALV-FS330-261015',
    caducidad: '10/2027',
    elaborador: 'Hecho en México · Elaboración Artesanal en CDMX · PE420'
  },
  gomitas: {
    categoria: 'comestible',
    copias: 3,
    marca: 'ALIVE FUN!',
    contNeto: 'Cont. Neto: 50 g (10 pzas)',
    nombre: 'GUMMIES & CHILL',
    generico: 'Confitería Botánica Artesanal Infusionada para Adultos',
    dosis: 'DOSIS: 15 mg THC / pieza · TOTAL ENVASE: 150 mg THC',
    via: '⚠️ EFECTO RETARDADO 2 HRS',
    proposito: 'Gomitas artesanales sabor frutal con dosificación estandarizada para adultos. Porción inicial sugerida de reducción de riesgos: 1/2 gomita (7.5 mg).',
    ingredientes: 'Jarabe de glucosa, azúcar, agua purificada, grenetina grado alimenticio, ácido cítrico, citrato de sodio, saborizantes frutales (limón, uva, naranja, piña, grosella), aceite MCT, extracto botánico descarboxilado de Cannabis sativa L. (15 mg Delta-9 THC por pieza). ALÉRGENOS: Elaborado en equipo que procesa soya y gluten.',
    modoUso: '⚠️ ALERTA DE EFECTO RETARDADO: Los efectos de este comestible tardan entre 60 y 120 MINUTOS en manifestarse por completo y duran de 6 a 8 horas. Comience con 1/2 pieza (7.5 mg) y ESPERE MÍNIMO 2 HORAS antes de ingerir otra porción.',
    advertencias: 'EXCLUSIVO PARA MAYORES DE 18 AÑOS. Manténgase en su empaque opaco resellable fuera de la vista y alcance de niños y mascotas. Prohibido en embarazo o lactancia. NO conduzca vehículos ni opere maquinaria. No mezclar con alcohol. ESTE PRODUCTO NO ES UN MEDICAMENTO.',
    lote: 'PE420-ALV-GCH15-261015',
    caducidad: '04/2027',
    elaborador: 'Hecho en México · Elaboración Artesanal en CDMX · PE420'
  }
};

export const PALABRAS_PROHIBIDAS = [
  {
    regex: /\b(cura|curar|curativo|curativa|sana|sanar)\b/i,
    motivo: 'Verbo médico curativo prohibido por Art. 270 LGS y NOM-141.',
    sugerencia: 'Usa "reconforta", "protege", "humecta" o "favorece el bienestar".'
  },
  {
    regex: /\b(artritis|reumatismo|fibromialgia|cáncer|cancer|diabetes|epilepsia|tumor|alzheimer)\b/i,
    motivo: 'Mención de patología clínica que exige Registro Sanitario Farmacéutico ante COFEPRIS.',
    sugerencia: 'Usa "zonas de tensión corporal", "fatiga física" o "rigidez muscular".'
  },
  {
    regex: /\b(insomnio|depresión|depresion|psiquiátrico)\b/i,
    motivo: 'Trastorno clínico sujeto a control médico.',
    sugerencia: 'Usa "favorece el descanso nocturno, la calma y la relajación".'
  },
  {
    regex: /\b(fármaco|farmaco|medicamento herbolario|medicina controlada)\b/i,
    motivo: 'Término exclusivo de insumos con clave SSA.',
    sugerencia: 'Usa "cosmético botánico artesanal" o "preparación herbolaria tradicional".'
  },
  {
    regex: /\b(fundación lazo|fundacion lazo|comuna 420)\b/i,
    motivo: 'Regla de Aislamiento: ningún nombre de A.C. o colectivo cívico debe aparecer en la etiqueta física.',
    sugerencia: 'Deja únicamente el nombre del taller artesanal o línea comercial.'
  }
];

export function auditarEtiqueta(datos = {}) {
  const textoCompleto = [
    datos.marca,
    datos.nombre,
    datos.generico,
    datos.dosis,
    datos.proposito,
    datos.modoUso,
    datos.elaborador
  ].filter(Boolean).join(' ');

  const alertas = [];

  for (const regla of PALABRAS_PROHIBIDAS) {
    if (regla.regex.test(textoCompleto)) {
      alertas.push({
        motivo: regla.motivo,
        sugerencia: regla.sugerencia
      });
    }
  }

  if (!/\b\d+(?:\.\d+)?\s*(g|ml)\b/.test(String(datos.contNeto || ''))) {
    alertas.push({
      motivo: 'NOM-030-SCFI (Contenido Neto):',
      sugerencia: 'Usa el símbolo oficial en minúsculas (ej. Cont. Neto: 50 g o 30 ml).'
    });
  }

  return {
    optimo: alertas.length === 0,
    alertas
  };
}

export function insertarIngredienteEnLista(actual = '', texto = '') {
  const limpio = String(actual || '').trim();
  const ing = String(texto || '').trim();
  if (!ing) return limpio;
  if (!limpio) return ing;
  if (limpio.endsWith('.')) {
    return `${limpio.slice(0, -1)}, ${ing}.`;
  }
  return `${limpio}, ${ing}`;
}

export function generarCodigoLote(nombreProducto = '', fecha = new Date()) {
  const aa = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const prefijo = String(nombreProducto || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5) || 'ART';
  return `PE420-ALV-${prefijo}-${aa}${mm}${dd}`;
}

export function sanitizarDatosEtiqueta(raw = {}) {
  const base = PRESETS.unguento;
  const categoria = ['topico', 'herbolario', 'comestible'].includes(raw.categoria)
    ? raw.categoria
    : base.categoria;
  const copiasNum = Number(raw.copias);
  const copias = [1, 3, 4].includes(copiasNum) ? copiasNum : 3;

  return {
    categoria,
    copias,
    marca: typeof raw.marca === 'string' ? raw.marca : base.marca,
    contNeto: typeof raw.contNeto === 'string' ? raw.contNeto : base.contNeto,
    nombre: typeof raw.nombre === 'string' ? raw.nombre : base.nombre,
    generico: typeof raw.generico === 'string' ? raw.generico : base.generico,
    dosis: typeof raw.dosis === 'string' ? raw.dosis : base.dosis,
    via: typeof raw.via === 'string' ? raw.via : base.via,
    proposito: typeof raw.proposito === 'string' ? raw.proposito : base.proposito,
    ingredientes: typeof raw.ingredientes === 'string' ? raw.ingredientes : base.ingredientes,
    modoUso: typeof raw.modoUso === 'string' ? raw.modoUso : base.modoUso,
    advertencias: typeof raw.advertencias === 'string' ? raw.advertencias : base.advertencias,
    lote: typeof raw.lote === 'string' ? raw.lote : base.lote,
    caducidad: typeof raw.caducidad === 'string' ? raw.caducidad : base.caducidad,
    elaborador: typeof raw.elaborador === 'string' ? raw.elaborador : base.elaborador
  };
}

export function esSubdominioEtiquetas(hostname = '') {
  return String(hostname || '').toLowerCase().startsWith('etkt420.');
}

// Cuando un visitante entra por etkt420.weedtown.social y decide iniciar sesión
// o registrarse, lo llevamos al dominio principal weedtown.social/login?next=/etiquetas
// para que al terminar el flujo quede en weedtown.social/etiquetas, donde vive
// su sesión (localStorage está aislado por origen en los navegadores).
export function urlLoginParaEtiquetas(hostname = '') {
  const h = String(hostname || '').toLowerCase();
  if (h === 'etkt420.weedtown.social') {
    return 'https://weedtown.social/login?next=%2Fetiquetas';
  }
  return '/login?next=%2Fetiquetas';
}

export function armarTextoPostEtiqueta(datos = {}) {
  const nombre = (datos.nombre || 'Producto Artesanal').trim();
  const marca = (datos.marca || 'Taller Artesanal').trim();
  const norma = NORMA_CORTA[datos.categoria] || 'NOM-141 + RRD';
  const auditoria = auditarEtiqueta(datos);
  const sello = auditoria.optimo
    ? '✅ Validada con Semáforo Regulatorio Óptimo'
    : '📋 En revisión técnica';

  return {
    content: `🏷️ Armé la etiqueta técnica de "${nombre}" (${marca}) en el Estudio de Etiquetado Artesanal & Reducción de Riesgos de WeedTown (${norma} · ${sello}).\n\nPruébalo en https://etkt420.weedtown.social 🌿🔒`,
    hashtags: 'PE420 EtiquetadoArtesanal ReduccionDeRiesgos WeedTown'
  };
}

// Utilidad interna de Canvas para partir párrafos largos por ancho máximo.
function envolverLineasCanvas(ctx, texto, maxWidth, maxLines = 6) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const lineas = [];
  let actual = palabras[0];

  for (let i = 1; i < palabras.length; i++) {
    const candidata = `${actual} ${palabras[i]}`;
    if (ctx.measureText(candidata).width <= maxWidth) {
      actual = candidata;
    } else {
      lineas.push(actual);
      actual = palabras[i];
      if (lineas.length >= maxLines - 1) {
        const resto = palabras.slice(i).join(' ');
        lineas.push(resto.length > 65 ? `${resto.slice(0, 62)}…` : resto);
        return lineas;
      }
    }
  }
  lineas.push(actual);
  return lineas.slice(0, maxLines);
}

function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Renderiza el par de etiquetas (Frente SPE + Reverso Técnico) en un PNG
// listo para subirse a POST /api/media/upload o descargarse localmente.
export async function renderizarEtiquetaPng(datos) {
  const d = sanitizarDatosEtiqueta(datos);
  const width = 1280;
  const height = 680;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fondo general crema
  ctx.fillStyle = '#faf6ec';
  ctx.fillRect(0, 0, width, height);

  // Barra superior de identidad WeedTown x PE420
  const grad = ctx.createLinearGradient(0, 0, width, 72);
  grad.addColorStop(0, '#072a20');
  grad.addColorStop(0.6, '#0d4f38');
  grad.addColorStop(1, '#128a5e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 68);
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(0, 68, width, 4);

  ctx.fillStyle = '#f0c869';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('WEEDTOWN.SOCIAL × PROTESTA ECONÓMICA 420 · ESTUDIO DE ETIQUETADO ARTESANAL & RRD', 28, 30);

  ctx.fillStyle = '#dff5ea';
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(BADGE_NORMA[d.categoria] || '', 28, 52);

  // Marco contenedor punteado
  ctx.save();
  ctx.strokeStyle = '#9aa8a0';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  rectRedondeado(ctx, 24, 92, width - 48, 536, 14);
  ctx.stroke();
  ctx.restore();

  // --- CARA FRONTAL (SPE - NOM-030) ---
  const fx = 42;
  const fy = 110;
  const fw = 430;
  const fh = 500;

  rectRedondeado(ctx, fx, fy, fw, fh, 14);
  ctx.fillStyle = '#0a0f0c';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d4a017';
  ctx.stroke();

  // Header frontal: marca + +18
  ctx.fillStyle = '#f0c869';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(d.marca.toUpperCase().slice(0, 28), fx + 22, fy + 38);

  rectRedondeado(ctx, fx + fw - 118, fy + 18, 96, 26, 6);
  ctx.fillStyle = '#c0563a';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('+18 ADULTO', fx + fw - 106, fy + 35);

  ctx.strokeStyle = 'rgba(240, 200, 105, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx + 22, fy + 54);
  ctx.lineTo(fx + fw - 22, fy + 54);
  ctx.stroke();

  // Centro frontal: nombre distintivo
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  const lineasNombre = envolverLineasCanvas(ctx, d.nombre.toUpperCase(), fw - 48, 3);
  let cursorF = fy + 130;
  lineasNombre.forEach((linea) => {
    const tw = ctx.measureText(linea).width;
    ctx.fillText(linea, fx + (fw - tw) / 2, cursorF);
    cursorF += 34;
  });

  // Denominación genérica
  ctx.fillStyle = '#3dbf8d';
  ctx.font = '600 15px system-ui, -apple-system, sans-serif';
  const lineasGen = envolverLineasCanvas(ctx, d.generico, fw - 52, 3);
  cursorF += 8;
  lineasGen.forEach((linea) => {
    const tw = ctx.measureText(linea).width;
    ctx.fillText(linea, fx + (fw - tw) / 2, cursorF);
    cursorF += 22;
  });

  // Caja de dosis / concentración
  const dosisBoxY = Math.max(cursorF + 14, fy + 290);
  rectRedondeado(ctx, fx + 24, dosisBoxY, fw - 48, 72, 8);
  ctx.fillStyle = 'rgba(212, 160, 23, 0.16)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d4a017';
  ctx.stroke();

  ctx.fillStyle = '#f0c869';
  ctx.font = '700 13.5px system-ui, -apple-system, sans-serif';
  const lineasDosis = envolverLineasCanvas(ctx, d.dosis, fw - 72, 2);
  let cursorDosis = dosisBoxY + 28;
  lineasDosis.forEach((linea) => {
    const tw = ctx.measureText(linea).width;
    ctx.fillText(linea, fx + (fw - tw) / 2, cursorDosis);
    cursorDosis += 20;
  });

  // Pie frontal: vía + contenido neto
  ctx.strokeStyle = 'rgba(240, 200, 105, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx + 22, fy + fh - 68);
  ctx.lineTo(fx + fw - 22, fy + fh - 68);
  ctx.stroke();

  rectRedondeado(ctx, fx + 22, fy + fh - 50, 200, 30, 5);
  ctx.fillStyle = '#0d4f38';
  ctx.fill();
  ctx.fillStyle = '#dff5ea';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillText(d.via.toUpperCase().slice(0, 24), fx + 32, fy + fh - 31);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 17px monospace';
  const netTxt = d.contNeto.slice(0, 24);
  const netW = ctx.measureText(netTxt).width;
  ctx.fillText(netTxt, fx + fw - 22 - netW, fy + fh - 30);

  // --- CARA POSTERIOR / LATERAL (PANEL TÉCNICO) ---
  const bx = fx + fw + 24;
  const by = fy;
  const bw = width - bx - 42;
  const bh = fh;

  rectRedondeado(ctx, bx, by, bw, bh, 14);
  ctx.fillStyle = '#faf6ec';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#16211c';
  ctx.stroke();

  // Header reverso
  ctx.fillStyle = '#16211c';
  ctx.font = '800 13.5px system-ui, -apple-system, sans-serif';
  ctx.fillText('INFORMACIÓN TÉCNICA Y DE REDUCCIÓN DE RIESGOS', bx + 20, by + 32);
  const exTxt = 'EXCLUSIVO +18 AÑOS';
  const exW = ctx.measureText(exTxt).width;
  ctx.fillText(exTxt, bx + bw - 20 - exW, by + 32);

  ctx.beginPath();
  ctx.moveTo(bx + 20, by + 42);
  ctx.lineTo(bx + bw - 20, by + 42);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#16211c';
  ctx.stroke();

  let cursorB = by + 66;
  const innerW = bw - 40;

  const pintarSeccion = (titulo, contenido, maxLineas) => {
    ctx.fillStyle = '#072a20';
    ctx.font = '800 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(titulo, bx + 20, cursorB);
    cursorB += 17;

    ctx.fillStyle = '#16211c';
    ctx.font = '400 12.5px system-ui, -apple-system, sans-serif';
    const lineas = envolverLineasCanvas(ctx, contenido, innerW, maxLineas);
    lineas.forEach((l) => {
      ctx.fillText(l, bx + 20, cursorB);
      cursorB += 17;
    });
    cursorB += 7;
  };

  pintarSeccion('DESCRIPCIÓN:', d.proposito, 3);
  pintarSeccion('INGREDIENTES (NOMENCLATURA BOTÁNICA / INCI):', d.ingredientes, 4);
  pintarSeccion('MODO DE EMPLEO Y USO RESPONSABLE (RRD):', d.modoUso, 3);

  // Caja de advertencias sanitarias
  const warnH = 92;
  rectRedondeado(ctx, bx + 20, cursorB, innerW, warnH, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#16211c';
  ctx.stroke();

  ctx.fillStyle = '#a8442b';
  ctx.fillRect(bx + 20, cursorB, 6, warnH);

  ctx.fillStyle = '#7a2f1c';
  ctx.font = '800 11.5px system-ui, -apple-system, sans-serif';
  ctx.fillText('⚠️ PRECAUCIONES Y ADVERTENCIAS SANITARIAS (+18):', bx + 34, cursorB + 20);

  ctx.fillStyle = '#16211c';
  ctx.font = '400 11.5px system-ui, -apple-system, sans-serif';
  const lineasAdv = envolverLineasCanvas(ctx, d.advertencias, innerW - 26, 3);
  let cursorAdv = cursorB + 38;
  lineasAdv.forEach((l) => {
    ctx.fillText(l, bx + 34, cursorAdv);
    cursorAdv += 16;
  });

  // Footer reverso
  ctx.strokeStyle = '#35443c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + 20, by + bh - 56);
  ctx.lineTo(bx + bw - 20, by + bh - 56);
  ctx.stroke();

  ctx.fillStyle = '#35443c';
  ctx.font = '600 11.5px system-ui, -apple-system, sans-serif';
  ctx.fillText(d.elaborador.slice(0, 62), bx + 20, by + bh - 34);
  ctx.font = '400 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('Consérvese bien cerrado en lugar fresco, seco y oscuro.', bx + 20, by + bh - 16);

  ctx.fillStyle = '#16211c';
  ctx.font = '700 12px monospace';
  const loteTxt = `LOTE: ${d.lote.slice(0, 26)}`;
  const cadTxt = `CAD / CONS. PREF.: ${d.caducidad.slice(0, 14)}`;
  ctx.fillText(loteTxt, bx + bw - 20 - ctx.measureText(loteTxt).width, by + bh - 34);
  ctx.fillText(cadTxt, bx + bw - 20 - ctx.measureText(cadTxt).width, by + bh - 16);

  // Pie inferior del lienzo
  ctx.fillStyle = '#5a6b62';
  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('etkt420.weedtown.social · Herramienta de Autogestión y Reducción de Riesgos para Productores Artesanales', 28, height - 20);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], `etiqueta_${(d.lote || 'pe420').toLowerCase()}.png`, { type: 'image/png' });

  return { file, dataUrl };
}
