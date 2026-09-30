import { describe, expect, it } from 'vitest'
import {
  controllaRighe, dividiNomeCompleto, interpretaRuolo, leggiRighe, normalizza, riconosciColonne,
} from '@/lib/studio/importa'
import { preferenzeComplete, vuoleEmail } from '@/lib/studio/preferenze'
import { descriviAzione, descriviDettagli } from '@/lib/studio/registro'
import { emailNovita, emailRiepilogo, eOraDelRiepilogo } from '@/lib/studio/testi-email'
import { emailValida } from '@/lib/studio/testi'

describe('importazione collaboratori: riconoscimento delle colonne', () => {
  it('riconosce i nomi delle colonne senza badare a maiuscole, accenti e trattini', () => {
    expect(normalizza('  E-Mail ')).toBe('e mail')
    expect(riconosciColonne(['Nome', 'Cognome', 'E-mail', 'Ruolo'])).toEqual({ nome: 0, cognome: 1, email: 2, ruolo: 3 })
    expect(riconosciColonne(['COGNOME', 'nome', 'Indirizzo email', 'Qualifica'])).toEqual({ cognome: 0, nome: 1, email: 2, ruolo: 3 })
    expect(riconosciColonne(['Posta elettronica', 'Profilo', 'Nome'])).toEqual({ email: 0, ruolo: 1, nomeCompleto: 2 })
  })

  it('"Nome e cognome" in una colonna, oppure "Cognome e nome"', () => {
    expect(riconosciColonne(['Nome e cognome', 'Email'])).toEqual({ nomeCompleto: 0, email: 1 })
    expect(riconosciColonne(['Nominativo', 'Mail'])).toEqual({ nomeCompleto: 0, email: 1 })
    expect(riconosciColonne(['Cognome e nome', 'Email'])).toEqual({ nomeCompleto: 0, cognomePrima: true, email: 1 })
  })

  it('divide nome e cognome, anche con particelle e con la virgola', () => {
    expect(dividiNomeCompleto('Mario Rossi')).toEqual({ nome: 'Mario', cognome: 'Rossi' })
    expect(dividiNomeCompleto('Maria Grazia De Luca')).toEqual({ nome: 'Maria Grazia', cognome: 'De Luca' })
    expect(dividiNomeCompleto('Luca Dalla Chiesa')).toEqual({ nome: 'Luca', cognome: 'Dalla Chiesa' })
    expect(dividiNomeCompleto('Rossi, Mario')).toEqual({ nome: 'Mario', cognome: 'Rossi' })
    expect(dividiNomeCompleto('Rossi Mario', true)).toEqual({ nome: 'Mario', cognome: 'Rossi' })
    expect(dividiNomeCompleto('De Luca Anna', true)).toEqual({ nome: 'Anna', cognome: 'De Luca' })
    expect(dividiNomeCompleto('Cher')).toEqual({ nome: 'Cher', cognome: '' })
    expect(dividiNomeCompleto('  ')).toEqual({ nome: '', cognome: '' })
  })

  it('interpreta il ruolo; se non lo capisce usa collaboratore e lo segnala', () => {
    expect(interpretaRuolo('Amministratore')).toEqual({ ruolo: 'admin', dubbio: false })
    expect(interpretaRuolo('ADMIN')).toEqual({ ruolo: 'admin', dubbio: false })
    expect(interpretaRuolo('collaboratrice')).toEqual({ ruolo: 'collaboratore', dubbio: false })
    expect(interpretaRuolo('Amministratrice')).toEqual({ ruolo: 'admin', dubbio: false })
    expect(interpretaRuolo('Collaboratore')).toEqual({ ruolo: 'collaboratore', dubbio: false })
    expect(interpretaRuolo('')).toEqual({ ruolo: 'collaboratore', dubbio: false })
    expect(interpretaRuolo('stagista')).toEqual({ ruolo: 'collaboratore', dubbio: true })
  })

  it("trova l'intestazione anche sotto un titolo e salta le righe vuote", () => {
    const foglio = [
      ['Elenco collaboratori 2026', '', ''],
      [],
      ['Nome e cognome', 'E-mail', 'Ruolo'],
      ['Giulia Verdi', ' Giulia.Verdi@Esempio.it ', 'collaboratore'],
      ['', '', ''],
      ['Anna De Luca', 'mailto:anna@esempio.it', 'Admin'],
    ]
    const { righe, intestazione } = leggiRighe(foglio)
    expect(intestazione).toBe(2)
    expect(righe).toEqual([
      { chiave: 'r4', riga: 4, nome: 'Giulia', cognome: 'Verdi', email: 'giulia.verdi@esempio.it', ruolo: 'collaboratore' },
      { chiave: 'r6', riga: 6, nome: 'Anna', cognome: 'De Luca', email: 'anna@esempio.it', ruolo: 'admin' },
    ])
  })

  it('senza intestazione usa la colonna piena di indirizzi email', () => {
    const { righe } = leggiRighe([
      ['Marco Russo', 'marco@esempio.it'],
      ['Sofia Romano', 'sofia@esempio.it'],
    ])
    expect(righe.map((r) => [r.nome, r.cognome, r.email])).toEqual([
      ['Marco', 'Russo', 'marco@esempio.it'],
      ['Sofia', 'Romano', 'sofia@esempio.it'],
    ])
    expect(leggiRighe([['a', 'b'], ['c', 'd']]).righe).toEqual([])
  })

  it('segnala email non valide, nomi mancanti, doppioni, persone già nello studio o già invitate', () => {
    const righe = [
      { chiave: 'a', nome: 'Mario', email: 'mario@esempio.it' },
      { chiave: 'b', nome: 'Mario bis', email: 'MARIO@esempio.it' },
      { chiave: 'c', nome: 'Luca', email: 'luca@esempio' },
      { chiave: 'd', nome: '', email: 'senza.nome@esempio.it' },
      { chiave: 'e', nome: 'Giulia', email: 'giulia.verdi@studio-demo.it' },
      { chiave: 'f', nome: 'Paolo', email: 'paolo@esempio.it' },
      { chiave: 'g', nome: 'Vuoto', email: '' },
      { chiave: 'h', nome: 'Ok', email: 'ok@esempio.it' },
    ]
    const p = controllaRighe(righe, { emailStudio: ['giulia.verdi@studio-demo.it'], emailInvitate: ['Paolo@esempio.it'] })
    // la prima riga con l'indirizzo va bene, la ripetizione no
    expect(p.get('a')).toEqual([])
    expect(p.get('b')).toEqual(['doppione'])
    expect(p.get('c')).toEqual(['email_non_valida'])
    expect(p.get('d')).toEqual(['nome_mancante'])
    expect(p.get('e')).toEqual(['gia_presente'])
    expect(p.get('f')).toEqual(['gia_invitato'])
    expect(p.get('g')).toEqual(['email_mancante'])
    expect(p.get('h')).toEqual([])
  })

  it('valida le email con la stessa regola del database', () => {
    expect(emailValida('a@b.it')).toBe(true)
    expect(emailValida('a b@c.it')).toBe(false)
    expect(emailValida('a@b')).toBe(false)
  })
})

