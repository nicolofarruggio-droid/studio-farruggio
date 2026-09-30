// Area "Studio" (T1/T5): traccia delle email di notifica, disattivazione con riassegnazione,
// profilo personale, impostazioni, registro e consumi visibili solo agli admin.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, nuovoDb, righe, type Studio, type Tx } from './helpers'

let db: PGlite
let A: Studio
let B: Studio

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
})

describe('email_notifiche (traccia delle email di commenti e riepiloghi)', () => {
  const inserisci = (tx: PGlite | Tx, studio: string, utente: string, rif: string) =>
    tx.query(
      `insert into public.email_notifiche (studio_id, utente_id, tipo, riferimento) values ($1, $2, 'riepilogo_scadenze', $3)
       on conflict (utente_id, tipo, riferimento) do nothing returning id`,
      [studio, utente, rif],
    )

  it('il processo del server prenota una sola volta ogni email (vincolo unico)', async () => {
    const prima = await inserisci(db, A.id, A.c1.id, '2026-09-30')
    const seconda = await inserisci(db, A.id, A.c1.id, '2026-09-30')
    expect(prima.rows).toHaveLength(1)
    expect(seconda.rows).toHaveLength(0)
    const altroGiorno = await inserisci(db, A.id, A.c1.id, '2026-10-01')
    expect(altroGiorno.rows).toHaveLength(1)
  })

  it('destinatario e compito devono essere dello stesso studio della riga', async () => {
    await expect(inserisci(db, A.id, B.c1.id, '2026-09-30')).rejects.toThrow(/Destinatario e studio/)
    const compitoB = await creaCompito(db, B.admin, B.c1.id, B.clienti[0].id)
    await expect(
      db.query(
        `insert into public.email_notifiche (studio_id, utente_id, tipo, riferimento, compito_id) values ($1, $2, 'commento', 'x', $3)`,
        [A.id, A.c1.id, compitoB],
      ),
    ).rejects.toThrow(/Compito e studio/)
  })

  it('nessun utente (nemmeno admin) la legge o la scrive: è solo del processo del server', async () => {
    await inserisci(db, A.id, A.admin.id, '2026-09-30')
    for (const p of [A.admin, A.c1]) {
      await expect(come(db, p, (tx) => tx.query('select * from public.email_notifiche'))).rejects.toThrow(/permission denied/)
      await expect(come(db, p, (tx) => inserisci(tx, A.id, p.id, '2026-10-02'))).rejects.toThrow(/permission denied/)
      await expect(come(db, p, (tx) => tx.query(`delete from public.email_notifiche`))).rejects.toThrow(/permission denied/)
      await expect(come(db, p, (tx) => tx.query(`update public.email_notifiche set esito = 'inviata'`))).rejects.toThrow(/permission denied/)
    }
  })
})

