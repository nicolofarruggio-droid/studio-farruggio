// Scrittura dei clienti importati e delle assegnazioni da file (sezione 6), sul database vero in memoria:
// valgono RLS, trigger dello storico e funzioni SQL dei permessi.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { come, creaStudio, nuovoDb, righe, type Studio, type Tx } from './helpers'
import { scriviAssegnazioni, scriviClienti, type Esegui, type RigaPronta } from '@/lib/importazione/scrittura'

let db: PGlite
let A: Studio
let B: Studio

beforeEach(async () => {
  db = await nuovoDb()
  A = await creaStudio(db, 'Studio A')
  B = await creaStudio(db, 'Studio B')
})

const esecutore = (tx: Tx): Esegui => async (sql, parametri) => (await tx.query(sql, parametri ?? [])).rows as never

/** Come conUtente(persona, fn, { origine: 'importazione' }). */
function comeImportazione<T>(p: { id: string; email: string }, fn: (e: Esegui) => Promise<T>) {
  return come(db, p, async (tx) => {
    await tx.query(`select set_config('app.origine', 'importazione', true)`)
    return fn(esecutore(tx))
  })
}

const riga = (n: number, r: Partial<RigaPronta>): RigaPronta => ({
  riga: n, ragione_sociale: `Cliente ${n}`, titolari: [], email: [], prima_nota: null, iva: null, numero_dipendenti: null,
  fatturato: null, collaboratore_id: null, partita_iva: null, codice_fiscale: null, telefono: null, ...r,
})

describe('importazione dei clienti', () => {
  it("l'admin importa: anagrafica, titolari, email, indicatori nello storico, referente e registro", async () => {
    const collaboratori = new Set([A.admin.id, A.c1.id, A.c2.id, A.c3.id])
    const r = await comeImportazione(A.admin, (e) =>
      scriviClienti(
        e,
        [
          riga(2, {
            ragione_sociale: 'Alfa Impianti S.r.l.',
            titolari: [{ nome: 'Mario', cognome: 'Bellini' }, { nome: 'Luca', cognome: 'Bellini' }],
            email: [{ indirizzo: 'info@alfa.example', tipo: 'ordinaria' }, { indirizzo: 'alfa@pec.example', tipo: 'pec' }],
            prima_nota: '2026-08-31', iva: '2026-07-31', numero_dipendenti: 12, fatturato: 1250000.5,
            collaboratore_id: A.c1.id, partita_iva: '01234567897', telefono: '0521 123456',
          }),
          riga(3, { ragione_sociale: 'Beta', collaboratore_id: A.c1.id }),
          riga(4, { ragione_sociale: 'Gamma', collaboratore_id: A.c2.id, prima_nota: '2026-06-30' }),
          riga(5, { ragione_sociale: 'Delta', collaboratore_id: B.c1.id }), // collaboratore di un altro studio: ignorato
        ],
        { collaboratori, dettagliRegistro: { nome_file: 'clienti.xlsx' } },
      ),
    )
    expect(r.importate.map((x) => x.nome)).toEqual(['Alfa Impianti — Mario Bellini', 'Beta', 'Gamma', 'Delta'])
    expect(r.senzaCollaboratore).toEqual([5])
    const alfa = r.importate[0].id

    const [c] = await righe(db, `select * from public.clienti where id = $1`, [alfa])
    expect(c).toMatchObject({ studio_id: A.id, ragione_sociale: 'Alfa Impianti S.r.l.', numero_dipendenti: 12, partita_iva: '01234567897', creato_da: A.admin.id })
    expect(Number(c.fatturato)).toBe(1250000.5)
    expect(await righe(db, `select nome, cognome, principale from public.clienti_titolari where cliente_id = $1 order by ordine`, [alfa])).toEqual([
      { nome: 'Mario', cognome: 'Bellini', principale: true },
      { nome: 'Luca', cognome: 'Bellini', principale: false },
    ])
    expect(await righe(db, `select indirizzo, tipo from public.clienti_email where cliente_id = $1 order by indirizzo`, [alfa])).toEqual([
      { indirizzo: 'alfa@pec.example', tipo: 'pec' },
      { indirizzo: 'info@alfa.example', tipo: 'ordinaria' },
    ])
    // le date entrano nello storico come valore iniziale, con origine "importazione"
    const storico = await righe(db, `select tipo, valore_precedente, valore_nuovo::text, origine, modificato_da from public.aggiornamenti_storico where cliente_id = $1 order by tipo`, [alfa])
    expect(storico).toEqual([
      { tipo: 'iva', valore_precedente: null, valore_nuovo: '2026-07-31', origine: 'importazione', modificato_da: A.admin.id },
      { tipo: 'prima_nota', valore_precedente: null, valore_nuovo: '2026-08-31', origine: 'importazione', modificato_da: A.admin.id },
    ])
    const referenti = await righe<{ cliente_id: string; utente_id: string }>(db,
      `select cliente_id, utente_id from public.assegnazioni where al is null and referente_principale and cliente_id = any($1::uuid[])`,
      [r.importate.map((x) => x.id)])
    expect(referenti).toHaveLength(3)
    expect(referenti.find((x) => x.cliente_id === alfa)?.utente_id).toBe(A.c1.id)
    const registro = await righe<{ azione: string; dettagli: Record<string, unknown> }>(db,
      `select azione, dettagli from public.registro_attivita where studio_id = $1 and azione in ('clienti_importati', 'clienti_assegnati') order by azione`, [A.id])
    expect(registro.map((x) => x.azione)).toEqual(['clienti_assegnati', 'clienti_assegnati', 'clienti_importati'])
    expect(registro[2].dettagli).toMatchObject({ numero: 4, nome_file: 'clienti.xlsx' })
    // il collaboratore vede i clienti che gli sono stati assegnati
    const visti = await come(db, A.c1, (tx) => righe<{ ragione_sociale: string }>(tx, `select ragione_sociale from public.clienti where ragione_sociale in ('Alfa Impianti S.r.l.', 'Beta', 'Gamma')`))
    expect(visti.map((x) => x.ragione_sociale).sort()).toEqual(['Alfa Impianti S.r.l.', 'Beta'])
  })

  it('nome di visualizzazione unico, anche rispetto ai clienti nel cestino', async () => {
    await righe(db, `update public.clienti set eliminato_il = now() where id = $1`, [A.clienti[0].id])
    const r = await comeImportazione(A.admin, (e) =>
      scriviClienti(e, [riga(2, { ragione_sociale: A.clienti[0].nome }), riga(3, { ragione_sociale: A.clienti[1].nome }), riga(4, { ragione_sociale: A.clienti[1].nome })], {
        collaboratori: new Set(),
        dettagliRegistro: {},
      }),
    )
    expect(r.importate.map((x) => x.nome)).toEqual([`${A.clienti[0].nome} (2)`, `${A.clienti[1].nome} (2)`, `${A.clienti[1].nome} (3)`])
  })

  it('un collaboratore non può importare clienti', async () => {
    await expect(
      comeImportazione(A.c1, (e) => scriviClienti(e, [riga(2, {})], { collaboratori: new Set(), dettagliRegistro: {} })),
    ).rejects.toThrow()
    expect(await righe(db, `select 1 from public.clienti where ragione_sociale = 'Cliente 2'`)).toHaveLength(0)
  })

  it("un admin non può assegnare i clienti importati a un utente di un altro studio", async () => {
    await expect(
      comeImportazione(A.admin, (e) => scriviClienti(e, [riga(2, { collaboratore_id: B.c1.id })], { collaboratori: new Set([B.c1.id]), dettagliRegistro: {} })),
    ).rejects.toThrow(/Collaboratore non trovato/)
    // la transazione del blocco è annullata per intero
    expect(await righe(db, `select 1 from public.clienti where ragione_sociale = 'Cliente 2'`)).toHaveLength(0)
  })
})

