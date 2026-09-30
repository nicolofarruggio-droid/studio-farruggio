// Gateway locale che imita l'indirizzo unico di Supabase (http://127.0.0.1:54321):
//   /auth/v1/*   -> GoTrue (autenticazione) su 127.0.0.1:9999
//   /modelli/*   -> modelli delle email di Supabase Auth (supabase/templates)
// Solo per sviluppo e test in locale senza Docker. Con `supabase start` non serve.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PORTA = Number(process.env.GATEWAY_PORT ?? 54321)
const GOTRUE = process.env.GOTRUE_URL ?? 'http://127.0.0.1:9999'
const MODELLI = path.resolve(import.meta.dirname, '../../supabase/templates')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname.startsWith('/modelli/')) {
    const nome = path.basename(url.pathname)
    try {
      const testo = await readFile(path.join(MODELLI, nome))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(testo)
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  if (url.pathname.startsWith('/auth/v1')) {
    const destinazione = new URL(url.pathname.slice('/auth/v1'.length) + url.search, GOTRUE)
    const headers = { ...req.headers, host: destinazione.host }
    const inoltro = http.request(destinazione, { method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers)
      r.pipe(res)
    })
    inoltro.on('error', () => {
      res.writeHead(502)
      res.end('GoTrue non raggiungibile')
    })
    return req.pipe(inoltro)
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORTA, '127.0.0.1', () => console.log(`Gateway Supabase locale su http://127.0.0.1:${PORTA}`))
