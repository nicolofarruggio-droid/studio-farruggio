// Importazione dei clienti (sezione 6): normalizzazione, colonne, abbinamenti, controllo del risultato
// dell'AI, doppioni, lettura dei file e prova di carico con 400 righe.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as XLSX from '@e965/xlsx'
import {
  dataDaExcel, dividiTitolari, estraiEmail, normalizzaData, normalizzaImporto, normalizzaIntero, normalizzaPartitaIva,
  titolariDaTesto,
} from '@/lib/importazione/normalizza'
import { campoDaIntestazione, riconosciColonne, trovaIntestazione } from '@/lib/importazione/intestazioni'
import {
  abbinaCollaboratore, esaminaRiga, giaPresente, indiceEsistenti, rigaDaMappatura, rigaVuota, trovaDoppioni, type RigaFile,
} from '@/lib/importazione/righe'
import {
  pezziRisposta, schemaRispostaAI, simulaRisposta, testoPerAI, validaRigaAI, validaRisposta, type RigaAI,
} from '@/lib/importazione/risultato-ai'
import { EstrattoreOggetti } from '@/lib/importazione/flusso-json'
import { formatoSoloMese, leggiCartella, leggiFoglio } from '@/lib/importazione/file'
import { candidatiCliente, indiceClienti, riconosciColonneAssegnazioni } from '@/lib/importazione/assegnazioni'
import { controllaRiga } from '@/lib/importazione/scrittura'
import { fileCarico, fileEsempio, INTESTAZIONE } from '../fixtures/clienti'

const buffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

describe('date', () => {
  it("date all'italiana: prima il giorno", () => {
    expect(normalizzaData('31/08/2026')).toBe('2026-08-31')
    expect(normalizzaData('05/08/2026')).toBe('2026-08-05')
    expect(normalizzaData('5-8-26')).toBe('2026-08-05')
    expect(normalizzaData('05.08.2026')).toBe('2026-08-05')
    expect(normalizzaData('31 agosto 2026')).toBe('2026-08-31')
    expect(normalizzaData('2026-08-15')).toBe('2026-08-15')
    expect(normalizzaData('2026-08-15T00:00:00')).toBe('2026-08-15')
  })
  it('solo mese e anno: ultimo giorno del mese', () => {
    expect(normalizzaData('ago 2026')).toBe('2026-08-31')
    expect(normalizzaData('Agosto 2026')).toBe('2026-08-31')
    expect(normalizzaData('ago. 26')).toBe('2026-08-31')
    expect(normalizzaData('08/2026')).toBe('2026-08-31')
    expect(normalizzaData('2/2028')).toBe('2028-02-29')
    expect(normalizzaData('2026-06')).toBe('2026-06-30')
    expect(normalizzaData('febbraio 2027')).toBe('2027-02-28')
    expect(normalizzaData('aggiornata a luglio 2026')).toBe('2026-07-31')
  })
  it('date non valide o incomplete: null, mai inventate', () => {
    expect(normalizzaData('31/02/2026')).toBeNull()
    expect(normalizzaData('13/13/2026')).toBeNull()
    expect(normalizzaData('2026')).toBeNull()
    expect(normalizzaData('boh')).toBeNull()
    expect(normalizzaData('')).toBeNull()
    expect(normalizzaData(null)).toBeNull()
  })
  it('date di Excel: oggetti Date (UTC) e numeri di serie', () => {
    expect(dataDaExcel(new Date(Date.UTC(2026, 7, 31)))).toBe('2026-08-31')
    expect(dataDaExcel(new Date(Date.UTC(2026, 7, 30, 23, 59, 59, 999)))).toBe('2026-08-31')
    expect(dataDaExcel(new Date(Date.UTC(2026, 7, 1)), true)).toBe('2026-08')
    expect(normalizzaData(new Date(Date.UTC(2026, 6, 31)))).toBe('2026-07-31')
    expect(normalizzaData(46265)).toBe('2026-08-31')
    expect(normalizzaData('46265')).toBe('2026-08-31')
  })
  it('formato di cella con solo mese e anno', () => {
    expect(formatoSoloMese('mmm yyyy')).toBe(true)
    expect(formatoSoloMese('[$-410]mmmm\\ yyyy')).toBe(true)
    expect(formatoSoloMese('mm/yyyy')).toBe(true)
    expect(formatoSoloMese('dd/mm/yyyy')).toBe(false)
    expect(formatoSoloMese('d"/"mmmm"/"yyyy')).toBe(false)
    expect(formatoSoloMese('h:mm')).toBe(false)
  })
})