describe('disattivazione con riassegnazione (Utenti e inviti)', () => {
  // stessa sequenza dell'azione disattivaPersona, in una sola transazione
  async function disattiva(chi: Studio['admin'], utente: string, nuovo: string) {
    return come(db, chi, async (tx) => {
      const clienti = await righe<{ id: string }>(tx,
        `select cliente_id as id from public.assegnazioni where utente_id = $1 and al is null and referente_principale`, [utente])
      if (clienti.length) await tx.query(`select public.assegna_referente($1::uuid[], $2)`, [clienti.map((c) => c.id), nuovo])
      const compiti = await righe<{ id: string; altri: string[] }>(tx, `
        select k.id, array(select a.utente_id from public.compiti_assegnatari a join public.utenti u on u.id = a.utente_id
                           where a.compito_id = k.id and a.utente_id <> $1 and u.attivo) as altri
        from public.compiti k
        where k.stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')
          and exists (select 1 from public.compiti_assegnatari a where a.compito_id = k.id and a.utente_id = $1)`, [utente])
      for (const k of compiti) {
        await tx.query(`select public.riassegna_compito($1, $2::uuid[])`, [k.id, [...new Set([...k.altri, nuovo])]])
      }
      await tx.query(`select public.imposta_utente_attivo($1, false)`, [utente])
    })
  }

  it('clienti e compiti aperti passano al collega scelto, che riceve la notifica; chi è disattivato perde gli accessi', async () => {
    const compito = await creaCompito(db, A.admin, A.c1.id, A.clienti[0].id, 'Contratto di affitto')
    const chiuso = await creaCompito(db, A.admin, A.c1.id, null, 'Già chiuso')
    await come(db, A.admin, (tx) => tx.query(`select public.cambia_stato_compito($1, 'completato')`, [chiuso]))
    await come(db, A.admin, (tx) => tx.query(`select public.concedi_accesso_collega($1, $2, 'lettura')`, [A.c1.id, A.c3.id]))

    await disattiva(A.admin, A.c1.id, A.c2.id)

    const referenti = await righe<{ cliente_id: string; utente_id: string }>(db,
      `select cliente_id, utente_id from public.assegnazioni where al is null and referente_principale and cliente_id = any($1::uuid[])`,
      [A.clienti.filter((c) => c.referente === A.c1.id).map((c) => c.id)])
    expect(referenti).toHaveLength(2)
    expect(referenti.every((r) => r.utente_id === A.c2.id)).toBe(true)
    // lo storico delle assegnazioni resta
    const storiche = await righe(db, `select 1 from public.assegnazioni where utente_id = $1 and al is not null`, [A.c1.id])
    expect(storiche).toHaveLength(2)

    const assegnatari = await righe<{ compito_id: string; utente_id: string }>(db,
      `select compito_id, utente_id from public.compiti_assegnatari where compito_id = any($1::uuid[]) order by compito_id`, [[compito, chiuso]])
    expect(assegnatari.find((a) => a.compito_id === compito)?.utente_id).toBe(A.c2.id)
    // i compiti chiusi restano a chi li ha fatti
    expect(assegnatari.find((a) => a.compito_id === chiuso)?.utente_id).toBe(A.c1.id)

    const notifiche = await come(db, A.c2, (tx) => righe<{ tipo: string; compito_id: string }>(tx, `select tipo, compito_id from public.notifiche`))
    expect(notifiche).toContainEqual({ tipo: 'assegnato', compito_id: compito })

    const [u] = await righe<{ attivo: boolean }>(db, `select attivo from public.utenti where id = $1`, [A.c1.id])
    expect(u.attivo).toBe(false)
    expect(await righe(db, `select 1 from public.accessi_colleghi where utente_id = $1`, [A.c1.id])).toHaveLength(0)
    const log = await righe<{ azione: string }>(db, `select azione from public.registro_attivita where studio_id = $1 order by creato_il`, [A.id])
    expect(log.map((l) => l.azione)).toEqual(expect.arrayContaining(['clienti_assegnati', 'utente_disattivato']))
  })

  it("se la disattivazione non è permessa (ultimo admin) non cambia nulla, nemmeno le riassegnazioni", async () => {
    await expect(disattiva(A.admin, A.admin.id, A.c2.id)).rejects.toThrow(/almeno un admin attivo/)
    const [u] = await righe<{ attivo: boolean }>(db, `select attivo from public.utenti where id = $1`, [A.admin.id])
    expect(u.attivo).toBe(true)
  })

  it('non si passa il lavoro a una persona di un altro studio o disattivata', async () => {
    await expect(disattiva(A.admin, A.c1.id, B.c1.id)).rejects.toThrow()
    await come(db, A.admin, (tx) => tx.query(`select public.imposta_utente_attivo($1, false)`, [A.c3.id]))
    await expect(disattiva(A.admin, A.c1.id, A.c3.id)).rejects.toThrow()
    const [u] = await righe<{ attivo: boolean }>(db, `select attivo from public.utenti where id = $1`, [A.c1.id])
    expect(u.attivo).toBe(true)
  })

  it('un collaboratore non disattiva né riassegna', async () => {
    await expect(disattiva(A.c2, A.c1.id, A.c2.id)).rejects.toThrow()
  })
})

describe('profilo personale', () => {
  it('ognuno cambia nome, cognome e preferenze delle email solo per sé', async () => {
    await come(db, A.c1, (tx) => tx.query(
      `update public.utenti set nome = 'Giulia', cognome = 'Bianchi', preferenze_notifiche = '{"commenti": false}' where id = $1`, [A.c1.id]))
    const [u] = await righe<{ nome: string; preferenze_notifiche: Record<string, boolean> }>(db,
      `select nome, preferenze_notifiche from public.utenti where id = $1`, [A.c1.id])
    expect(u.nome).toBe('Giulia')
    expect(u.preferenze_notifiche).toEqual({ commenti: false })
    // i dati di un collega no: nessuna riga toccata
    const r = await come(db, A.c1, (tx) => tx.query(`update public.utenti set nome = 'X' where id = $1`, [A.c2.id]))
    expect(r.affectedRows).toBe(0)
  })

  it('ruolo, email e stato non si cambiano dal profilo', async () => {
    for (const set of [`ruolo = 'admin'`, `email = 'altro@esempio.it'`, `attivo = true`, `studio_id = '${B.id}'`]) {
      await expect(come(db, A.c1, (tx) => tx.query(`update public.utenti set ${set} where id = $1`, [A.c1.id]))).rejects.toThrow(/permission denied/)
    }
  })
})

