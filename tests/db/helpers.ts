// Test di isolamento e permessi: Postgres in memoria (PGlite) con le migrazioni vere
// e un'imitazione minima dell'autenticazione di Supabase (supabase-mock.sql).
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

export type Tx = Transaction
export type Persona = { id: string; email: string }

const radice = path.resolve(__dirname, '../..')
const mock = readFileSync(path.join(radice, 'tests/db/supabase-mock.sql'), 'utf8')
const cartellaMigrazioni = path.join(radice, 'supabase/migrations')
const migrazioni = readdirSync(cartellaMigrazioni)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(path.join(cartellaMigrazioni, f), 'utf8'))

let modello: Promise<PGlite> | null = null

/** Database nuovo con le migrazioni applicate (clonato da un modello per andare più veloci). */
export async function nuovoDb(): Promise<PGlite> {
  modello ??= (async () => {
    const db = new PGlite()
    await db.exec(mock)
    for (const sql of migrazioni) await db.exec(sql)
    return db
  })()
  return (await (await modello).clone()) as PGlite
}

/** Esegue fn come l'utente indicato: ruolo `authenticated` e claims come nel JWT di Supabase. */
export async function come<T>(db: PGlite, persona: Persona, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: persona.id, email: persona.email, role: 'authenticated' }),
    ])
    await tx.exec('set local role authenticated')
    return fn(tx)
  })
}

export async function righe<T = Record<string, unknown>>(tx: Tx | PGlite, sql: string, params: unknown[] = []) {
  const r = await tx.query<T>(sql, params)
  return r.rows
}

export const hash = (s: string) => createHash('sha256').update(s).digest('hex')

export type Studio = {
  id: string
  admin: Persona
  c1: Persona
  c2: Persona
  c3: Persona
  clienti: { id: string; nome: string; referente: string }[]
}

/** Crea uno studio con 1 admin, 3 collaboratori e 6 clienti (2 per collaboratore). Come superuser. */
export async function creaStudio(db: PGlite, nome: string): Promise<Studio> {
  const id = randomUUID()
  await db.query(`insert into public.studi (id, nome) values ($1, $2)`, [id, nome])
  const persona = async (n: string, ruolo: string): Promise<Persona> => {
    const p = { id: randomUUID(), email: `${n}.${id.slice(0, 8)}@esempio.it` }
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [p.id, p.email])
    await db.query(
      `insert into public.utenti (id, studio_id, nome, cognome, email, ruolo) values ($1, $2, $3, 'Prova', $4, $5)`,
      [p.id, id, n, p.email, ruolo],
    )
    return p
  }
  const admin = await persona('admin', 'admin')
  const c1 = await persona('uno', 'collaboratore')
  const c2 = await persona('due', 'collaboratore')
  const c3 = await persona('tre', 'collaboratore')
  const clienti: Studio['clienti'] = []
  for (const [i, ref] of [c1, c1, c2, c2, c3, c3].entries()) {
    const cid = randomUUID()
    const nomeCliente = `${nome} Cliente ${i + 1}`
    await db.query(
      `insert into public.clienti (id, studio_id, ragione_sociale, nome_visualizzazione) values ($1, $2, $3, $3)`,
      [cid, id, nomeCliente],
    )
    await db.query(
      `insert into public.assegnazioni (studio_id, cliente_id, utente_id, referente_principale) values ($1, $2, $3, true)`,
      [id, cid, ref.id],
    )
    await db.query(
      `insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id)
       values ($1, $2, now(), 'telefono', 'Chiamata di prova', 'manuale', $3)`,
      [id, cid, ref.id],
    )
    clienti.push({ id: cid, nome: nomeCliente, referente: ref.id })
  }
  return { id, admin, c1, c2, c3, clienti }
}

export async function impostaStudio(db: PGlite, studio: string, campi: Record<string, unknown>) {
  const chiavi = Object.keys(campi)
  const set = chiavi.map((k, i) => `${k} = $${i + 2}`).join(', ')
  await db.query(`update public.studi set ${set} where id = $1`, [studio, ...chiavi.map((k) => campi[k])])
}

/** Crea un compito come l'utente indicato (passa dalle regole del database). */
export async function creaCompito(
  db: PGlite,
  chi: Persona,
  assegnatario: string,
  cliente: string | null,
  titolo = 'Compito di prova',
): Promise<string> {
  return come(db, chi, async (tx) => {
    const r = await righe<{ id: string }>(
      tx,
      `select public.crea_compito($1, 'descrizione', $2, $3::uuid[], now() + interval '2 days', false, 'normale') as id`,
      [titolo, cliente, [assegnatario]],
    )
    return r[0].id
  })
}