describe('importi e numeri', () => {
  it('importi in euro', () => {
    expect(normalizzaImporto('1.250.000 €')).toBe(1250000)
    expect(normalizzaImporto('1.250.000,00')).toBe(1250000)
    expect(normalizzaImporto('1250000')).toBe(1250000)
    expect(normalizzaImporto('€ 1.250.000,50')).toBe(1250000.5)
    expect(normalizzaImporto('1,250,000.00')).toBe(1250000)
    expect(normalizzaImporto('1.250')).toBe(1250)
    expect(normalizzaImporto('12,5')).toBe(12.5)
    expect(normalizzaImporto('1250.5')).toBe(1250.5)
    expect(normalizzaImporto('1 250 000 €')).toBe(1250000)
    expect(normalizzaImporto('1,5 mln')).toBe(1500000)
    expect(normalizzaImporto('180 mila')).toBe(180000)
    expect(normalizzaImporto(1250000.456)).toBe(1250000.46)
    expect(normalizzaImporto('1250000,5')).toBe(1250000.5) // numero di Excel convertito in testo
  })
  it('importi non riconosciuti o negativi: null', () => {
    expect(normalizzaImporto('n.d.')).toBeNull()
    expect(normalizzaImporto('-5.000')).toBeNull()
    expect(normalizzaImporto('')).toBeNull()
    expect(normalizzaImporto(-1)).toBeNull()
  })
  it('numero di dipendenti intero', () => {
    expect(normalizzaIntero('12')).toBe(12)
    expect(normalizzaIntero('12 dipendenti')).toBe(12)
    expect(normalizzaIntero('circa 7')).toBe(7)
    expect(normalizzaIntero(4)).toBe(4)
    expect(normalizzaIntero('nessuno')).toBe(0)
    expect(normalizzaIntero('10-15')).toBeNull()
    expect(normalizzaIntero('3,5')).toBeNull()
  })
  it('partita IVA: senza IT, zeri iniziali persi da Excel ripristinati', () => {
    expect(normalizzaPartitaIva('IT 01234567897')).toBe('01234567897')
    expect(normalizzaPartitaIva(3456789012)).toBe('03456789012')
    expect(normalizzaPartitaIva('0123.456.7897')).toBe('01234567897')
  })
})

describe('email', () => {
  it('più indirizzi in una cella, con separatori diversi', () => {
    const r = estraiEmail('a@uno.it; B@Due.it, c@tre.it d@quattro.it / e@cinque.it\nf@sei.it')
    expect(r.valide.map((e) => e.indirizzo)).toEqual(['a@uno.it', 'b@due.it', 'c@tre.it', 'd@quattro.it', 'e@cinque.it', 'f@sei.it'])
    expect(r.nonValide).toEqual([])
  })
  it('nome e indirizzo, mailto e doppioni', () => {
    expect(estraiEmail('Mario Rossi <mario@x.it>').valide).toEqual([{ indirizzo: 'mario@x.it', tipo: 'ordinaria' }])
    expect(estraiEmail('mailto:mario@x.it; MARIO@x.it').valide).toHaveLength(1)
  })
  it('PEC: dal dominio o dalla colonna', () => {
    expect(estraiEmail('studio@pec.esempio.it').valide[0].tipo).toBe('pec')
    expect(estraiEmail('ditta@legalmail.it').valide[0].tipo).toBe('pec')
    expect(estraiEmail('ditta@postacert.example').valide[0].tipo).toBe('pec')
    expect(estraiEmail('ditta@esempio.it', true).valide[0].tipo).toBe('pec')
    expect(estraiEmail('ditta@esempio.it').valide[0].tipo).toBe('ordinaria')
  })
  it('indirizzi non validi segnalati, non scartati in silenzio', () => {
    const r = estraiEmail('mario@gmail; buona@esempio.it; x@@y.it; .a@b.it')
    expect(r.valide.map((e) => e.indirizzo)).toEqual(['buona@esempio.it'])
    expect(r.nonValide).toEqual(['mario@gmail', 'x@@y.it', '.a@b.it'])
  })
})

