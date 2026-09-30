// Solo il server del sito agisce per conto degli utenti (revisione di sicurezza).
// Chi usasse il proprio JWT direttamente con la Data API di Supabase (REST, GraphQL, Realtime) saltando
// il sito, e quindi anche la verifica in due passaggi, non deve vedere né cambiare nulla.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, diretto, hash, nuovoDb, righe, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
})

const tabelleConRls = async () =>
  (await righe<{ t: string }>(db, `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1`)).map((r) => r.t)

describe('accesso diretto con il JWT, senza passare dal sito', () => {
  it('ogni tabella ha la RLS e la policy restrittiva "solo_dal_server"', async () => {
    const tutte = await righe<{ t: string }>(db, `select tablename as t from pg_tables where schemaname = 'public'`)
    const conRls = await tabelleConRls()
    expect(conRls.sort()).toEqual(tutte.map((r) => r.t).sort())
    const conPolicy = await righe<{ t: string }>(db,
      `select tablename as t from pg_policies where schemaname = 'public' and policyname = 'solo_dal_server' and permissive = 'RESTRICTIVE'`)
    expect(conPolicy.map((r) => r.t).sort()).toEqual(conRls.sort())
  })

  it('un admin non legge nessuna tabella', async () => {
    for (const t of await tabelleConRls()) {
      const r = await diretto(db, A.admin, (tx) => righe<{ n: number }>(tx, `select count(*)::int as n from public.${t}`)).catch(() => [{ n: 0 }])
      expect(r[0].n, t).toBe(0)
    }
    // dal sito invece sì
    const c = await come(db, A.admin, (tx) => righe(tx, 'select id from public.clienti'))
    expect(c).toHaveLength(6)
  })

  it('non modifica dati né chiama le funzioni che scrivono', async () => {
    const compito = await creaCompito(db, A.admin, A.c1.id, A.clienti[0].id)
    const u = await diretto(db, A.admin, (tx) => tx.query(`update public.studi set visibilita = 'studio_completo' where id = $1`, [A.id]))
    expect(u.affectedRows).toBe(0)
    const chiamate: [string, unknown[]][] = [
      [`select public.crea_invito('nuovo@esempio.it', 'Nuovo', 'Collega', 'admin', 'h1')`, []],
      [`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [A.clienti[0].id]],
      [`select public.aggiungi_commento($1, 'ciao')`, [compito]],
      [`select public.cambia_stato_compito($1, 'annullato', 'x')`, [compito]],
      [`select public.cambia_ruolo_utente($1, 'admin')`, [A.c1.id]],
      [`select public.registra_attivita('studio_registrato')`, []],
      [`select public.registra_ai('prova', 'x', 1, 1, 0, 'ok', 1)`, []],
      [`select public.elimina_clienti($1::uuid[])`, [[A.clienti[1].id]]],
      [`select public.registra_studio('Studio finto', 'Tizio', 'Prova')`, []],
    ]
    for (const [sql, params] of chiamate) {
      await expect(diretto(db, A.admin, (tx) => tx.query(sql, params)), sql).rejects.toThrow()
    }
    const stato = await righe<{ visibilita: string }>(db, 'select visibilita from public.studi where id = $1', [A.id])
    expect(stato[0].visibilita).toBe('solo_propri')
  })

  it('un nuovo account non registra uno studio né accetta un invito senza il sito', async () => {
    const id = crypto.randomUUID()
    await db.query(`insert into auth.users (id, email) values ($1, 'nuovo@esempio.it')`, [id])
    const p = { id, email: 'nuovo@esempio.it' }
    await expect(diretto(db, p, (tx) => tx.query(`select public.registra_studio('Studio X', 'Nuovo', 'Utente')`))).rejects.toThrow()
    await expect(diretto(db, p, (tx) => tx.query(`insert into public.utenti (id, studio_id, nome, cognome, email, ruolo)
      values ($1, $2, 'x', 'y', 'nuovo@esempio.it', 'admin')`, [id, A.id]))).rejects.toThrow()
    await come(db, p, (tx) => tx.query(`select public.registra_studio('Studio X', 'Nuovo', 'Utente')`))
  })

  it('nessuna funzione legge l\'utente con auth.uid() (tutte passano da public.io())', async () => {
    const f = await righe<{ nome: string }>(db, `select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%auth.uid()%' order by 1`)
    expect(f.map((r) => r.nome)).toEqual(['io', 'trg_solo_dal_server'])
  })
})

describe('regole aggiunte dalla revisione di sicurezza', () => {
  it('le informazioni di un invito si leggono solo dal sistema', async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.crea_invito('nuovo@esempio.it', 'Nuovo', 'Collega', 'collaboratore', $1)`, [hash('c1')]))
    await expect(come(db, A.admin, (tx) => tx.query('select * from public.info_invito($1)', [hash('c1')]))).rejects.toThrow()
    const i = await righe<{ email_inviata: boolean }>(db, 'select email_inviata from public.info_invito($1)', [hash('c1')])
    expect(i[0].email_inviata).toBe(false)
  })

  it('al massimo 100 inviti al giorno per studio', async () => {
    for (let i = 0; i < 100; i++) {
      await db.query(`insert into public.inviti (studio_id, email, nome, ruolo, codice_hash, scade_il)
        values ($1, $2, 'x', 'collaboratore', $3, now() + interval '7 days')`, [A.id, `p${i}@esempio.it`, hash(`x${i}`)])
    }
    await expect(come(db, A.admin, (tx) => tx.query(`select public.crea_invito('ultimo@esempio.it', 'U', 'L', 'collaboratore', $1)`, [hash('u')])))
      .rejects.toThrow(/Troppi inviti/)
    // un altro studio non è toccato
    await come(db, B.admin, (tx) => tx.query(`select public.crea_invito('ultimo@esempio.it', 'U', 'L', 'collaboratore', $1)`, [hash('u')]))
  })

  it('il nome di una persona si legge solo nel proprio studio', async () => {
    const r = await come(db, A.admin, (tx) => righe<{ a: string | null; b: string | null }>(tx,
      'select public.nome_utente($1) as a, public.nome_utente($2) as b', [A.c1.id, B.c1.id]))
    expect(r[0].a).toBe('uno Prova')
    expect(r[0].b).toBeNull()
  })

  it('la notifica "ha caricato N documenti" richiede documenti appena caricati da chi la manda', async () => {
    const compito = await creaCompito(db, A.admin, A.c1.id, null)
    const notifica = (n: number) => come(db, A.c1, (tx) => tx.query('select public.notifica_documenti($1, $2)', [compito, n]))
    await expect(notifica(1)).rejects.toThrow()
    await come(db, A.c1, async (tx) => {
      const id = crypto.randomUUID()
      await tx.query(`select public.registra_documento($1, $2, 'fattura.pdf', 'application/pdf', 100, $3)`, [compito, id, `${A.id}/compiti/${compito}/${id}`])
    })
    await expect(notifica(5)).rejects.toThrow()
    await notifica(1)
  })

  it('i documenti hanno un nome pulito, un tipo ammesso e non sono vuoti', async () => {
    const compito = await creaCompito(db, A.admin, A.c1.id, null)
    const registra = (nome: string, tipo: string, dim: number) =>
      come(db, A.c1, async (tx) => {
        const id = crypto.randomUUID()
        await tx.query('select public.registra_documento($1, $2, $3, $4, $5, $6)', [compito, id, nome, tipo, dim, `${A.id}/compiti/${compito}/${id}`])
      })
    await expect(registra('pagina.html', 'text/html', 10)).rejects.toThrow(/Tipo di file/)
    await expect(registra('immagine.svg', 'image/svg+xml', 10)).rejects.toThrow(/Tipo di file/)
    await expect(registra('fattura‮fdp.exe', 'application/pdf', 10)).rejects.toThrow(/Nome del file/)
    await expect(registra('../altro/fattura.pdf', 'application/pdf', 10)).rejects.toThrow(/Nome del file/)
    await expect(registra('vuoto.pdf', 'application/pdf', 0)).rejects.toThrow()
    await registra('Fattura marzo 2026.pdf', 'application/pdf', 10)
  })
})
