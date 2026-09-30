import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { ADMIN, ADMIN_B } from './aiuti'

// Criterio di accettazione (sezione 15): account agente in sola lettura, lettura via API, azioni riconoscibili,
// scrittura solo se abilitata, nessun accesso ad altri studi e nessuna azione vietata.
const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/bigbrother', { max: 1, onnotice: () => {} })

async function comeAdmin<T>(email: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  const [u] = await sql<{ id: string }[]>`select id from public.utenti where email = ${email}`
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: u.id, email, role: 'authenticated' })}, true), set_config('role', 'authenticated', true), set_config('app.canale', 'server', true)`
    return fn(tx)
  }) as Promise<T>
}

async function nuovoAgente(emailAdmin: string, permessi: Record<string, string>) {
  const id = randomUUID()
  const token = `bbs_${randomBytes(32).toString('base64url')}`
  await comeAdmin(emailAdmin, async (tx) => {
    await tx`select public.crea_agente(${'Agente e2e ' + id.slice(0, 6)}, 'prova automatica', ${id})`
    await tx`select public.imposta_permessi_agente(${id}, ${tx.json(permessi)})`
    await tx`select public.crea_token_agente(${id}, 'e2e', ${createHash('sha256').update(token).digest('hex')}, ${token.slice(0, 8)}, 1)`
  })
  return { id, token }
}

test.afterAll(async () => {
  await sql.end()
})

test('agente in sola lettura: legge, non scrive, non vede altri studi', async ({ request }) => {
  const { token } = await nuovoAgente(ADMIN, {})
  const h = { Authorization: `Bearer ${token}` }
  const me = await request.get('/api/v1/me', { headers: h })
  expect(me.status()).toBe(200)
  const clienti = await request.get('/api/v1/clienti?ritardo=qualsiasi', { headers: h })
  expect(clienti.status()).toBe(200)
  const { dati } = (await clienti.json()) as { dati: { id: string; ragione_sociale: string }[] }
  expect(dati.length).toBeGreaterThan(0)
  const compiti = await request.get('/api/v1/compiti', { headers: h })
  expect(compiti.status()).toBe(200)

  const [collab] = await sql<{ id: string }[]>`select id from public.utenti where email = 'giulia.verdi@studio-demo.it'`
  const crea = await request.post('/api/v1/compiti', { headers: h, data: { titolo: 'Non dovrebbe esistere', assegnatari: [collab.id] } })
  expect(crea.status()).toBe(403)
  expect((await crea.json()).errore?.messaggio ?? JSON.stringify(await crea.json())).toBeTruthy()

  // i clienti di un altro studio non esistono per questo agente
  const [altro] = await sql<{ id: string }[]>`select c.id from public.clienti c join public.studi s on s.id = c.studio_id where s.nome = 'Studio Bianchi (demo)' limit 1`
  expect((await request.get(`/api/v1/clienti/${altro.id}`, { headers: h })).status()).toBe(404)
  expect((await request.get('/api/v1/me')).status()).toBe(401)
})

test('agente abilitato: crea un compito, carica un documento, l\'azione è registrata come agente', async ({ request }) => {
  const { id: agente, token } = await nuovoAgente(ADMIN, { crea_compiti: 'si', carica_documenti: 'si' })
  const h = { Authorization: `Bearer ${token}` }
  const [collab] = await sql<{ id: string }[]>`select id from public.utenti where email = 'giulia.verdi@studio-demo.it'`
  const crea = await request.post('/api/v1/compiti', { headers: h, data: { titolo: 'Riepilogo ritardi (agente e2e)', assegnatari: [collab.id] } })
  expect(crea.status()).toBe(201)
  const compito = (await crea.json()) as { id: string }

  const carica = await request.post(`/api/v1/compiti/${compito.id}/documenti`, {
    headers: h,
    multipart: { file: { name: 'riepilogo.csv', mimeType: 'text/csv', buffer: Buffer.from('cliente;ritardo\nPizzeria;IVA\n') } },
  })
  expect(carica.status()).toBe(201)
  const { dati } = (await carica.json()) as { dati: { id: string }[] }
  const link = await request.get(`/api/v1/compiti/${compito.id}/documenti/${dati[0].id}?modo=scarica`, { headers: h })
  expect(link.status()).toBe(200)
  expect(((await link.json()) as { url: string }).url).toMatch(/^http/)

  const registro = await sql<{ attore_ruolo: string }[]>`select attore_ruolo from public.registro_attivita where attore_id = ${agente}`
  expect(registro.map((r) => r.attore_ruolo)).toContain('agente')
  const [k] = await sql<{ ruolo: string }[]>`select u.ruolo from public.compiti c join public.utenti u on u.id = c.creato_da where c.id = ${compito.id}`
  expect(k.ruolo).toBe('agente')
})

test('modalità proposta: l\'agente mette in coda, l\'azione non avviene finché un admin non approva', async ({ request }) => {
  const { token } = await nuovoAgente(ADMIN_B, { crea_compiti: 'proposta' })
  const [collab] = await sql<{ id: string }[]>`select id from public.utenti where email = 'luca.testa@bianchi-demo.it'`
  const r = await request.post('/api/v1/compiti', {
    headers: { Authorization: `Bearer ${token}` },
    data: { titolo: 'Proposta e2e', assegnatari: [collab.id] },
  })
  expect(r.status()).toBe(202)
  const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.compiti where titolo = 'Proposta e2e'`
  expect(n.n).toBe(0)
})