describe('titolari', () => {
  it('"Mario e Luca Rossi" sono due persone', () => {
    expect(dividiTitolari('Mario e Luca Rossi')).toEqual([
      { nome: 'Mario', cognome: 'Rossi' },
      { nome: 'Luca', cognome: 'Rossi' },
    ])
  })
  it('elenchi, maiuscole, titoli e particelle', () => {
    expect(dividiTitolari('Mario Rossi, Anna Bianchi')).toEqual([
      { nome: 'Mario', cognome: 'Rossi' },
      { nome: 'Anna', cognome: 'Bianchi' },
    ])
    expect(dividiTitolari('MARIA GRAZIA DE LUCA')).toEqual([{ nome: 'Maria Grazia', cognome: 'De Luca' }])
    expect(dividiTitolari('Dott.ssa Giulia Ferri')).toEqual([{ nome: 'Giulia', cognome: 'Ferri' }])
    expect(dividiTitolari("Enzo D'Agosta")).toEqual([{ nome: 'Enzo', cognome: "D'Agosta" }])
    expect(dividiTitolari('Franco Riva; Laura Riva')).toHaveLength(2)
    expect(dividiTitolari('Marta Conti e Luigi Pace')).toEqual([
      { nome: 'Marta', cognome: 'Conti' },
      { nome: 'Luigi', cognome: 'Pace' },
    ])
    expect(dividiTitolari('Rossi')).toEqual([{ nome: '', cognome: 'Rossi' }])
    expect(dividiTitolari('')).toEqual([])
    expect(dividiTitolari('12345')).toEqual([])
  })
  it('ordine cognome e nome', () => {
    expect(dividiTitolari('Rossi Mario e Luca', 'cognome_nome')).toEqual([
      { nome: 'Mario', cognome: 'Rossi' },
      { nome: 'Luca', cognome: 'Rossi' },
    ])
    expect(dividiTitolari('De Luca Anna', 'cognome_nome')).toEqual([{ nome: 'Anna', cognome: 'De Luca' }])
  })
  it("campo dell'anteprima: persone separate da punto e virgola", () => {
    expect(titolariDaTesto('Mario Rossi; Luca Rossi; mario rossi')).toEqual([
      { nome: 'Mario', cognome: 'Rossi' },
      { nome: 'Luca', cognome: 'Rossi' },
    ])
  })
})

describe('intestazioni', () => {
  it('riconosce le colonne dai nomi', () => {
    expect(riconosciColonne(INTESTAZIONE)).toEqual([
      'nome_azienda', 'titolari', 'email', 'pec', 'prima_nota', 'iva', 'numero_dipendenti', 'fatturato',
      'collaboratore', 'partita_iva', 'codice_fiscale', 'telefono', null,
    ])
    const altre = ['Denominazione', 'Nome', 'Cognome', 'Posta elettronica', 'Email PEC', 'Ultimo aggiornamento IVA', 'Data prima nota',
      'Volume d\'affari', 'Referente', 'Partita I.V.A.', 'C.F.', 'Cellulare', 'Addetti']
    expect(riconosciColonne(altre)).toEqual([
      'nome_azienda', 'nome_titolare', 'cognome_titolare', 'email', 'pec', 'iva', 'prima_nota', 'fatturato', 'collaboratore',
      'partita_iva', 'codice_fiscale', 'telefono', 'numero_dipendenti',
    ])
  })
  it('"Nome" senza "Cognome" è il nome completo; un campo singolo non si ripete', () => {
    expect(riconosciColonne(['Azienda', 'Nome'])).toEqual(['nome_azienda', 'titolari'])
    expect(riconosciColonne(['Ragione sociale', 'Denominazione', 'Email', 'Email 2'])).toEqual(['nome_azienda', null, 'email', 'email'])
    expect(campoDaIntestazione('Cognome e nome')).toBe('titolari_cognome_nome')
    expect(campoDaIntestazione('Note')).toBeNull()
  })
  it("trova l'intestazione anche sotto un titolo", () => {
    expect(trovaIntestazione([['Elenco clienti 2026'], [], INTESTAZIONE, ['Alfa S.r.l.', 'Mario Rossi']])).toBe(2)
    expect(trovaIntestazione([['Colonna uno', 'Colonna due'], ['1', '2']])).toBe(0)
  })
})

describe('riconoscimento senza AI', () => {
  const mappatura = riconosciColonne(INTESTAZIONE)
  const riga = (celle: string[]): RigaFile => ({ numero: 4, celle })
  it('riga completa, normalizzata', () => {
    const r = rigaDaMappatura(
      riga(['Alfa S.r.l.', 'Mario e Luca Rossi', 'a@alfa.it; b@alfa.it', 'alfa@pec.it', '31/08/2026', 'ago 2026', '12', '1.250.000 €', 'Giulia Verdi', 'IT01234567897', 'rssmra70a01f205x', '0521 123456', 'nota']),
      mappatura,
    )!
    expect(r).toMatchObject({
      riga: 4,
      nome_azienda: 'Alfa S.r.l.',
      titolari: [{ nome: 'Mario', cognome: 'Rossi' }, { nome: 'Luca', cognome: 'Rossi' }],
      email: [{ indirizzo: 'a@alfa.it', tipo: 'ordinaria' }, { indirizzo: 'b@alfa.it', tipo: 'ordinaria' }, { indirizzo: 'alfa@pec.it', tipo: 'pec' }],
      prima_nota: '2026-08-31',
      iva: '2026-08-31',
      numero_dipendenti: 12,
      fatturato: 1250000,
      collaboratore_testo: 'Giulia Verdi',
      partita_iva: '01234567897',
      codice_fiscale: 'RSSMRA70A01F205X',
      telefono: '0521 123456',
    })
  })
  it('righe di totale o vuote: nessun cliente', () => {
    expect(rigaDaMappatura(riga(['Totale', '', '', '', '', '', '250', '27000000']), mappatura)).toBeNull()
    expect(rigaDaMappatura(riga(['', '', '', '', '', '', '', '', 'Giulia Verdi']), mappatura)).toBeNull()
  })
})

