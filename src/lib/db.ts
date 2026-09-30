import 'server-only'
import postgres from 'postgres'

// Accesso al database. Tutte le letture e scritture fatte per conto di un utente passano da
// conUtente(): la transazione gira con il ruolo `authenticated` e i claims dell'utente, quindi
// valgono le regole RLS esattamente come per le API di Supabase. comeSistema() salta RLS ed è
// riservato ai processi del server (controllo email, inviti prima dell'accesso, cron).

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql
export type Persona = { id: string; email: string }

declare global {
  var __bbsSql: Sql | undefined
}

function crea(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL non configurata (vedi .env.example)')
  return postgres(url, {
    prepare: false, // compatibile con il pooler di Supabase in modalità transaction
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    types: {
      // le date (senza ora) restano stringhe "AAAA-MM-GG": niente sorprese di fuso orario
      data: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  })
}

function sql(): Sql {
  globalThis.__bbsSql ??= crea()
  return globalThis.__bbsSql
}

export async function conUtente<T>(
  persona: Persona,
  fn: (tx: Tx) => Promise<T>,
  opzioni: { origine?: 'manuale' | 'importazione' | 'agente' | 'annullamento' } = {},
): Promise<T> {
  const claims = JSON.stringify({ sub: persona.id, email: persona.email, role: 'authenticated' })
  return sql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`
    if (opzioni.origine) await tx`select set_config('app.origine', ${opzioni.origine}, true)`
    return fn(tx)
  }) as Promise<T>
}

/** Solo per processi del server: salta RLS. Non usare con dati forniti dall'utente senza controlli. */
export async function comeSistema<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return fn(sql())
}
