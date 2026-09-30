// API per gli agenti (sezione 13): limiti di frequenza, annullamento delle azioni degli agenti,
// coda di proposte. Le funzioni riservate agli admin o al server non si usano da agente.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, hash, nuovoDb, righe, type Persona, type Studio } from './helpers'

let db: PGlite
let A: Studio
let B: Studio
let agente: Persona
let tokenId: string

const permessi = (p: Record<string, string>) =>
  come(db, A.admin, (tx) => tx.query('select public.imposta_permessi_agente($1, $2)', [agente.id, JSON.stringify(p)]))

async function registra(chi: Persona, azione: string, entita: string, entitaId: string | null, dettagli: object, annullabile: boolean) {
  return come(db, chi, async (tx) => {
    const r = await righe<{ id: string }>(tx, 'select public.registra_attivita($1, $2, $3, $4, $5) as id',
      [azione, entita, entitaId, JSON.stringify(dettagli), annullabile])
    return r[0].id
  })
}

const uso = (scrittura: boolean, limite: number) =>
  righe<{ consentito: boolean; conteggio: number; riprova_tra: number; avviso_inviato: boolean }>(
    db, 'select * from public.api_registra_uso($1, $2, $3)', [tokenId, scrittura, limite])

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
  const id = crypto.randomUUID()
  await come(db, A.admin, (tx) => tx.query(`select public.crea_agente('Claude Cowork', 'Prove API', $1)`, [id]))
  agente = { id, email: `agente-${id}@agenti.invalid` }
  tokenId = await come(db, A.admin, async (tx) => {
    const r = await righe<{ id: string }>(tx, `select public.crea_token_agente($1, 'Prova', $2, 'bbs_prova', 30) as id`,
      [agente.id, hash('bbs_prova_token')])
    return r[0].id
  })
})

describe('limiti di frequenza (api_registra_uso)', () => {
  it('conta letture e scritture separatamente e blocca oltre il limite', async () => {
    for (let i = 1; i <= 3; i++) {
      const [r] = await uso(false, 3)
      expect(r.consentito).toBe(true)
      expect(r.conteggio).toBe(i)
    }
    const [oltre] = await uso(false, 3)
    expect(oltre.consentito).toBe(false)
    expect(oltre.riprova_tra).toBeGreaterThanOrEqual(1)
    expect(oltre.riprova_tra).toBeLessThanOrEqual(60)
    // le scritture hanno il loro contatore
    const [s] = await uso(true, 2)
    expect(s).toMatchObject({ consentito: true, conteggio: 1 })
    const t = await righe<{ ultimo_uso_il: Date | null }>(db, 'select ultimo_uso_il from public.agenti_token where id = $1', [tokenId])
    expect(t[0].ultimo_uso_il).not.toBeNull()
  })

  it('oltre il limite avvisa gli admin dello studio, al massimo una volta all\'ora', async () => {
    await uso(true, 1)
    const [primo] = await uso(true, 1)
    expect(primo).toMatchObject({ consentito: false, avviso_inviato: true })
    const [secondo] = await uso(true, 1)
    expect(secondo).toMatchObject({ consentito: false, avviso_inviato: false })
    const n = await come(db, A.admin, (tx) => righe<{ tipo: string; testo: string }>(tx, 'select tipo, testo from public.notifiche'))
    expect(n).toHaveLength(1)
    expect(n[0].tipo).toBe('agente')
    expect(n[0].testo).toMatch(/Claude Cowork.*limite di 1 scritture/)
    // i collaboratori e l'altro studio non ricevono nulla
    expect(await come(db, A.c1, (tx) => righe(tx, 'select id from public.notifiche'))).toHaveLength(0)
    expect(await come(db, B.admin, (tx) => righe(tx, 'select id from public.notifiche'))).toHaveLength(0)
  })

  it('è riservata al server: né agenti né admin la possono chiamare', async () => {
    await expect(come(db, agente, (tx) => tx.query('select * from public.api_registra_uso($1, false, 100)', [tokenId]))).rejects.toThrow(/permission denied/)
    await expect(come(db, A.admin, (tx) => tx.query('select * from public.api_registra_uso($1, false, 100)', [tokenId]))).rejects.toThrow(/permission denied/)
  })

  it('le impronte dei token e i contatori non sono leggibili da interfaccia o agente', async () => {
    await expect(come(db, A.admin, (tx) => tx.query('select token_hash from public.agenti_token'))).rejects.toThrow()
    await expect(come(db, agente, (tx) => tx.query('select token_hash from public.agenti_token'))).rejects.toThrow()
    await expect(come(db, A.admin, (tx) => tx.query('select * from public.api_uso'))).rejects.toThrow()
    // l'agente non vede nemmeno l'elenco dei token (solo admin)
    expect(await come(db, agente, (tx) => righe(tx, 'select id from public.agenti_token'))).toHaveLength(0)
  })
})