describe('abbinamento dei collaboratori', () => {
  const persone = [
    { id: 'g', nome: 'Giulia', cognome: 'Verdi' },
    { id: 'm', nome: 'Marco', cognome: 'Russo' },
    { id: 's', nome: 'Sofia', cognome: 'Romano' },
    { id: 'n', nome: 'Nicolò', cognome: 'Farruggio' },
    { id: 'b', nome: 'Marco', cognome: 'Bianchi' },
  ]
  it('per nome e cognome, in qualsiasi ordine, senza maiuscole e accenti', () => {
    expect(abbinaCollaboratore('Giulia Verdi', persone)).toBe('g')
    expect(abbinaCollaboratore('verdi giulia', persone)).toBe('g')
    expect(abbinaCollaboratore('  VERDI  ', persone)).toBe('g')
    expect(abbinaCollaboratore('Nicolo Farruggio', persone)).toBe('n')
    expect(abbinaCollaboratore('Farruggio Nicolò', persone)).toBe('n')
    expect(abbinaCollaboratore('G. Verdi', persone)).toBe('g')
    expect(abbinaCollaboratore('Russo M.', persone)).toBe('m')
    expect(abbinaCollaboratore('giulia.verdi@studio.example', persone)).toBe('g')
    expect(abbinaCollaboratore('Sofia', persone)).toBe('s')
  })
  it('non trovato o ambiguo: nessun abbinamento', () => {
    expect(abbinaCollaboratore('Marco', persone)).toBeNull()
    expect(abbinaCollaboratore('Luca Neri', persone)).toBeNull()
    expect(abbinaCollaboratore('', persone)).toBeNull()
    expect(abbinaCollaboratore(null, persone)).toBeNull()
  })
})

