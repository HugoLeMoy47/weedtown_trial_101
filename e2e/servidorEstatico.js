// Sirve `frontend/build` con fallback de SPA. Veinte líneas en vez de una
// dependencia nueva.
//
// Se usa SOLO en CI (ciclo 12A). En local el ciclo E2E sigue levantando el
// servidor de desarrollo de react-scripts, que da recarga en caliente y es lo
// que uno quiere mientras escribe una spec.
//
// POR QUÉ COMPILADO EN CI, y no el servidor de desarrollo:
//   · Es lo que de verdad se despliega. El servidor de desarrollo sirve otro
//     HTML, con otro manejo de rutas, y una spec puede pasar ahí y fallar en
//     producción.
//   · El servidor de desarrollo de CRA tarda en compilar y a veces se queda
//     colgado en runners sin TTY. Un job E2E intermitente se termina
//     ignorando, y un CI que nadie mira es peor que no tenerlo.
//
// El fallback es lo único con miga: cualquier ruta que no sea un archivo
// existente devuelve index.html, porque las rutas del SPA (/@handle, /p/:id,
// /forum/:slug) no son archivos. Es lo mismo que hace `not_found_handling` en
// wrangler.jsonc; el Worker de las fichas no participa aquí.
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'frontend', 'build');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function crearServidor() {
  return http.createServer((req, res) => {
    const limpio = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // `path.normalize` + el guard de abajo evitan que `..` salga de build/.
    let archivo = path.join(RAIZ, path.normalize(limpio));
    if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      archivo = path.join(RAIZ, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
}

module.exports = { crearServidor, RAIZ };

// Como proceso suelto: node servidorEstatico.js <puerto>
if (require.main === module) {
  const puerto = Number(process.argv[2]) || 3021;
  if (!fs.existsSync(path.join(RAIZ, 'index.html'))) {
    console.error(`✗ No existe ${RAIZ}/index.html. Corre \`npm run build\` en frontend/ primero.`);
    process.exit(1);
  }
  crearServidor().listen(puerto, () => console.log(`  frontend compilado en http://localhost:${puerto}`));
}
