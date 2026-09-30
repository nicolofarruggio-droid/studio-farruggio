// Applica le migrazioni SQL di supabase/migrations che non sono ancora state applicate.
// Uso: DATABASE_URL=... npx tsx scripts/migra.ts
// Con Supabase CLI si può usare invece `supabase db push` (stesse migrazioni).
import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const url = process.env.DATABASE_URL_MIGRAZIONI ?? process.env.DATABASE_URL
if (!url) {
  console.error('Manca DATABASE_URL')
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => {} })
const cartella = path.resolve(import.meta.dirname, '../supabase/migrations')

async function main() {
  // registro delle migrazioni in uno schema senza privilegi per anon/authenticated
  await sql`create schema if not exists interno`
  await sql`revoke all on schema interno from public`
  await sql`create table if not exists interno.migrazioni (nome text primary key, applicata_il timestamptz not null default now())`
  const fatte = new Set((await sql<{ nome: string }[]>`select nome from interno.migrazioni`).map((r) => r.nome))
  const file = readdirSync(cartella).filter((f) => f.endsWith('.sql')).sort()
  for (const f of file) {
    if (fatte.has(f)) continue
    const testo = readFileSync(path.join(cartella, f), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(testo)
      await tx`insert into interno.migrazioni (nome) values (${f})`
    })
    console.log('applicata', f)
  }
  console.log('Migrazioni aggiornate')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => sql.end())
