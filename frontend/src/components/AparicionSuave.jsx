import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { usePrefiereMenosMovimiento, DURACION } from '../lib/movimiento';

// Algo NUEVO que entra a una lista ya pintada (ciclo 9E): el posteo que acabas
// de publicar, el comentario que acabas de responder.
//
// Solo `opacity` y `transform`: las dos únicas propiedades que el navegador
// compone en la GPU sin recalcular el layout. Animar `height`, `top` o
// `margin` obligaría a recalcular la posición de todo lo que está debajo en
// cada fotograma — que en un celular de gama media se ve como un tirón, justo
// en el momento en que la persona está mirando.
//
// Por lo mismo el desplazamiento es de 8 px y no de 40: la tarjeta ya ocupa su
// lugar definitivo desde el primer fotograma, así que nada de lo que está
// abajo se mueve. No hay salto de layout que amortiguar porque no hay salto.
//
// `activo` existe para animar SOLO lo recién llegado. Sin él, cada vez que la
// lista se re-renderiza (cambiar de página, buscar, recibir una actualización)
// se animaría todo, que es el error clásico: convierte una respuesta a lo que
// hiciste en un parpadeo permanente de la pantalla.
const AparicionSuave = ({ children, activo = true, desplazamiento = -8, ...resto }) => {
  const menosMovimiento = usePrefiereMenosMovimiento();
  const animar = activo && !menosMovimiento;

  // Con `animar` en falso, `listo` ARRANCA en true y el `sx` sale vacío: no
  // hay un primer fotograma en opacity 0 que se alcance a ver como parpadeo,
  // ni una transición que neutralizar después. Es la diferencia entre "no se
  // anima" y "se anima muy rápido", y con movimiento reducido solo la primera
  // es aceptable.
  const [listo, setListo] = useState(!animar);

  useEffect(() => {
    if (!animar) {
      setListo(true);
      return undefined;
    }
    // Un fotograma de espera: si se pintara el estado final en el mismo
    // fotograma que el inicial, el navegador colapsa los dos y no hay
    // transición que interpolar.
    const cuadro = requestAnimationFrame(() => setListo(true));
    // Respaldo obligatorio, no cinturón de más: `requestAnimationFrame` NO SE
    // DISPARA en una pestaña que no está pintando (en segundo plano, o
    // minimizada). Sin esto, publicar y cambiar de pestaña deja la tarjeta
    // colgada en `opacity: 0` — presente en el DOM, ocupando su lugar, pero
    // invisible: se ve como un posteo que se perdió. Lo encontré porque el
    // navegador de las pruebas tampoco compone fotogramas con el panel oculto.
    const respaldo = setTimeout(() => setListo(true), 80);
    return () => { cancelAnimationFrame(cuadro); clearTimeout(respaldo); };
  }, [animar]);

  return (
    <Box
      {...resto}
      sx={animar ? {
        opacity: listo ? 1 : 0,
        transform: listo ? 'none' : `translateY(${desplazamiento}px)`,
        transition: `opacity ${DURACION.entrada}ms ease-out, transform ${DURACION.entrada}ms ease-out`
      } : undefined}
    >
      {children}
    </Box>
  );
};

export default AparicionSuave;