describe('preferenze delle email di notifica', () => {
  it('tutte attive di default; si spengono una per una', () => {
    expect(preferenzeComplete({})).toEqual({ assegnato: true, pronto: true, documenti: true, rimandato: true, commenti: true, scadenze: true })
    expect(preferenzeComplete({ commenti: false, scadenze: false }).commenti).toBe(false)
    expect(preferenzeComplete(null).scadenze).toBe(true)
    expect(vuoleEmail({ documenti: false }, 'documenti')).toBe(false)
    expect(vuoleEmail({}, 'assegnato')).toBe(true)
    // tipi senza email (per esempio "casella") non partono
    expect(vuoleEmail({}, 'casella')).toBe(false)
  })
})

describe('registro attività in italiano', () => {
  it('traduce le azioni, anche quelle nuove', () => {
    expect(descriviAzione('utente_disattivato')).toBe('Persona disattivata')
    expect(descriviAzione('qualcosa_di_nuovo')).toBe('Qualcosa di nuovo')
  })

  it('mostra prima e dopo e i nomi delle persone', () => {
    expect(descriviDettagli('impostazione_modificata', { campo: 'visibilita', prima: 'solo_propri', dopo: 'studio_lettura' }))
      .toEqual(['Visibilità tra collaboratori: Solo i propri → Tutto lo studio, in sola lettura'])
    expect(descriviDettagli('impostazione_modificata', { campo: 'lettura_email_attiva', prima: false, dopo: true }))
      .toEqual(['Lettura automatica delle email: spenta → attiva'])
    const nomi = new Map([['u1', 'Giulia Verdi'], ['u2', 'Marco Russo']])
    expect(descriviDettagli('accesso_concesso', { utente_id: 'u1', proprietario_id: 'u2', livello: 'completa' }, nomi))
      .toEqual(['Giulia Verdi → spazio di Marco Russo (può anche lavorarci)'])
    expect(descriviDettagli('ruolo_modificato', { prima: 'collaboratore', dopo: 'admin' })).toEqual(['Ruolo: Collaboratore → Admin'])
    expect(descriviDettagli('clienti_assegnati', { clienti: ['a', 'b'], numero: 2 })).toEqual(['2 clienti'])
  })
})

