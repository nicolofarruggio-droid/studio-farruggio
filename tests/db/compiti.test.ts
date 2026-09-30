// Compiti: chi può crearli, flusso degli stati, rimandare indietro, documenti, notifiche (sezioni 5 e 8).
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaCompito, creaStudio, impostaStudio, nuovoDb, righe, type Persona, type Studio } from './helpers'

let db: PGlite
let A: Studio

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
})

const stato = async (id: string) =>
  (await righe<{ stato: string }>(db, 'select stato from public.compiti where id = $1', [id]))[0].stato
const notificheDi = (p: Persona) =>
  come(db, p, (tx) => righe<{ tipo: string; testo: string; motivo: string | null; letta: boolean }>(
    tx, 'select tipo, testo, motivo, letta from public.notifiche order by creata_il'))
const cambia = (p: Persona, id: string, s: string, motivo: string | null = null) =>
  come(db, p, (tx) => tx.query('select public.cambia_stato_compito($1, $2, $3)', [id, s, motivo]))

describe('chi può creare compiti', () => {
  it("con 'solo gli admin' (default) un collaboratore non crea compiti", async () => {
    await expect(creaCompito(db, A.c1, A.c1.id, null)).rejects.toThrow(/Non puoi assegnare/)
    await expect(creaCompito(db, A.c1, A.c2.id, null)).rejects.toThrow()
  })

  it("con 'solo per sé' crea compiti solo per sé stesso", async () => {
    await impostaStudio(db, A.id, { creazione_compiti: 'per_se' })
    await creaCompito(db, A.c1, A.c1.id, null)
    await expect(creaCompito(db, A.c1, A.c2.id, null)).rejects.toThrow()
    await expect(creaCompito(db, A.c1, A.admin.id, null)).rejects.toThrow()
  })

  it("con 'tutti per tutti' assegna a chiunque, admin compresi, e chi crea lo vede e lo chiude", async () => {
    await impostaStudio(db, A.id, { creazione_compiti: 'tutti' })
    const id = await creaCompito(db, A.c1, A.c2.id, null)
    const perAdmin = await creaCompito(db, A.c1, A.admin.id, null)
    // c3 non vede il compito di c2
    const visti = await come(db, A.c3, (tx) => righe(tx, 'select id from public.compiti'))
    expect(visti).toHaveLength(0)
    // chi crea lo vede anche se è assegnato ad altri
    const vistiC1 = await come(db, A.c1, (tx) => righe<{ id: string }>(tx, 'select id from public.compiti order by id'))
    expect(vistiC1.map((r) => r.id).sort()).toEqual([id, perAdmin].sort())
    await cambia(A.c2, id, 'pronto_revisione')
    await cambia(A.c1, id, 'completato')
    expect(await stato(id)).toBe('completato')
  })

  it('il cliente del compito deve essere visibile a chi lo crea', async () => {
    await impostaStudio(db, A.id, { creazione_compiti: 'per_se' })
    const altrui = A.clienti.find((c) => c.referente === A.c2.id)!.id
    await expect(creaCompito(db, A.c1, A.c1.id, altrui)).rejects.toThrow(/Cliente non trovato/)
    const suo = A.clienti.find((c) => c.referente === A.c1.id)!.id
    await creaCompito(db, A.c1, A.c1.id, suo)
  })

  it('non si assegnano compiti a utenti disattivati', async () => {
    await come(db, A.admin, (tx) => tx.query('select public.imposta_utente_attivo($1, false)', [A.c3.id]))
    await expect(creaCompito(db, A.admin, A.c3.id, null)).rejects.toThrow()
  })
})

