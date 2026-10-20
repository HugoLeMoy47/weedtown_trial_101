// Versión vigente de los Términos y la Política de Privacidad (ciclo 19.5).
//
// POR QUÉ EXISTE. El alta pide marcar «soy mayor de 18 y acepto los Términos»,
// pero hasta el 19 nada guardaba cuándo ni cuál versión aceptó cada persona.
// Cambiar los Términos no dejaba forma de saber quién había aceptado cuál, y
// la medición de actividad (19A) y los avisos por correo (ciclo 20) son
// precisamente el tipo de cambio que exige poder responder esa pregunta.
//
// LA VERSIÓN ES LA FECHA en que se publicó el texto, 'AAAA-MM-DD'. No es un
// número que alguien tenga que acordarse de subir: es el día del cambio, y
// subirla es lo que vuelve a pedirle aceptación a todo el mundo. **Cámbiala
// SOLO cuando cambie el texto de Terms.jsx, y siempre en el mismo commit.**
//
// Vive DOS veces (aquí y en frontend/src/lib/terminos.js), igual que la
// cuadrícula de Cerca: el navegador necesita saberla para pintar el aviso y el
// servidor para validar lo que le llega. `terminosAceptacion.test.js` lee el
// archivo real del frontend y falla si divergen.
const TERMINOS_VIGENTES = '2026-10-20';

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

module.exports = { TERMINOS_VIGENTES, FORMATO };