describe("controllo del risultato dell'AI", () => {
  const intestazione = ['Ragione sociale', 'Titolare', 'Email', 'PEC', 'Prima nota', 'IVA', 'Dipendenti', 'Fatturato', 'Collaboratore', 'P.IVA']
  const origine: RigaFile = {
    numero: 7,
    celle: ['Alfa Impianti S.r.l.', 'MARIO E LUCA BELLINI', 'info@alfa.example; mario@gmail', 'alfa@legalmail.example', '31/08/2026', 'ago 2026', '12', '1.250.000 €', 'Giulia Verdi', '01234567897'],
  }
  const base: RigaAI = {
    riga: 7, nome_azienda: 'Alfa Impianti S.r.l.', titolari: [{ nome: 'MARIO', cognome: 'BELLINI' }, { nome: 'Luca', cognome: 'Bellini' }],
    email: [{ indirizzo: 'info@alfa.example', tipo: 'ordinaria' }, { indirizzo: 'alfa@legalmail.example', tipo: 'pec' }],
    ultimo_aggiornamento_prima_nota: '2026-08-31', ultimo_aggiornamento_iva: '2026-08-31', numero_dipendenti: 12, fatturato: 1250000,
    collaboratore: 'Giulia Verdi', partita_iva: '01234567897', codice_fiscale: null, telefono: null,
  }
  it('dati corretti accettati e normalizzati', () => {
    const r = validaRigaAI(base, origine, intestazione)
    expect(r).toMatchObject({
      nome_azienda: 'Alfa Impianti S.r.l.', prima_nota: '2026-08-31', iva: '2026-08-31', numero_dipendenti: 12, fatturato: 1250000,
      collaboratore_testo: 'Giulia Verdi', partita_iva: '01234567897', scartati: [],
    })
    expect(r.titolari).toEqual([{ nome: 'Mario', cognome: 'Bellini' }, { nome: 'Luca', cognome: 'Bellini' }])
    expect(r.email).toEqual([{ indirizzo: 'info@alfa.example', tipo: 'ordinaria' }, { indirizzo: 'alfa@legalmail.example', tipo: 'pec' }])
    // l'email malformata del file resta segnalata come errore anche se l'AI l'ha ignorata
    expect(r.email_non_valide).toEqual(['mario@gmail'])
  })
  it('dati inventati (non presenti nella riga) scartati', () => {
    const r = validaRigaAI(
      {
        ...base,
        nome_azienda: 'Beta Costruzioni S.p.A.',
        titolari: [{ nome: 'Giovanni', cognome: 'Verga' }],
        email: [{ indirizzo: 'amministrazione@alfa.example', tipo: 'ordinaria' }],
        numero_dipendenti: 99,
        fatturato: 3000000,
        collaboratore: 'Marco Russo',
        partita_iva: '09876543210',
        codice_fiscale: 'RSSMRA70A01F205X',
        telefono: '06 1234567',
      },
      origine,
      intestazione,
    )
    expect(r.nome_azienda).toBe('')
    expect(r.titolari).toEqual([])
    expect(r.email.map((e) => e.indirizzo)).toEqual(['info@alfa.example', 'alfa@legalmail.example']) // quelle vere, lette dalle celle
    expect(r.numero_dipendenti).toBeNull()
    expect(r.fatturato).toBeNull()
    expect(r.collaboratore_testo).toBeNull()
    expect(r.partita_iva).toBeNull()
    expect(r.codice_fiscale).toBeNull()
    expect(r.telefono).toBeNull()
    expect(r.scartati).toEqual(expect.arrayContaining(['ragione sociale', 'titolari', 'email', 'dipendenti', 'fatturato', 'collaboratore', 'partita IVA', 'codice fiscale', 'telefono']))
  })
  it('dati malformati scartati', () => {
    const r = validaRigaAI(
      { ...base, ultimo_aggiornamento_prima_nota: '2026-13-45', ultimo_aggiornamento_iva: '2031-08-31', numero_dipendenti: -3, fatturato: -10 },
      origine,
      intestazione,
    )
    expect(r.prima_nota).toBeNull()
    expect(r.iva).toBeNull() // anno assente dalla riga
    expect(r.numero_dipendenti).toBeNull()
    expect(r.fatturato).toBeNull()
    expect(r.scartati).toEqual(expect.arrayContaining(['data prima nota', 'data IVA', 'dipendenti', 'fatturato']))
  })
  it('campi in più nella risposta ignorati dallo schema fisso', () => {
    const p = schemaRispostaAI.parse({ righe: [{ ...base, note_segrete: 'x', stato: 'aggiornato' }] })
    expect(Object.keys(p.righe[0])).not.toContain('note_segrete')
  })
  it('blocco: righe sconosciute o ripetute ignorate, mancanti e vuote riportate', () => {
    const righe: RigaFile[] = [origine, { numero: 8, celle: ['', '', '', '', '', '', '', '', '', ''] }, { numero: 9, celle: ['Gamma', '', '', '', '', '', '', '', '', ''] }]
    const vuota: RigaAI = { ...base, riga: 8, nome_azienda: null, titolari: [], email: [], ultimo_aggiornamento_prima_nota: null, ultimo_aggiornamento_iva: null, numero_dipendenti: null, fatturato: null, collaboratore: null, partita_iva: null }
    const v = validaRisposta({ righe: [base, { ...base, riga: 99 }, { ...base, riga: 7, nome_azienda: 'Doppione' }, vuota] }, intestazione, righe)
    expect(v.righe.map((r) => r.riga)).toEqual([7])
    expect(v.righe[0].nome_azienda).toBe('Alfa Impianti S.r.l.')
    expect(v.vuote).toEqual([8])
    expect(v.mancanti).toEqual([9])
  })
})

describe('AI simulata e lettura dello stream', () => {
  const intestazione = INTESTAZIONE
  const righe: RigaFile[] = [
    { numero: 2, celle: ['Alfa S.r.l.', 'Mario e Luca Rossi', 'a@alfa.it', '', '31/08/2026', 'ago 2026', '3', '1.250.000 €', 'Giulia Verdi', '', '', '', 'Contiene "virgolette" e {graffe}'] },
    { numero: 3, celle: ['Beta', 'Anna Neri', 'anna@beta.it', 'beta@pec.it', '', '', '', '', '', '', '', '', ''] },
  ]
  it('la risposta simulata rispetta lo schema e supera i controlli', () => {
    const sim = schemaRispostaAI.parse(simulaRisposta(intestazione, righe))
    const v = validaRisposta(sim, intestazione, righe)
    expect(v.righe).toHaveLength(2)
    expect(v.righe[0]).toMatchObject({ nome_azienda: 'Alfa S.r.l.', prima_nota: '2026-08-31', fatturato: 1250000, scartati: [] })
    expect(v.righe[1].email).toEqual([{ indirizzo: 'anna@beta.it', tipo: 'ordinaria' }, { indirizzo: 'beta@pec.it', tipo: 'pec' }])
  })
  it('i pezzi di testo ricompongono il JSON e le righe si contano mentre arrivano', () => {
    const sim = simulaRisposta(intestazione, righe)
    const pezzi = pezziRisposta(sim)
    expect(JSON.parse(pezzi.join(''))).toEqual(sim)
    // stesso testo spezzato a caso, anche dentro le stringhe
    const testo = JSON.stringify({ righe: [...sim.righe, { ...sim.righe[0], riga: 4, nome_azienda: 'Con \\"virgolette\\" } e { ] [' }] })
    const e = new EstrattoreOggetti()
    const trovati: string[] = []
    let conteggi: number[] = []
    for (let i = 0; i < testo.length; i += 7) {
      trovati.push(...e.aggiungi(testo.slice(i, i + 7)))
      conteggi.push(e.numero)
    }
    expect(trovati.map((t) => JSON.parse(t).riga)).toEqual([2, 3, 4])
    expect(trovati[2]).toBe(JSON.stringify({ ...sim.righe[0], riga: 4, nome_azienda: 'Con \\"virgolette\\" } e { ] [' }))
    conteggi = [...new Set(conteggi)]
    expect(conteggi).toEqual([0, 1, 2, 3])
  })
  it("il testo per l'AI contiene intestazione e celle non vuote, con il numero di riga", () => {
    const t = testoPerAI(['Ragione sociale', '', 'Ragione sociale'], [{ numero: 5, celle: ['Alfa', 'x', ''] }])
    expect(t).toContain('Intestazione: ["Ragione sociale","Colonna B","Ragione sociale (2)"]')
    expect(t).toContain('{"riga":5,"celle":{"Ragione sociale":"Alfa","Colonna B":"x"}}')
  })
})