describe('flusso di un compito', () => {
  it("l'admin assegna, il collaboratore lavora e segnala pronto, l'admin lo rimanda indietro e poi lo chiude", async () => {
    const cliente = A.clienti[0].id
    const id = await creaCompito(db, A.admin, A.c1.id, cliente, 'Contratto di affitto')

    // notifica "Nuovo compito" al collaboratore, nessuna all'admin per la propria azione
    expect((await notificheDi(A.c1)).map((n) => n.tipo)).toEqual(['assegnato'])
    expect(await notificheDi(A.admin)).toHaveLength(0)

    // gli altri collaboratori non vedono il compito
    expect(await come(db, A.c2, (tx) => righe(tx, 'select * from public.compiti'))).toHaveLength(0)

    await cambia(A.c1, id, 'in_lavorazione')
    await cambia(A.c1, id, 'pronto_revisione')
    expect((await notificheDi(A.admin)).map((n) => n.tipo)).toEqual(['pronto'])

    // il collaboratore non può chiudere il compito
    await expect(cambia(A.c1, id, 'completato')).rejects.toThrow(/Solo un admin/)
    // né rimandarlo indietro
    await expect(come(db, A.c1, (tx) => tx.query('select public.rimanda_indietro_compito($1, $2)', [id, 'x']))).rejects.toThrow()

    await come(db, A.admin, (tx) => tx.query('select public.rimanda_indietro_compito($1, $2)', [id, 'Manca la firma del locatore']))
    expect(await stato(id)).toBe('in_lavorazione')
    const n = await notificheDi(A.c1)
    expect(n.at(-1)).toMatchObject({ tipo: 'rimandato', motivo: 'Manca la firma del locatore' })
    const box = await righe<{ rimandato_motivo: string }>(db, 'select rimandato_motivo from public.compiti where id = $1', [id])
    expect(box[0].rimandato_motivo).toBe('Manca la firma del locatore')

    await cambia(A.c1, id, 'pronto_revisione')
    const dopo = await righe<{ rimandato_motivo: string | null }>(db, 'select rimandato_motivo from public.compiti where id = $1', [id])
    expect(dopo[0].rimandato_motivo).toBeNull()

    await cambia(A.admin, id, 'completato')
    const c = await righe<{ stato: string; completato_il: string | null }>(db, 'select stato, completato_il from public.compiti where id = $1', [id])
    expect(c[0].stato).toBe('completato')
    expect(c[0].completato_il).not.toBeNull()

    // cronologia completa, con la spiegazione del rimando
    const eventi = await come(db, A.c1, (tx) => righe<{ tipo: string; dati: { motivo?: string } }>(
      tx, 'select tipo, dati from public.compiti_eventi where compito_id = $1 order by creato_il', [id]))
    expect(eventi.map((e) => e.tipo)).toEqual(['creato', 'stato', 'stato', 'rimandato', 'stato', 'stato'])
    expect(eventi[3].dati.motivo).toBe('Manca la firma del locatore')
  })

  it('annullare richiede un motivo; riaprire è dell\'admin o di chi l\'ha creato', async () => {
    const id = await creaCompito(db, A.admin, A.c1.id, null)
    await expect(cambia(A.admin, id, 'annullato')).rejects.toThrow(/motivo/)
    await expect(cambia(A.c1, id, 'annullato', 'non serve')).rejects.toThrow()
    await cambia(A.admin, id, 'annullato', 'Il cliente ha cambiato idea')
    await expect(cambia(A.c1, id, 'in_lavorazione')).rejects.toThrow(/riaprirlo/)
    await cambia(A.admin, id, 'in_lavorazione')
    expect(await stato(id)).toBe('in_lavorazione')
  })

  it('le notifiche le vede e le segna lette solo il destinatario', async () => {
    await creaCompito(db, A.admin, A.c1.id, null)
    expect(await come(db, A.c2, (tx) => righe(tx, 'select * from public.notifiche'))).toHaveLength(0)
    const r = await come(db, A.c2, (tx) => tx.query('update public.notifiche set letta = true'))
    expect(r.affectedRows).toBe(0)
    await come(db, A.c1, (tx) => tx.query('select public.segna_notifiche_lette(null)'))
    expect((await notificheDi(A.c1)).every((n) => n.letta)).toBe(true)
  })
})

describe('documenti dei compiti', () => {
  const carica = (p: Persona, compito: string, nome = 'file.pdf') =>
    come(db, p, async (tx) => {
      const id = crypto.randomUUID()
      await tx.query(`select public.registra_documento($1, $2, $3, 'application/pdf', 2048, $4)`, [
        compito, id, nome, `${A.id}/compiti/${compito}/${id}`,
      ])
      await tx.query('select public.notifica_documenti($1, 1)', [compito])
      return id
    })

  it("admin e collaboratore caricano; a compito chiuso restano consultabili e nessuno li elimina", async () => {
    const id = await creaCompito(db, A.admin, A.c1.id, A.clienti[0].id)
    await carica(A.admin, id, 'bozza.docx')
    await carica(A.c1, id, 'contratto-firmato.pdf')
    // notifica "Documenti" all'altro, non a chi carica
    expect((await notificheDi(A.admin)).map((n) => n.tipo)).toContain('documenti')
    expect((await notificheDi(A.c1)).map((n) => n.tipo)).toEqual(['assegnato', 'documenti'])

    await cambia(A.c1, id, 'pronto_revisione')
    await cambia(A.admin, id, 'completato')

    for (const p of [A.admin, A.c1]) {
      const docs = await come(db, p, (tx) => righe(tx, 'select nome_file from public.compiti_documenti where compito_id = $1', [id]))
      expect(docs).toHaveLength(2)
      await expect(come(db, p, (tx) => tx.query('delete from public.compiti_documenti where compito_id = $1', [id]))).rejects.toThrow(/permission denied/)
    }
    // a compito chiuso non se ne aggiungono altri
    await expect(carica(A.admin, id)).rejects.toThrow(/chiuso/)
    // gli altri collaboratori non li vedono
    expect(await come(db, A.c2, (tx) => righe(tx, 'select * from public.compiti_documenti'))).toHaveLength(0)
  })

  it('il percorso del file deve essere quello del compito', async () => {
    const id = await creaCompito(db, A.admin, A.c1.id, null)
    await expect(
      come(db, A.c1, (tx) => tx.query(`select public.registra_documento($1, gen_random_uuid(), 'x.pdf', 'application/pdf', 1, 'altro/percorso')`, [id])),
    ).rejects.toThrow(/Percorso/)
  })

  it('un collaboratore non carica su compiti non suoi', async () => {
    await impostaStudio(db, A.id, { visibilita: 'studio_lettura' })
    const id = await creaCompito(db, A.admin, A.c2.id, null)
    await expect(carica(A.c1, id)).rejects.toThrow(/Non puoi/)
  })
})

