// Manifiesto de imágenes de campaña (HU-SHR-003 / HU-CAM-001-002, ciclo 7B).
//
// Vive en el BACKEND, no en el frontend ni en un JSON suelto en /public: es
// el backend quien elige la imagen de forma DETERMINISTA por `id` del posteo
// (`id % N`, ver preview.js) para que la misma URL compartida siempre
// resuelva a la misma ficha, así que necesita conocer el pool completo. El
// archivo en sí solo declara datos — la selección y el armado de la URL
// absoluta viven en preview.js, mismo criterio que moderation.js (datos y
// reglas) separado de las rutas (orquestación).
//
// Los ARCHIVOS reales son trabajo de diseño, no de este ciclo (ver
// .planeacion/2026-08-05_campania_invitacion_briefs.md): las 8 entradas de
// campaña quedan con `activo: false` hasta que el archivo exista de verdad en
// frontend/public/campaign/ (y por lo tanto en el build servido por
// Cloudflare). Mientras tanto, la única entrada activa es el marcador de
// posición genérico — así el pool nunca queda vacío y `imagen` de la ficha
// nunca sale sin valor (criterio de aceptación de HU-SHR-003).
//
// Rotar la campaña es EDITAR ESTE ARCHIVO (activar entradas, versionar el
// nombre v1 -> v2 al reemplazar una pieza), nunca sortear en tiempo de
// petición (T6 del plan): las redes cachean la ficha por URL durante días o
// semanas, así que una imagen distinta en cada expansión no produce rotación
// visible — produce que el mismo enlace se vea distinto según quién lo
// expandió primero, y vuelve irreproducible cualquier reporte de "se ve mal".
//
// Los archivos se sirven desde weedtown.social (Cloudflare Workers Static
// Assets), nunca desde Render — así la imagen de la ficha no depende de que
// el backend esté despierto (ver Trampa T8 / HU-SHR-002). preview.js arma la
// URL absoluta anteponiendo FRONTEND_URL a `archivo`.

// Las 8 piezas del brief de campaña. `archivo` seguirá viviendo bajo
// frontend/public/campaign/ cuando exista — el nombre versionado
// (`concepto-NN-v1.jpg`) es el que el brief pide para no invalidar el caché
// de las redes al reemplazar una pieza sin cambiar el nombre.
const ENTRADAS = [
  { archivo: 'campaign/concepto-01-v1.jpg', alt: 'Cartel de una llave hecha de tinta que se disuelve en el papel', concepto: '01-sin-contrasena-sin-correo', activo: false },
  { archivo: 'campaign/concepto-02-v1.jpg', alt: 'Máscara de lucha libre estilizada, hecha de formas planas', concepto: '02-tu-seudonimo-es-suficiente', activo: false },
  { archivo: 'campaign/concepto-03-v1.jpg', alt: 'Un muro de ladrillo grabado que corta el cartel en dos, con una figura del otro lado', concepto: '03-bloquear-es-inmediato-y-silencioso', activo: false },
  { archivo: 'campaign/concepto-04-v1.jpg', alt: 'Cámara grabada de la que caen coordenadas que se desintegran', concepto: '04-tus-fotos-no-llevan-tu-ubicacion', activo: false },
  { archivo: 'campaign/concepto-05-v1.jpg', alt: 'Mapa grabado con cuadrícula gruesa donde las zonas brillan sin marcar puntos', concepto: '05-cerca-pero-no-tanto', activo: false },
  { archivo: 'campaign/concepto-06-v1.jpg', alt: 'Círculo de manos grabadas sosteniendo un mismo objeto', concepto: '06-la-comunidad-se-autorregula', activo: false },
  { archivo: 'campaign/concepto-07-v1.jpg', alt: 'Cartel de una planta creciendo entre las grietas de una banqueta', concepto: '07-sin-estigma', activo: false },
  { archivo: 'campaign/concepto-08-v1.jpg', alt: 'Puerta abierta grabada con una maleta saliendo, luz cálida del otro lado', concepto: '08-puedes-irte-con-todo', activo: false },
  // Marcador de posición ACTIVO mientras las 8 piezas de arriba no existan.
  // Generado por script (rectángulo sólido con el verde del tema, sin texto
  // ni IA) — no es una pieza de campaña, es infraestructura para que el
  // sistema funcione de punta a punta. Se apaga (`activo: false`) el día que
  // la primera pieza real entre al pool.
  { archivo: 'campaign/placeholder-default.png', alt: 'WeedTown — la red social de la comunidad cannábica de México', concepto: 'placeholder-generico', activo: true }
];

// Fallback absoluto: si el manifiesto quedara vacío o con datos corruptos
// (`ENTRADAS` sin ninguna activa), esto es lo que evita un `og:image` vacío.
// Apunta al mismo archivo que la entrada placeholder de arriba a propósito.
const IMAGEN_POR_DEFECTO = { archivo: 'campaign/placeholder-default.png', alt: 'WeedTown — la red social de la comunidad cannábica de México' };

module.exports = { ENTRADAS, IMAGEN_POR_DEFECTO };