describe('impostazioni, registro e consumi', () => {
  it("l'admin salva l'anagrafica; il cambio del nome finisce nel registro", async () => {
    await come(db, A.admin, (tx) => tx.query(
      `update public.studi set nome = 'Studio A Associati', partita_iva = '01234567890', pec = 'studio@pec.esempio.it' where id = public.mio_studio()`))
    const log = await righe<{ dettagli: { campo: string; prima: string; dopo: string } }>(db,
      `select dettagli from public.registro_attivita where studio_id = $1 and azione = 'impostazione_modificata'`, [A.id])
    expect(log.map((l) => l.dettagli)).toEqual([{ campo: 'nome', prima: 'Studio A', dopo: 'Studio A Associati' }])
  })

  it('un collaboratore non cambia nessuna impostazione (nessuna riga toccata)', async () => {
    const r = await come(db, A.c1, (tx) => tx.query(
      `update public.studi set lettura_email_attiva = true, soglia_ritardo_iva_mesi = 5 where id = public.mio_studio()`))
    expect(r.affectedRows).toBe(0)
    const [s] = await righe<{ lettura_email_attiva: boolean }>(db, `select lettura_email_attiva from public.studi where id = $1`, [A.id])
    expect(s.lettura_email_attiva).toBe(false)
  })

  it('le soglie restano tra 0 e 36 mesi', async () => {
    await expect(come(db, A.admin, (tx) => tx.query(`update public.studi set soglia_ritardo_iva_mesi = 40 where id = public.mio_studio()`))).rejects.toThrow()
  })

  it("registro attività e consumi AI li vede solo l'admin del proprio studio", async () => {
    await come(db, A.admin, (tx) => tx.query(`select public.registra_attivita('esportazione_dati', 'studio', $1, '{"righe": {"Clienti": 6}}')`, [A.id]))
    await come(db, A.c1, (tx) => tx.query(`select public.registra_ai('riassunto_incollato', 'modello', 100, 20, 0.001, 'ok', 900)`))
    const registroAdmin = await come(db, A.admin, (tx) => righe<{ azione: string }>(tx, `select azione from public.registro_attivita`))
    expect(registroAdmin.map((r) => r.azione)).toContain('esportazione_dati')
    expect(await come(db, A.c1, (tx) => righe(tx, `select 1 from public.registro_attivita`))).toHaveLength(0)
    expect(await come(db, A.admin, (tx) => righe(tx, `select 1 from public.ai_richieste`))).toHaveLength(1)
    expect(await come(db, A.c1, (tx) => righe(tx, `select 1 from public.ai_richieste`))).toHaveLength(0)
    expect(await come(db, B.admin, (tx) => righe(tx, `select 1 from public.ai_richieste`))).toHaveLength(0)
    expect(await come(db, B.admin, (tx) => righe(tx, `select 1 from public.registro_attivita where azione = 'esportazione_dati'`))).toHaveLength(0)
  })

  it("l'admin vede se la casella di un collega è collegata, ma non il cursore né i token", async () => {
    await db.query(`insert into public.caselle_email (studio_id, utente_id, stato, indirizzo) values ($1, $2, 'collegata', 'uno@esempio.it')`, [A.id, A.c1.id])
    const r = await come(db, A.admin, (tx) => righe<{ stato: string }>(tx, `select stato from public.caselle_email where utente_id = $1`, [A.c1.id]))
    expect(r).toEqual([{ stato: 'collegata' }])
    await expect(come(db, A.admin, (tx) => tx.query(`select cursore from public.caselle_email`))).rejects.toThrow(/permission denied/)
    await expect(come(db, A.admin, (tx) => tx.query(`select * from public.caselle_email_token`))).rejects.toThrow(/permission denied/)
  })
})

describe('inviti dalla pagina Utenti', () => {
  it("crea, segna l'esito dell'email, rinvia e annulla; tutto nel registro", async () => {
    const id = await come(db, A.admin, async (tx) => {
      const [r] = await righe<{ id: string }>(tx, `select public.crea_invito('nuovo@esempio.it', 'Nuovo', 'Collega', 'collaboratore', 'hash-1') as id`)
      await tx.query(`select public.segna_invio_invito($1, false, 'Servizio email non configurato')`, [r.id])
      return r.id
    })
    const [i] = await come(db, A.admin, (tx) => righe<{ email_inviata_il: string | null; errore_invio: string }>(tx,
      `select email_inviata_il, errore_invio from public.inviti where id = $1`, [id]))
    expect(i).toEqual({ email_inviata_il: null, errore_invio: 'Servizio email non configurato' })
    await come(db, A.admin, async (tx) => {
      await tx.query(`select public.rinnova_invito($1, 'hash-2')`, [id])
      await tx.query(`select public.segna_invio_invito($1, true)`, [id])
    })
    const [j] = await come(db, A.admin, (tx) => righe<{ email_inviata_il: string | null; errore_invio: string | null }>(tx,
      `select email_inviata_il, errore_invio from public.inviti where id = $1`, [id]))
    expect(j.email_inviata_il).not.toBeNull()
    expect(j.errore_invio).toBeNull()
    // un secondo invito allo stesso indirizzo non si crea: si rinvia quello esistente
    await expect(come(db, A.admin, (tx) => tx.query(`select public.crea_invito('nuovo@esempio.it', 'Nuovo', '', 'collaboratore', 'hash-3')`)))
      .rejects.toThrow(/già un invito in attesa/)
    await come(db, A.admin, (tx) => tx.query(`select public.annulla_invito($1)`, [id]))
    const log = await righe<{ azione: string }>(db, `select azione from public.registro_attivita where entita_id = $1 order by creato_il`, [id])
    expect(log.map((l) => l.azione)).toEqual(['invito_creato', 'invito_rinnovato', 'invito_annullato'])
    // un collaboratore non segna esiti né rinvia
    await expect(come(db, A.c1, (tx) => tx.query(`select public.segna_invio_invito($1, true)`, [id]))).rejects.toThrow(/riservata agli admin/)
  })
})