describe('doppioni, clienti già presenti e segnalazioni', () => {
  const righe = [
    { ...rigaVuota(2), nome_azienda: 'Alfa Impianti S.r.l.' },
    { ...rigaVuota(3), nome_azienda: 'ALFA IMPIANTI SRL' },
    { ...rigaVuota(4), nome_azienda: 'Beta', partita_iva: '01234567897' },
    { ...rigaVuota(5), nome_azienda: 'Beta Due', partita_iva: 'IT01234567897' },
    { ...rigaVuota(6), nome_azienda: 'Gamma' },
  ]
  it('doppioni nel file per ragione sociale (senza forma societaria) o partita IVA', () => {
    const d = trovaDoppioni(righe)
    expect(d.get(2)).toEqual([3])
    expect(d.get(3)).toEqual([2])
    expect(d.get(4)).toEqual([5])
    expect(d.has(6)).toBe(false)
  })
  it('clienti già presenti nello studio', () => {
    const indice = indiceEsistenti([
      { id: '1', ragione_sociale: 'Gamma S.r.l.', nome_visualizzazione: 'Gamma — Anna Neri', partita_iva: null },
      { id: '2', ragione_sociale: 'Altro nome', nome_visualizzazione: 'Altro', partita_iva: '01234567897' },
    ])
    expect(giaPresente(righe[4], indice)?.id).toBe('1')
    expect(giaPresente(righe[2], indice)?.id).toBe('2')
    expect(giaPresente(righe[0], indice)).toBeNull()
  })
  it('errori, avvisi e campi da completare', () => {
    const e = esaminaRiga({ ...rigaVuota(9), email_non_valide: ['x@y'], collaboratore_testo: 'Luca Neri' }, { collaboratoreNonTrovato: true })
    expect(e.errori).toBe(2)
    expect(e.segnalazioni.map((s) => s.testo)).toEqual([
      'Ragione sociale mancante',
      'Email non valida: x@y',
      'Titolare mancante',
      'Collaboratore "Luca Neri" non trovato tra gli utenti dello studio',
    ])
    expect(e.daCompletare).toEqual(['prima nota', 'IVA', 'dipendenti', 'fatturato', 'collaboratore'])
    const ok = esaminaRiga({
      ...rigaVuota(10), nome_azienda: 'Alfa', titolari: [{ nome: 'Anna', cognome: 'Neri' }], email: [{ indirizzo: 'a@b.it', tipo: 'ordinaria' }],
      prima_nota: '2026-08-31', iva: '2026-08-31', numero_dipendenti: 0, fatturato: 0, collaboratore_id: 'x',
    })
    expect(ok).toEqual({ segnalazioni: [], daCompletare: [], errori: 0, avvisi: 0 })
  })
})