describe('annullamento delle azioni degli agenti (segna_attivita_annullata)', () => {
  it('l\'admin annulla un compito creato dall\'agente e segna la riga del registro', async () => {
    await permessi({ crea_compiti: 'si' })
    const compito = await creaCompito(db, agente, A.c1.id, A.clienti[0].id, 'Creato dall\'agente')
    const riga = await registra(agente, 'compito_creato', 'compito', compito, { titolo: 'Creato dall\'agente' }, true)
    const r = await righe<{ attore_ruolo: string }>(db, 'select attore_ruolo from public.registro_attivita where id = $1', [riga])
    expect(r[0].attore_ruolo).toBe('agente')

    await come(db, A.admin, async (tx) => {
      await tx.query('select public.segna_attivita_annullata($1)', [riga])
      await tx.query(`select public.cambia_stato_compito($1, 'annullato', 'Azione dell''agente annullata dall''admin')`, [compito])
    })
    const dopo = await righe<{ annullato_il: Date | null; annullato_da: string }>(db,
      'select annullato_il, annullato_da from public.registro_attivita where id = $1', [riga])
    expect(dopo[0].annullato_il).not.toBeNull()
    expect(dopo[0].annullato_da).toBe(A.admin.id)
    const k = await righe<{ stato: string }>(db, 'select stato from public.compiti where id = $1', [compito])
    expect(k[0].stato).toBe('annullato')
    const traccia = await righe<{ azione: string; attore_ruolo: string }>(db,
      `select azione, attore_ruolo from public.registro_attivita where azione = 'azione_annullata'`)
    expect(traccia).toEqual([{ azione: 'azione_annullata', attore_ruolo: 'admin' }])

    // una seconda volta no
    await expect(come(db, A.admin, (tx) => tx.query('select public.segna_attivita_annullata($1)', [riga]))).rejects.toThrow(/già annullata/)
  })

  it('l\'admin ripristina un indicatore aggiornato dall\'agente (origine "annullamento" nello storico)', async () => {
    await permessi({ aggiorna_indicatori: 'si' })
    const cliente = A.clienti[0].id
    await come(db, A.admin, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-06-30')`, [cliente]))
    await come(db, agente, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [cliente]))
    const riga = await registra(agente, 'indicatore_aggiornato', 'cliente', cliente,
      { tipo: 'iva', prima: { aggiornato_fino_al: '2026-06-30', non_applicabile: false } }, true)
    await come(db, A.admin, async (tx) => {
      await tx.query(`select set_config('app.origine', 'annullamento', true)`)
      await tx.query('select public.segna_attivita_annullata($1)', [riga])
      await tx.query(`select public.imposta_indicatore($1, 'iva', '2026-06-30', false)`, [cliente])
    })
    const s = await righe<{ origine: string; valore_nuovo: string }>(db,
      `select origine, valore_nuovo::text from public.aggiornamenti_storico where cliente_id = $1 order by modificato_il, origine`, [cliente])
    expect(s.map((x) => x.origine).sort()).toEqual(['agente', 'annullamento', 'manuale'])
    const v = await righe<{ d: string }>(db, `select aggiornato_fino_al::text as d from public.aggiornamenti_contabili where cliente_id = $1 and tipo = 'iva'`, [cliente])
    expect(v[0].d).toBe('2026-06-30')
  })

  it('un agente non segna annullata un\'azione, nemmeno con tutti i permessi', async () => {
    await permessi({ crea_compiti: 'si', aggiorna_compiti: 'si', aggiorna_indicatori: 'si', commenta: 'si', carica_documenti: 'si' })
    const riga = await registra(agente, 'compito_creato', 'compito', null, {}, true)
    await expect(come(db, agente, (tx) => tx.query('select public.segna_attivita_annullata($1)', [riga]))).rejects.toThrow(/Solo gli admin/)
    const r = await righe<{ annullato_il: Date | null }>(db, 'select annullato_il from public.registro_attivita where id = $1', [riga])
    expect(r[0].annullato_il).toBeNull()
  })

  it('né un collaboratore né l\'admin di un altro studio; e le azioni non annullabili restano tali', async () => {
    const riga = await registra(agente, 'compito_creato', 'compito', null, {}, true)
    await expect(come(db, A.c1, (tx) => tx.query('select public.segna_attivita_annullata($1)', [riga]))).rejects.toThrow()
    await expect(come(db, B.admin, (tx) => tx.query('select public.segna_attivita_annullata($1)', [riga]))).rejects.toThrow(/non trovata/)
    const commento = await registra(agente, 'commento_aggiunto', 'compito', null, {}, false)
    await expect(come(db, A.admin, (tx) => tx.query('select public.segna_attivita_annullata($1)', [commento]))).rejects.toThrow(/non annullabile/)
  })

  it('un agente non usa le altre funzioni riservate agli admin', async () => {
    await permessi({ crea_compiti: 'proposta' })
    await come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('crea_compito', '{"titolo":"x"}')`))
    const [p] = await come(db, agente, (tx) => righe<{ id: string }>(tx, 'select id from public.proposte_agente'))
    const vietate: [string, unknown[]][] = [
      [`select public.decidi_proposta_agente($1, 'approvata')`, [p.id]],
      [`select public.imposta_permessi_agente($1, '{"crea_compiti":"si"}')`, [agente.id]],
      [`select public.crea_token_agente($1, 'x', 'h2', 'p', 30)`, [agente.id]],
      [`select public.revoca_token_agente($1)`, [tokenId]],
      [`select public.imposta_utente_attivo($1, true)`, [agente.id]],
      [`select public.crea_agente('Altro', '', $1)`, [crypto.randomUUID()]],
    ]
    for (const [sql, params] of vietate) {
      await expect(come(db, agente, (tx) => tx.query(sql, params)), sql).rejects.toThrow()
    }
  })
})

describe('aggiornare i compiti richiede il permesso anche sui compiti creati dall\'agente', () => {
  it('con solo "crea_compiti" l\'agente non chiude, annulla, modifica né riassegna il suo compito', async () => {
    await permessi({ crea_compiti: 'si' })
    const compito = await creaCompito(db, agente, A.c1.id, null, 'Mio compito')
    const vietate: [string, unknown[]][] = [
      [`select public.cambia_stato_compito($1, 'in_lavorazione')`, [compito]],
      [`select public.cambia_stato_compito($1, 'annullato', 'prova')`, [compito]],
      [`select public.modifica_compito($1, 'Altro titolo', '', null, null, false, 'alta')`, [compito]],
      [`select public.riassegna_compito($1, $2::uuid[])`, [compito, [A.c2.id]]],
    ]
    for (const [sql, params] of vietate) {
      await expect(come(db, agente, (tx) => tx.query(sql, params)), sql).rejects.toThrow(/non è abilitato ad aggiornare|Non puoi|Solo un admin/)
    }
    const k = await righe<{ stato: string; titolo: string }>(db, 'select stato, titolo from public.compiti where id = $1', [compito])
    expect(k[0]).toEqual({ stato: 'assegnato', titolo: 'Mio compito' })
    // e senza "commenta" non commenta nemmeno il suo compito
    await expect(come(db, agente, (tx) => tx.query(`select public.aggiungi_commento($1, 'Promemoria')`, [compito])))
      .rejects.toThrow(/non è abilitato a commentare|Non puoi commentare/)
    await permessi({ crea_compiti: 'si', commenta: 'si' })
    await come(db, agente, (tx) => tx.query(`select public.aggiungi_commento($1, 'Promemoria')`, [compito]))
  })

  it('con "aggiorna_compiti" sì; e le persone non sono toccate dal controllo', async () => {
    await permessi({ crea_compiti: 'si', aggiorna_compiti: 'si' })
    const compito = await creaCompito(db, agente, A.c1.id, null, 'Mio compito')
    await come(db, agente, (tx) => tx.query(`select public.cambia_stato_compito($1, 'in_lavorazione')`, [compito]))
    await come(db, agente, (tx) => tx.query(`select public.modifica_compito($1, 'Nuovo titolo', '', null, null, false, 'alta')`, [compito]))
    await come(db, A.c1, (tx) => tx.query(`select public.cambia_stato_compito($1, 'pronto_revisione')`, [compito]))
    await come(db, A.admin, (tx) => tx.query(`select public.cambia_stato_compito($1, 'completato')`, [compito]))
    const k = await righe<{ stato: string; titolo: string }>(db, 'select stato, titolo from public.compiti where id = $1', [compito])
    expect(k[0]).toEqual({ stato: 'completato', titolo: 'Nuovo titolo' })
  })
})

describe('coda di proposte', () => {
  it('accetta la modifica dei campi di un compito con "aggiorna_compiti" in modalità proposta', async () => {
    await permessi({ aggiorna_compiti: 'proposta' })
    const compito = await creaCompito(db, A.admin, A.c1.id, null)
    await come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('modifica_compito', $1)`,
      [JSON.stringify({ compito_id: compito, priorita: 'urgente' })]))
    await come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('cambia_stato_compito', $1)`,
      [JSON.stringify({ compito_id: compito, stato: 'in_lavorazione' })]))
    const p = await come(db, A.admin, (tx) => righe<{ azione: string; stato: string }>(tx,
      'select azione, stato from public.proposte_agente order by creata_il'))
    expect(p.map((x) => x.azione).sort()).toEqual(['cambia_stato_compito', 'modifica_compito'])
    const n = await come(db, A.admin, (tx) => righe<{ testo: string }>(tx, `select testo from public.notifiche where tipo = 'proposta'`))
    expect(n.some((x) => /modificare un compito/.test(x.testo))).toBe(true)
    // l'agente vede le sue proposte, l'altro studio no
    expect(await come(db, agente, (tx) => righe(tx, 'select id from public.proposte_agente'))).toHaveLength(2)
    expect(await come(db, B.admin, (tx) => righe(tx, 'select id from public.proposte_agente'))).toHaveLength(0)
  })

  it('rifiuta dati che non sono un oggetto e azioni con permesso diretto o assente', async () => {
    await permessi({ crea_compiti: 'proposta', commenta: 'si' })
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('crea_compito', '[1,2]')`))).rejects.toThrow(/non validi/)
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('commenta', '{}')`))).rejects.toThrow()
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('modifica_compito', '{}')`))).rejects.toThrow()
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('elimina_clienti', '{}')`))).rejects.toThrow()
    // una persona non crea proposte
    await expect(come(db, A.admin, (tx) => tx.query(`select public.crea_proposta_agente('crea_compito', '{}')`))).rejects.toThrow()
  })

  it('un agente sospeso non crea proposte e non legge più nulla', async () => {
    await permessi({ crea_compiti: 'proposta' })
    await come(db, A.admin, (tx) => tx.query('select public.imposta_utente_attivo($1, false)', [agente.id]))
    await expect(come(db, agente, (tx) => tx.query(`select public.crea_proposta_agente('crea_compito', '{}')`))).rejects.toThrow()
    expect(await come(db, agente, (tx) => righe(tx, 'select id from public.clienti'))).toHaveLength(0)
  })
})
