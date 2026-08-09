#!/usr/bin/env node
// GUI local para el respaldo. Levanta una página en tu navegador donde eliges
// base y tablas con clics, en vez de recordar banderas.
//
//   npm run respaldo:gui
//
// POR QUÉ HAY UN SERVIDOR Y NO SOLO UN HTML. Una página no puede hablarle a
// Postgres: no hay forma de hacer esto con un archivo suelto como el
// `avatar-convertidor.html`. Lo mínimo es un proceso local que la sirva y que
// pueda lanzar el respaldo.
//
// LA DECISIÓN QUE ORDENA TODO EL ARCHIVO: **esta GUI no respalda nada.**
// Arma los argumentos y lanza `scripts/respaldo.js` como proceso hijo. Así las
// guardias —base equivocada, parcial de producción, destino dentro del repo,
// dependencias rotas, tabla nueva sin registrar— se aplican idénticas desde la
// terminal y desde el navegador, porque son literalmente el mismo código. Una
// GUI que reimplementara el respaldo sería una segunda versión con sus propios
// huecos, y el hueco aparecería justo el día de una recuperación.
//
// SEGURIDAD, porque esto puede volcar la base de producción a disco:
//   · Escucha SOLO en 127.0.0.1. No es alcanzable desde la red.
//   · Exige un token aleatorio que se imprime en la terminal al arrancar. Sin
//     él, cualquier página web abierta en el mismo navegador podría pedirle un
//     respaldo a localhost y la víctima no se enteraría.
//   · No se despliega, no se importa desde `src/`, y muere con la terminal.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { MODELOS, GRUPOS, DEPENDE_DE } = require('./lib/respaldo-tablas');

const PUERTO = Number(process.env.RESPALDO_GUI_PORT) || 4300;
const TOKEN = crypto.randomBytes(16).toString('hex');
const RAIZ = path.join(__dirname, '..');
const HTML = path.join(__dirname, 'respaldo-gui.html');

// Qué bases hay configuradas, para que la pantalla las muestre con su project
// ref. Es lo único que distingue producción de desarrollo: todos los proyectos
// de Supabase de una región comparten hostname.
function describir(cadena) {
  if (!cadena) return null;
  try {
    const u = new URL(cadena);
    return {
      proyecto: u.username.split('.')[1] || '(sin project-ref)',
      host: u.hostname,
      puerto: u.port || '5432',
      schema: u.searchParams.get('schema') || 'public'
    };
  } catch { return null; }
}

function basesDisponibles() {
  const rutaProd = path.join(RAIZ, '.env.produccion');
  let prod = null;
  if (fs.existsSync(rutaProd)) {
    const parsed = require('dotenv').config({ path: rutaProd, processEnv: {} }).parsed || {};
    prod = describir(parsed.RESPALDO_DATABASE_URL);
  }
  return {
    dev: describir(process.env.DATABASE_URL),
    produccion: prod,
    hayArchivoProduccion: fs.existsSync(rutaProd)
  };
}

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(cuerpo));
};

const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PUERTO}`);

  // El token va en todas las rutas, incluida la del HTML: sin esto, una página
  // cualquiera podría cargar la GUI en un iframe y actuar por ti.
  if (u.searchParams.get('t') !== TOKEN) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Token inválido. Abre la URL que imprimió la terminal.');
  }
  // Ninguna respuesta debe quedar en caché ni embeberse en otra página.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');

  if (u.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(HTML, 'utf8').replace('__TOKEN__', TOKEN));
  }

  if (u.pathname === '/api/info') {
    return json(res, 200, {
      modelos: MODELOS, grupos: GRUPOS, dependeDe: DEPENDE_DE,
      bases: basesDisponibles(),
      destinoSugerido: process.env.RESPALDO_DESTINO || ''
    });
  }

  // Lista lo que ya hay en la carpeta, para saber de cuándo es el último
  // respaldo sin salir a buscarlo al explorador.
  if (u.pathname === '/api/archivos') {
    const dir = u.searchParams.get('destino');
    if (!dir || !fs.existsSync(dir)) return json(res, 200, { archivos: [] });
    const archivos = fs.readdirSync(dir)
      .filter(f => f.startsWith('weedtown-') && f.endsWith('.json'))
      .map(f => {
        const st = fs.statSync(path.join(dir, f));
        return { nombre: f, mb: +(st.size / 1048576).toFixed(2), fecha: st.mtime.toISOString(), parcial: f.includes('-parcial') };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    return json(res, 200, { archivos });
  }

  if (u.pathname === '/api/respaldo' && req.method === 'POST') {
    let cuerpo = '';
    req.on('data', c => { cuerpo += c; if (cuerpo.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let p;
      try { p = JSON.parse(cuerpo); } catch { return json(res, 400, { error: 'JSON inválido' }); }

      // Los argumentos se arman aquí y se pasan como ARREGLO a spawn, nunca
      // como cadena a un shell: así un destino con espacios o comillas es un
      // argumento y no una oportunidad de inyectar un comando.
      const args = ['scripts/respaldo.js'];
      if (p.base === 'produccion' || p.base === 'dev') args.push('--base', p.base);
      else return json(res, 400, { error: 'base inválida' });
      if (!p.destino) return json(res, 400, { error: 'falta destino' });
      args.push('--destino', String(p.destino));

      // Solo se dejan pasar nombres que estén en la lista. Lo que llegue del
      // navegador no decide qué se lee de la base.
      const limpias = (Array.isArray(p.tablas) ? p.tablas : []).filter(t => MODELOS.includes(t));
      if (limpias.length && limpias.length < MODELOS.length) {
        args.push('--solo', limpias.join(','));
        args.push('--acepto-parcial');
      }

      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
      const hijo = spawn(process.execPath, args, { cwd: RAIZ });
      hijo.stdout.on('data', d => res.write(d));
      hijo.stderr.on('data', d => res.write(d));
      hijo.on('close', code => { res.write(`\n__FIN__${code}`); res.end(); });
    });
    return;
  }

  res.writeHead(404); res.end();
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PUERTO}/?t=${TOKEN}`;
  console.log('\n  GUI de respaldo de WeedTown');
  console.log('  Solo en 127.0.0.1, con token de un solo arranque.\n');
  console.log(`  ${url}\n`);
  console.log('  Ctrl+C para cerrar.\n');
});