describe('conferma: controllo delle righe sul server', () => {
  const buona = {
    riga: 3, nome_azienda: '  Alfa  S.r.l. ', titolari: [{ nome: 'Anna', cognome: 'Neri' }, { nome: '', cognome: '' }],
    email: [{ indirizzo: 'A@Alfa.it', tipo: 'ordinaria' }, { indirizzo: 'a@alfa.it', tipo: 'ordinaria' }, { indirizzo: 'alfa@pec.alfa.it', tipo: 'ordinaria' }],
    prima_nota: '2026-08-31', iva: null, numero_dipendenti: 3, fatturato: 1250000.456, collaboratore_id: null,
    partita_iva: '01234567897', codice_fiscale: 'rssmra70a01f205x', telefono: null,
  }
  it('righe valide ripulite', () => {
    const r = controllaRiga(buona)
    expect(r.ok && r.riga).toMatchObject({
      ragione_sociale: 'Alfa S.r.l.',
      titolari: [{ nome: 'Anna', cognome: 'Neri' }],
      email: [{ indirizzo: 'a@alfa.it', tipo: 'ordinaria' }, { indirizzo: 'alfa@pec.alfa.it', tipo: 'pec' }],
      fatturato: 1250000.46,
      codice_fiscale: 'RSSMRA70A01F205X',
    })
  })
  it('righe con errori saltate con il motivo', () => {
    expect(controllaRiga({ ...buona, nome_azienda: ' ' })).toEqual({ ok: false, saltata: { riga: 3, motivo: 'Ragione sociale mancante' } })
    expect(controllaRiga({ ...buona, email: [{ indirizzo: 'x@y', tipo: 'ordinaria' }] })).toMatchObject({ ok: false, saltata: { motivo: 'Email non valida: x@y' } })
    expect(controllaRiga({ ...buona, prima_nota: '31/08/2026' })).toMatchObject({ ok: false, saltata: { motivo: 'Data prima nota non valida' } })
    expect(controllaRiga({ ...buona, numero_dipendenti: 2.5 })).toMatchObject({ ok: false })
    expect(controllaRiga({ riga: 4 })).toMatchObject({ ok: false, saltata: { riga: 4, motivo: 'Dati della riga non validi' } })
  })
})

describe('assegnazioni da file', () => {
  const clienti = [
    { id: '1', ragione_sociale: 'Auto Shop S.r.l.', nome_visualizzazione: "Auto Shop — Enzo D'Agosta", partita_iva: '01234560011' },
    { id: '2', ragione_sociale: 'Auto Shop Due S.r.l.', nome_visualizzazione: "Auto Shop Due — Enzo D'Agosta", partita_iva: null },
    { id: '3', ragione_sociale: 'Bar Centrale', nome_visualizzazione: 'Bar Centrale — Paolo Neri', partita_iva: null },
    { id: '4', ragione_sociale: 'Bar Centrale S.n.c.', nome_visualizzazione: 'Bar Centrale — Luca Neri', partita_iva: null },
  ]
  const indice = indiceClienti(clienti)
  it('cliente per partita IVA, nome di visualizzazione o ragione sociale', () => {
    expect(candidatiCliente('', 'IT01234560011', indice).map((c) => c.id)).toEqual(['1'])
    expect(candidatiCliente("auto shop due — enzo d'agosta", null, indice).map((c) => c.id)).toEqual(['2'])
    expect(candidatiCliente('AUTO SHOP SRL', null, indice).map((c) => c.id)).toEqual(['1'])
    expect(candidatiCliente('Bar Centrale', null, indice).map((c) => c.id)).toEqual(['3', '4']) // da scegliere
    expect(candidatiCliente('Inesistente', null, indice)).toEqual([])
  })
  it('colonne riconosciute dai nomi', () => {
    expect(riconosciColonneAssegnazioni(['Cliente', 'Partita IVA', 'Collaboratore assegnato'])).toEqual({ cliente: 0, partitaIva: 1, collaboratore: 2 })
    expect(riconosciColonneAssegnazioni(['Ragione sociale', 'Referente'])).toEqual({ cliente: 0, partitaIva: null, collaboratore: 1 })
  })
})