describe('email di notifica', () => {
  it('il riepilogo delle scadenze parte dalle 7 ora italiana (ora legale e solare)', () => {
    expect(eOraDelRiepilogo(new Date('2026-09-30T04:59:00Z'))).toBe(false) // 6:59 a Roma (CEST)
    expect(eOraDelRiepilogo(new Date('2026-09-30T05:00:00Z'))).toBe(true) // 7:00
    expect(eOraDelRiepilogo(new Date('2026-12-01T05:30:00Z'))).toBe(false) // 6:30 (CET)
    expect(eOraDelRiepilogo(new Date('2026-12-01T06:05:00Z'))).toBe(true) // 7:05
    expect(eOraDelRiepilogo(new Date('2026-12-01T09:00:00Z'))).toBe(false) // 10:00
  })

  it('una novità: oggetto con il titolo del compito e link alla sua scheda; testo escapato', () => {
    const e = emailNovita('Giulia', [
      { tipo: 'rimandato', compitoId: 'k1', titolo: 'Bilancio <2025>', frase: 'Nicolò ha rimandato indietro: Bilancio <2025>' },
    ], 'https://app.esempio.it')
    expect(e.oggetto).toBe('Compito rimandato indietro: Bilancio <2025>')
    expect(e.pulsante).toEqual({ testo: 'Apri il compito', url: 'https://app.esempio.it/compiti/k1' })
    expect(e.testo).toContain('Trovi la spiegazione nella scheda del compito.')
    expect(e.paragrafiHtml.join(' ')).toContain('Bilancio &lt;2025&gt;')
    expect(e.paragrafiHtml.join(' ')).not.toContain('<2025>')
  })

  it('più novità in una sola email', () => {
    const e = emailNovita('Marco', [
      { tipo: 'assegnato', compitoId: 'k1', titolo: 'A', frase: 'Giulia ti ha assegnato: A' },
      { tipo: 'commento', compitoId: 'k2', titolo: 'B', frase: 'Giulia ha scritto un commento in: B' },
    ], 'https://app.esempio.it')
    expect(e.oggetto).toBe('Hai 2 novità su BigBrotherStudio')
    expect(e.testo).toContain('https://app.esempio.it/compiti/k2')
  })

  it('il riepilogo raggruppa scaduti, oggi e domani; nessuna email se non c\'è nulla', () => {
    expect(emailRiepilogo('Sofia', '2026-09-30', [], 'https://x.it')).toBeNull()
    const e = emailRiepilogo('Sofia', '2026-09-30', [
      { id: '1', titolo: 'F24', scadenza: 'scadenza ieri', gruppo: 'scaduto' },
      { id: '2', titolo: 'Contratto', scadenza: 'scadenza oggi alle 17:00', gruppo: 'oggi' },
      { id: '3', titolo: 'Bilancio', scadenza: 'scadenza domani', gruppo: 'domani' },
    ], 'https://x.it')!
    expect(e.oggetto).toBe('Le tue scadenze del 30/09/2026 (1 in scadenza oggi, 1 scaduto)')
    expect(e.testo).toMatch(/Già scaduti \(1\)[\s\S]*Scadono oggi \(1\)[\s\S]*Scadono domani \(1\)/)
  })
})

describe('registro: dettagli generici', () => {
  it('confronta prima e dopo campo per campo e nasconde gli id', () => {
    expect(descriviDettagli('indicatore_aggiornato', {
      via: 'api', token: 'bbs_x', tipo: 'iva',
      prima: { non_applicabile: false, aggiornato_fino_al: '2026-03-31' },
      dopo: { non_applicabile: false, aggiornato_fino_al: '2026-08-31' },
    })).toEqual(['aggiornato fino al: 2026-03-31 → 2026-08-31', 'via: api', 'token: bbs_x', 'tipo: iva'])
  })
})