describe('cestino dei clienti', () => {
  it('un cliente eliminato sparisce con i suoi compiti e si può ripristinare', async () => {
    const cliente = A.clienti.find((c) => c.referente === A.c1.id)!.id
    await creaCompito(db, A.admin, A.c1.id, cliente)
    await come(db, A.admin, (tx) => tx.query('select public.elimina_clienti($1::uuid[])', [[cliente]]))
    for (const p of [A.admin, A.c1]) {
      const c = await come(db, p, (tx) => righe(tx, 'select id from public.clienti where id = $1', [cliente]))
      expect(c).toHaveLength(0)
      const t = await come(db, p, (tx) => righe(tx, 'select id from public.compiti where cliente_id = $1', [cliente]))
      expect(t).toHaveLength(0)
    }
    const cestino = await come(db, A.admin, (tx) => righe(tx, 'select * from public.clienti_nel_cestino()'))
    expect(cestino).toHaveLength(1)
    expect(await come(db, A.c1, (tx) => righe(tx, 'select * from public.clienti_nel_cestino()'))).toHaveLength(0)
    await come(db, A.admin, (tx) => tx.query('select public.ripristina_cliente($1)', [cliente]))
    expect(await come(db, A.c1, (tx) => righe(tx, 'select id from public.compiti where cliente_id = $1', [cliente]))).toHaveLength(1)
  })
})

describe('indicatori e comunicazioni', () => {
  it('ogni modifica agli indicatori finisce nello storico con chi e valore precedente', async () => {
    const cliente = A.clienti[0].id
    await come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-07-31')`, [cliente]))
    await come(db, A.c1, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', '2026-08-31')`, [cliente]))
    await come(db, A.admin, (tx) => tx.query(`select public.imposta_indicatore($1, 'iva', null, true)`, [cliente]))
    const s = await come(db, A.c1, (tx) => righe<{ valore_precedente: string | null; valore_nuovo: string | null; na_nuovo: boolean; modificato_da: string }>(
      tx, `select valore_precedente::text, valore_nuovo::text, na_nuovo, modificato_da from public.aggiornamenti_storico
           where cliente_id = $1 order by modificato_il`, [cliente]))
    expect(s).toEqual([
      { valore_precedente: null, valore_nuovo: '2026-07-31', na_nuovo: false, modificato_da: A.c1.id },
      { valore_precedente: '2026-07-31', valore_nuovo: '2026-08-31', na_nuovo: false, modificato_da: A.c1.id },
      { valore_precedente: '2026-08-31', valore_nuovo: null, na_nuovo: true, modificato_da: A.admin.id },
    ])
  })

  it('una comunicazione manuale si scrive solo a proprio nome e non come email automatica', async () => {
    const cliente = A.clienti.find((c) => c.referente === A.c1.id)!.id
    const ins = (autore: string, fonte = 'manuale') =>
      come(db, A.c1, (tx) => tx.query(`insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id)
        values ($1, $2, now(), 'telefono', 'Ha chiamato per il 730', $3, $4)`, [A.id, cliente, fonte, autore]))
    await ins(A.c1.id)
    await expect(ins(A.admin.id)).rejects.toThrow()
    await expect(ins(A.c1.id, 'email_automatica')).rejects.toThrow()
    await expect(come(db, A.c1, (tx) => tx.query('delete from public.comunicazioni'))).rejects.toThrow(/permission denied/)
  })
})