describe('lettura dei file', () => {
  it('xlsx: date vere di Excel, formato "mmm yyyy", numeri con la virgola', async () => {
    const ws: XLSX.WorkSheet = {
      A1: { t: 's', v: 'Ragione sociale' }, B1: { t: 's', v: 'Prima nota' }, C1: { t: 's', v: 'IVA' }, D1: { t: 's', v: 'Fatturato' },
      A2: { t: 's', v: 'Alfa' }, B2: { t: 'n', v: 46265, z: 'dd/mm/yyyy' }, C2: { t: 'n', v: 46235, z: 'mmm yyyy' }, D2: { t: 'n', v: 1250000.5, z: '#,##0.00 €' },
      '!ref': 'A1:D2',
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Foglio1')
    for (const tipo of ['xlsx', 'biff8', 'ods'] as const) {
      const dati = XLSX.write(wb, { type: 'array', bookType: tipo }) as ArrayBuffer
      const c = await leggiCartella(dati, `prova.${tipo === 'biff8' ? 'xls' : tipo}`)
      const f = await leggiFoglio(c, c.fogli[0])
      expect(f.righe[1]).toEqual({ numero: 2, celle: ['Alfa', '2026-08-31', '2026-08', '1250000,5'] })
      expect(normalizzaData(f.righe[1].celle[2])).toBe('2026-08-31')
    }
  })
  it('csv: testo senza interpretare le date, punto e virgola, Windows-1252', async () => {
    const testo = 'Ragione sociale;Prima nota;Fatturato\r\nCaffè Aurora;08/09/2026;1.250.000,00\r\n'
    const cp1252 = Uint8Array.from([...testo].map((ch) => (ch === 'è' ? 0xe8 : ch.charCodeAt(0))))
    const c = await leggiCartella(buffer(cp1252), 'prova.csv')
    const f = await leggiFoglio(c, c.fogli[0])
    expect(f.righe[1].celle).toEqual(['Caffè Aurora', '08/09/2026', '1.250.000,00'])
    expect(normalizzaData(f.righe[1].celle[1])).toBe('2026-09-08') // 8 settembre, non 9 agosto
  })
  it('formato non supportato', async () => {
    await expect(leggiCartella(new ArrayBuffer(4), 'clienti.pdf')).rejects.toThrow(/Formato non supportato/)
  })
  it('file di prova: 30 righe con formati misti', async () => {
    const dati = readFileSync(path.join(import.meta.dirname, '../fixtures/clienti-esempio.xlsx'))
    const c = await leggiCartella(buffer(dati), 'clienti-esempio.xlsx')
    expect(c.fogli).toEqual(['Clienti', 'Note'])
    const f = await leggiFoglio(c, 'Clienti')
    const i = trovaIntestazione(f.righe.map((r) => r.celle))
    expect(f.righe[i].numero).toBe(3)
    const dati30 = f.righe.slice(i + 1)
    expect(dati30).toHaveLength(30)
    const m = riconosciColonne(f.righe[i].celle)
    const righe = dati30.map((r) => rigaDaMappatura(r, m)).filter((r) => r != null)
    expect(righe).toHaveLength(29) // la riga "Totale" non è un cliente
    const alfa = righe[0]
    expect(alfa).toMatchObject({ nome_azienda: 'Alfa Impianti S.r.l.', prima_nota: '2026-08-31', iva: '2026-08-31', numero_dipendenti: 12, fatturato: 1250000 })
    expect(alfa.email).toHaveLength(3)
    expect(righe[2]).toMatchObject({ nome_azienda: 'Caffè Aurora S.n.c.', prima_nota: '2026-06-30', partita_iva: '03456789012', fatturato: 95500 })
    expect(righe.find((r) => r.nome_azienda.startsWith('Agenzia'))?.fatturato).toBe(1200000)
    // il file di prova è sempre quello generato dallo script
    expect(Buffer.from(fileEsempio()).length).toBeGreaterThan(5000)
  })
})

describe('prova di carico: 400 righe', () => {
  it('lettura, riconoscimento, AI simulata e controlli in tempi brevi', async () => {
    const inizio = performance.now()
    const c = await leggiCartella(buffer(fileCarico(400)), 'clienti-400.xlsx')
    const f = await leggiFoglio(c, c.fogli[0])
    const i = trovaIntestazione(f.righe.map((r) => r.celle))
    const dati = f.righe.slice(i + 1)
    expect(dati).toHaveLength(400)
    const intestazione = f.righe[i].celle
    // AI simulata a blocchi da 60 righe, come fa il server
    const righe = []
    for (let k = 0; k < dati.length; k += 60) {
      const blocco = dati.slice(k, k + 60)
      const sim = schemaRispostaAI.parse(simulaRisposta(intestazione, blocco))
      const testo = pezziRisposta(sim).join('')
      const v = validaRisposta(schemaRispostaAI.parse(JSON.parse(testo)), intestazione, blocco)
      expect(v.mancanti).toEqual([])
      righe.push(...v.righe)
    }
    expect(righe).toHaveLength(400)
    expect(righe.every((r) => r.nome_azienda && r.email.length && r.scartati.length === 0)).toBe(true)
    const persone = [{ id: 'g', nome: 'Giulia', cognome: 'Verdi' }, { id: 'm', nome: 'Marco', cognome: 'Russo' }, { id: 's', nome: 'Sofia', cognome: 'Romano' }]
    const abbinati = righe.filter((r) => abbinaCollaboratore(r.collaboratore_testo, persone)).length
    expect(abbinati).toBe(righe.filter((r) => r.collaboratore_testo).length)
    const doppioni = trovaDoppioni(righe)
    expect(doppioni.size).toBe(0)
    righe.forEach((r) => esaminaRiga(r, { doppioni }))
    expect(righe.filter((r) => controllaRiga({ ...r, collaboratore_id: null }).ok)).toHaveLength(400)
    expect(performance.now() - inizio).toBeLessThan(5000)
  })
})
