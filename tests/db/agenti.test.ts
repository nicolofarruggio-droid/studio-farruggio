// Account agente (sezione 13): sola lettura di default, scritture abilitate una per una,
// azioni vietate sempre, nessun accesso ad altri studi.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, nuovoDb, righe, type Persona, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio
let agente: Persona

const tuttiIPermessi = { crea_compiti: 'si', aggiorna_compiti: 'si', aggiorna_indicatori: 'si', commenta: 'si', carica_documenti: 'si' }

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
  const id = crypto.randomUUID()
  await come(db, A.admin, (tx) => tx.query(`select public.crea_agente('Claude Cowork', 'Riepiloghi mattutini', $1)`, [id]))
  agente = { id, email: `agente-${id}@agenti.invalid` }
})

const permessi = (p: Record<string, string>) =>
  come(db, A.admin, (tx) => tx.query('select public.imposta_permessi_agente($1, $2)', [agente.id, JSON.stringify(p)]))

describe('agente in sola lettura (default)', () => {
  it('legge clienti e compiti dello studio', async () => {
    await creaCompito(db, A.admin, A.c1.id, A.clienti[0].id)
    const c = await come(db, agente, (tx) => righe(tx, 'select id from public.clienti'))
    expect(c).toHaveLength(6)
    const t = await come(db, agente, (tx) => righe(tx, 'select id from public.compiti'))
    expect(t).toHaveLength(1)
  })

  it('non scrive nulla senza permessi', async () => {
    const compito = await creaCompito(db, A.admin, A.c1.id, null)
    await expect(come(db, agente, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [A.clienti[0].id]))).rejects.toThrow()
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_compito('x', '', null, $1::uuid[], null, false, 'normale')`, [[A.c1.id]]))).rejects.toThrow()
    await expect(come(db, agente, (tx) => tx.query(`select public.aggiungi_commento($1, 'Promemoria')`, [compito]))).rejects.toThrow()
    await expect(come(db, agente, (tx) => tx.query(`select public.cambia_stato_compito($1, 'in_lavorazione')`, [compito]))).rejects.toThrow()
  })

  it('non vede i dati di un altro studio', async () => {
    await permessi(tuttiIPermessi)
    for (const t of ['clienti', 'compiti', 'utenti', 'comunicazioni']) {
      const r = await come(db, agente, (tx) => righe<{ n: number }>(tx, `select count(*)::int as n from public.${t} where studio_id = $1`, [B.id]))
      expect(r[0].n, t).toBe(0)
    }
    await expect(come(db, agente, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [B.clienti[0].id]))).rejects.toThrow()
  })
})

describe('agente con permessi di scrittura', () => {
  it('abilitato, crea un compito e aggiorna un indicatore; le azioni sono riconoscibili come agente', async () => {
    await permessi({ crea_compiti: 'si', aggiorna_indicatori: 'si' })
    const id = await creaCompito(db, agente, A.c1.id, A.clienti[0].id, 'Preparare riepilogo')
    await come(db, agente, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [A.clienti[0].id]))
    const creatore = await righe<{ ruolo: string }>(db,
      'select u.ruolo from public.compiti c join public.utenti u on u.id = c.creato_da where c.id = $1', [id])
    expect(creatore[0].ruolo).toBe('agente')
    const storico = await righe<{ origine: string }>(db, 'select origine from public.aggiornamenti_storico where cliente_id = $1', [A.clienti[0].id])
    expect(storico.map((s) => s.origine)).toEqual(['agente'])
  })

  it('in modalità "proposta" non scrive direttamente ma mette in coda', async () => {
    await permessi({ crea_compiti: 'proposta' })
    await expect(creaCompito(db, agente, A.c1.id, null)).rejects.toThrow(/non è abilitato/)
    await come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('crea_compito', $1)`, [JSON.stringify({ titolo: 'x' })]))
    const n = await come(db, A.admin, (tx) => righe<{ tipo: string }>(tx, 'select tipo from public.notifiche'))
    expect(n.map((x) => x.tipo)).toEqual(['proposta'])
    // senza "proposta" non può mettere in coda
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('aggiorna_indicatore', '{}')`))).rejects.toThrow()
  })

  const vietate: [string, (s: Studio) => [string, unknown[]]][] = [
    ['eliminare clienti', (s) => ['select public.elimina_clienti($1::uuid[])', [[s.clienti[0].id]]]],
    ['cambiare ruoli', (s) => [`select public.cambia_ruolo_utente($1, 'admin')`, [s.c1.id]]],
    ['cambiare i propri permessi', () => [`select public.imposta_permessi_agente(auth.uid(), '{"crea_compiti":"si"}')`, []]],
    ['invitare utenti', () => [`select public.crea_invito('x@esempio.it', 'X', 'Y', 'admin', 'h')`, []]],
    ['disattivare utenti', (s) => ['select public.imposta_utente_attivo($1, false)', [s.c1.id]]],
    ['modificare le impostazioni dello studio', (s) => [`update public.studi set visibilita = 'studio_completo' where id = $1 returning id`, [s.id]]],
    ['concedere accessi', (s) => [`select public.concedi_accesso_collega($1, $2, 'completa')`, [s.c1.id, s.c2.id]]],
    ['leggere il registro attività', () => ['select 1/count(*) from public.registro_attivita', []]],
    ['creare token', () => [`select public.crea_token_agente(auth.uid(), 'x', 'h', 'p', 30)`, []]],
  ]
  for (const [nome, azione] of vietate) {
    it(`non riesce a ${nome}, nemmeno con tutti i permessi abilitati`, async () => {
      await permessi(tuttiIPermessi)
      const [sql, params] = azione(A)
      const esito = come(db, agente, async (tx) => {
        const r = await tx.query(sql, params)
        if (r.rows.length === 0 || r.affectedRows === 0) throw new Error('nessun effetto')
        return r
      })
      await expect(esito).rejects.toThrow()
    })
  }

  it('i permessi accettano solo le azioni previste', async () => {
    await permessi({ ...tuttiIPermessi, elimina_clienti: 'si', admin: 'si' } as Record<string, string>)
    const r = await righe<{ permessi_agente: Record<string, string> }>(db, 'select permessi_agente from public.utenti where id = $1', [agente.id])
    expect(Object.keys(r[0].permessi_agente).sort()).toEqual(Object.keys(tuttiIPermessi).sort())
  })
})