describe('importazione delle assegnazioni', () => {
  it('cambia il referente conservando lo storico e salta le coppie già in essere', async () => {
    const [x, y] = A.clienti // x → c1, y → c1
    const r = await come(db, A.admin, (tx) =>
      scriviAssegnazioni(esecutore(tx), [
        { cliente_id: x.id, utente_id: A.c2.id },
        { cliente_id: y.id, utente_id: A.c1.id }, // già così
      ], { nome_file: 'assegnazioni.csv' }),
    )
    expect(r).toEqual({ assegnate: 1, invariate: 1 })
    const storia = await righe<{ utente_id: string; al: unknown }>(db, `select utente_id, al from public.assegnazioni where cliente_id = $1 order by dal`, [x.id])
    expect(storia).toHaveLength(2)
    expect(storia[0]).toMatchObject({ utente_id: A.c1.id })
    expect(storia[0].al).not.toBeNull()
    expect(storia[1]).toMatchObject({ utente_id: A.c2.id, al: null })
    expect(await righe(db, `select 1 from public.registro_attivita where azione = 'assegnazioni_importate' and studio_id = $1`, [A.id])).toHaveLength(1)
  })

  it('non tocca i clienti di un altro studio né passa da un collaboratore', async () => {
    await expect(
      come(db, A.admin, (tx) => scriviAssegnazioni(esecutore(tx), [{ cliente_id: B.clienti[0].id, utente_id: A.c1.id }], {})),
    ).rejects.toThrow(/Cliente non trovato/)
    await expect(
      come(db, A.c1, (tx) => scriviAssegnazioni(esecutore(tx), [{ cliente_id: A.clienti[2].id, utente_id: A.c1.id }], {})),
    ).rejects.toThrow(/Solo gli admin/)
  })
})
