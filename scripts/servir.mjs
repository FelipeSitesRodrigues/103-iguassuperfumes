/**
 * Servidor local do site (site/dist), imitando a Vercel: endereço sem .html
 * (cleanUrls) e 404.html pro que não existe.
 *
 *   node scripts/servir.mjs [pasta] [porta]      (padrão site/dist 8765)
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createGzip } from 'node:zlib'
import path from 'node:path'

const DIST = path.resolve(process.argv[2] ?? 'site/dist')
const PORTA = Number(process.argv[3] ?? 8765)
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function arquivoDe(caminho) {
  const limpo = path.normalize(decodeURIComponent(caminho)).replace(/^([/\\])+/, '')
  const alvo = path.join(DIST, limpo)
  if (!alvo.startsWith(DIST)) return null
  for (const tentativa of [alvo, `${alvo}.html`, path.join(alvo, 'index.html')]) {
    if (existsSync(tentativa) && statSync(tentativa).isFile()) return tentativa
  }
  return null
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`)

  const arquivo = arquivoDe(url.pathname)
  if (!arquivo) {
    res.writeHead(404, { 'Content-Type': TIPOS['.html'] })
    const pagina404 = path.join(DIST, '404.html')
    return existsSync(pagina404) ? createReadStream(pagina404).pipe(res) : res.end('404')
  }
  const tipo = TIPOS[path.extname(arquivo)] ?? 'application/octet-stream'
  // comprime texto como a Vercel faz, pra o Lighthouse local medir o peso real
  if (/text|json|javascript|xml|svg/.test(tipo) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Cache-Control': 'no-cache' })
    return createReadStream(arquivo).pipe(createGzip()).pipe(res)
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' })
  createReadStream(arquivo).pipe(res)
}).listen(PORTA, () => console.log(`Site em http://localhost:${PORTA}`))
