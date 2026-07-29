// Envío del correo con el enlace mágico.
//
// Mismo patrón de driver intercambiable que src/lib/storage.js:
//   log     — imprime el enlace en la consola del backend. Es el default:
//             funciona sin credenciales, así que el flujo se puede probar en
//             desarrollo, CI y las pruebas de integración sin darle nada a
//             nadie. NO envía correo de verdad.
//   resend  — API REST de Resend (https://resend.com) vía fetch, sin SDK,
//             igual que el driver de Supabase Storage. USAR EN PRODUCCIÓN.
//
// Agregar otro proveedor (SendGrid, SES, SMTP) es un objeto más con el mismo
// contrato: enviarEnlaceMagico(email, url) -> void, lanza si no se pudo enviar.
const DRIVER = (process.env.MAIL_DRIVER || 'log').toLowerCase();

const log = {
  nombre: 'log',
  async enviarEnlaceMagico(email, url) {
    console.log(`[mailer:log] Enlace de acceso para ${email} → ${url}`);
  }
};

const resend = {
  nombre: 'resend',

  async enviarEnlaceMagico(email, url) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('MAIL_DRIVER=resend requiere RESEND_API_KEY en el entorno');
    }
    // onboarding@resend.dev funciona sin dominio propio verificado, pero
    // Resend solo deja mandarlo a la cuenta dueña de la API key: sirve para
    // probar, no para producción. Ahí hay que verificar un dominio y usar
    // RESEND_FROM con un remitente de ese dominio.
    const from = process.env.RESEND_FROM || 'WeedTown <onboarding@resend.dev>';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Tu enlace para entrar a WeedTown',
        text:
          `Entra a WeedTown con este enlace (caduca en 15 minutos y solo funciona una vez):\n\n${url}\n\n` +
          'Si tú no lo pediste, ignora este correo — no pasó nada.',
        html:
          `<p>Entra a WeedTown con este enlace (caduca en 15 minutos y solo funciona una vez):</p>` +
          `<p><a href="${url}">${url}</a></p>` +
          `<p>Si tú no lo pediste, ignora este correo — no pasó nada.</p>`
      })
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error(`Resend respondió ${res.status} al enviar el correo: ${detalle}`);
    }
  }
};

const drivers = { log, resend };
const driver = drivers[DRIVER];
if (!driver) {
  throw new Error(`MAIL_DRIVER desconocido: "${DRIVER}". Usa "log" o "resend".`);
}

/**
 * Manda el correo con el enlace de acceso. Lanza si no se pudo confirmar el
 * envío — a diferencia de otras rutas de esta app, aquí sí hay que enterarse:
 * si el correo no sale, la persona se queda sin forma de entrar.
 * @param {string} email
 * @param {string} url
 */
const enviarEnlaceMagico = (email, url) => driver.enviarEnlaceMagico(email, url);

module.exports = { enviarEnlaceMagico, driver: driver.nombre };
