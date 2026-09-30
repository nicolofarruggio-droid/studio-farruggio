// Analisi con l'AI del file dei clienti (sezioni 6 e 17): schema fisso della risposta, istruzioni,
// testo inviato all'AI e controllo del risultato. Funzioni pure (la chiamata è in analisi.ts, solo server).
import { z } from 'zod'
import { isoValida } from '@/lib/date'
import { riconosciColonne } from './intestazioni'
import {
  chiaveTesto, emailValida, estraiEmail, maiuscoleNome, normalizzaCodiceFiscale, normalizzaData, normalizzaImporto,
  normalizzaPartitaIva, normalizzaTelefono, pulisci, senzaAccenti, unisciEmail, type EmailImport, type Titolare,
} from './normalizza'
import { dedupTitolari, rigaDaMappatura, rigaSenzaDati, rigaVuota, type RigaFile, type RigaImport } from './righe'

/** Una riga del risultato dell'AI. Schema fisso: tutti i campi sempre presenti, null se non riconosciuti. */
export const schemaRigaAI = z.object({
  riga: z.number().int(),
  nome_azienda: z.string().nullable(),
  titolari: z.array(z.object({ nome: z.string().nullable(), cognome: z.string().nullable() })),
  email: z.array(z.object({ indirizzo: z.string(), tipo: z.enum(['ordinaria', 'pec']) })),
  ultimo_aggiornamento_prima_nota: z.string().nullable(),
  ultimo_aggiornamento_iva: z.string().nullable(),
  numero_dipendenti: z.number().int().nullable(),
  fatturato: z.number().nullable(),
  collaboratore: z.string().nullable(),
  partita_iva: z.string().nullable(),
  codice_fiscale: z.string().nullable(),
  telefono: z.string().nullable(),
})
export const schemaRispostaAI = z.object({ righe: z.array(schemaRigaAI) })
export type RigaAI = z.infer<typeof schemaRigaAI>

export const ISTRUZIONI_IMPORTAZIONE = `Ricevi un blocco di righe del file Excel o CSV con l'elenco dei clienti di uno studio.
Prima trovi l'intestazione del file, poi una riga per volta: ogni riga è un oggetto JSON con il numero della
riga nel file ("riga") e le celle non vuote, indicate con il nome della colonna.

Per OGNI riga ricevuta restituisci un elemento in "righe", nello stesso ordine e con lo stesso numero "riga".
Non aggiungere righe, non unire righe diverse e non spostare dati da una riga all'altra.

Campi di ogni riga:
- nome_azienda: la ragione sociale o denominazione dell'azienda, come è scritta nel file.
- titolari: le persone titolari o socie, con nome e cognome separati. Una cella come "Mario e Luca Rossi"
  sono due persone: Mario Rossi e Luca Rossi. Se c'è solo il cognome, nome è null. Nessuna persona: lista vuota.
- email: tutti gli indirizzi email della riga, anche più di uno nella stessa cella o in colonne diverse,
  PEC comprese. Copia ogni indirizzo esattamente come è scritto. tipo "pec" se è una PEC (colonna PEC o
  dominio di posta certificata), altrimenti "ordinaria".
- ultimo_aggiornamento_prima_nota e ultimo_aggiornamento_iva: la data fino a cui sono aggiornate la prima nota
  e l'IVA, nel formato AAAA-MM-GG. Le date del file sono all'italiana (giorno/mese/anno): 05/08/2026 è il
  5 agosto 2026. Se c'è solo mese e anno ("ago 2026", "08/2026", "2026-08") usa l'ultimo giorno del mese
  (2026-08-31). Le date già scritte come AAAA-MM-GG sono corrette così.
- numero_dipendenti: numero intero.
- fatturato: importo in euro come numero; il punto separa le migliaia e la virgola i decimali
  ("1.250.000 €" e "1.250.000,00" diventano 1250000).
- collaboratore: il nome del collaboratore o referente dello studio che segue il cliente, come è scritto nel file.
- partita_iva, codice_fiscale, telefono: come sono scritti nel file.

Regole: non inventare e non dedurre dati che non ci sono. Ogni dato assente, incerto o non riconoscibile è null
(o una lista vuota). Righe vuote, di titolo o di totale: tutti i campi null e liste vuote.`

/** Nomi delle colonne unici (le colonne senza nome diventano "Colonna C"). */
export function nomiColonne(intestazione: string[]): string[] {
  const visti = new Map<string, number>()
  return intestazione.map((h, i) => {
    let nome = pulisci(h) || `Colonna ${lettereColonna(i)}`
    const n = visti.get(nome.toLowerCase()) ?? 0
    visti.set(nome.toLowerCase(), n + 1)
    if (n) nome = `${nome} (${n + 1})`
    return nome
  })
}

export function lettereColonna(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Testo inviato all'AI: intestazione e una riga JSON per ogni riga del file (solo celle non vuote). */
export function testoPerAI(intestazione: string[], righe: RigaFile[]): string {
  const nomi = nomiColonne(intestazione)
  const linee = righe.map((r) => {
    const celle: Record<string, string> = {}
    r.celle.forEach((v, i) => {
      const t = (v ?? '').trim()
      if (t) celle[nomi[i] ?? `Colonna ${lettereColonna(i)}`] = t
    })
    return JSON.stringify({ riga: r.numero, celle })
  })
  return `Intestazione: ${JSON.stringify(nomi)}\n${linee.join('\n')}`
}

/**
 * Risposta simulata (AI_SIMULATA=1, sviluppo e test): i campi si ricavano dai nomi delle colonne,
 * come farebbe l'alternativa senza AI. Deterministica.
 */
export function simulaRisposta(intestazione: string[], righe: RigaFile[]): z.infer<typeof schemaRispostaAI> {
  const mappatura = riconosciColonne(intestazione)
  return {
    righe: righe.map((r) => {
      const x = rigaDaMappatura(r, mappatura) ?? rigaVuota(r.numero)
      return {
        riga: r.numero,
        nome_azienda: x.nome_azienda || null,
        titolari: x.titolari.map((t) => ({ nome: t.nome || null, cognome: t.cognome || null })),
        email: x.email,
        ultimo_aggiornamento_prima_nota: x.prima_nota,
        ultimo_aggiornamento_iva: x.iva,
        numero_dipendenti: x.numero_dipendenti,
        fatturato: x.fatturato,
        collaboratore: x.collaboratore_testo,
        partita_iva: x.partita_iva,
        codice_fiscale: x.codice_fiscale,
        telefono: x.telefono,
      }
    }),
  }
}

/** Il testo della risposta simulata a pezzi, una riga per volta, per far vedere l'avanzamento. */
export function pezziRisposta(dati: z.infer<typeof schemaRispostaAI>): string[] {
  if (!dati.righe.length) return ['{"righe":[]}']
  return dati.righe.map((r, i) => `${i === 0 ? '{"righe":[' : ','}${JSON.stringify(r)}${i === dati.righe.length - 1 ? ']}' : ''}`)
}

// ---------------------------------------------------------------------------
// Controllo del risultato: ogni dato deve essere ben formato e presente nella riga del file.
// ---------------------------------------------------------------------------

type TestiRiga = { parole: string; compatto: string; cifre: string; minuscolo: string }

function testiRiga(r: RigaFile): TestiRiga {
  const tutto = r.celle.filter(Boolean).join(' | ')
  return {
    parole: ` ${chiaveTesto(tutto)} `,
    compatto: senzaAccenti(tutto).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    cifre: tutto.replace(/[.\s'  ]/g, ''),
    minuscolo: tutto.toLowerCase(),
  }
}

/** Le parole significative del valore (tre o più caratteri) compaiono nella riga del file. */
function paroleNellaRiga(valore: string, t: TestiRiga): boolean {
  const parole = chiaveTesto(valore).split(' ').filter((w) => w.length >= 3 || /^\d+$/.test(w))
  const tutte = chiaveTesto(valore).split(' ').filter(Boolean)
  if (!tutte.length) return false
  // valori brevi ("Bo", "Li"): basta la parola intera
  if (!parole.length) return tutte.every((w) => t.parole.includes(` ${w} `))
  return parole.every((w) => t.parole.includes(w))
}

/** L'anno della data compare nella riga: scritto per intero, oppure letto da una cella con una data ("ago 26"). */
function annoNellaRiga(iso: string, t: TestiRiga, anniCelle: ReadonlySet<string>): boolean {
  const anno = iso.slice(0, 4)
  return anniCelle.has(anno) || new RegExp(`(^|\\D)${anno}(\\D|$)`).test(t.minuscolo)
}

/** Converte e controlla una riga dell'AI. I dati malformati o assenti dal file vengono scartati (null). */
export function validaRigaAI(ai: RigaAI, origine: RigaFile, intestazione: string[]): RigaImport {
  const t = testiRiga(origine)
  const out = rigaVuota(origine.numero)
  const scarta = (campo: string) => {
    if (!out.scartati.includes(campo)) out.scartati.push(campo)
  }

  const azienda = pulisci(ai.nome_azienda)
  if (azienda) {
    if (azienda.length <= 300 && paroleNellaRiga(azienda, t)) out.nome_azienda = azienda
    else scarta('ragione sociale')
  }

  const titolari: Titolare[] = []
  for (const p of ai.titolari.slice(0, 10)) {
    const nome = pulisci(p.nome).slice(0, 100)
    const cognome = pulisci(p.cognome).slice(0, 100)
    if (!nome && !cognome) continue
    if (paroleNellaRiga(`${nome} ${cognome}`, t)) titolari.push({ nome: maiuscoleNome(nome), cognome: maiuscoleNome(cognome) })
    else scarta('titolari')
  }
  out.titolari = dedupTitolari(titolari)

  // email: quelle dell'AI se ben formate e scritte nella riga, più tutte quelle trovate direttamente
  // nelle celle (un indirizzo email si riconosce con sicurezza anche senza AI)
  const colonnePec = new Set(intestazione.flatMap((h, i) => (/\bpec\b/.test(chiaveTesto(h)) ? [i] : [])))
  const dalleCelle = origine.celle.map((c, i) => estraiEmail(c, colonnePec.has(i)))
  const dallAI: EmailImport[] = []
  for (const e of ai.email.slice(0, 30)) {
    const indirizzo = e.indirizzo.trim().toLowerCase().replace(/^mailto:/, '')
    if (emailValida(indirizzo) && t.minuscolo.includes(indirizzo)) dallAI.push({ indirizzo, tipo: e.tipo })
    else if (!dalleCelle.some((d) => d.nonValide.some((x) => x.toLowerCase() === indirizzo))) scarta('email')
  }
  out.email = unisciEmail(dallAI, ...dalleCelle.map((d) => d.valide)).slice(0, 30)
  out.email_non_valide = [...new Set(dalleCelle.flatMap((d) => d.nonValide))]

  const anniCelle = new Set(origine.celle.map((c) => normalizzaData(c)?.slice(0, 4)).filter((a): a is string => Boolean(a)))
  for (const [campo, chiave, nome] of [
    ['ultimo_aggiornamento_prima_nota', 'prima_nota', 'prima nota'],
    ['ultimo_aggiornamento_iva', 'iva', 'IVA'],
  ] as const) {
    const v = ai[campo]?.trim()
    if (!v) continue
    const iso = isoValida(v) ? v : normalizzaData(v)
    if (iso && annoNellaRiga(iso, t, anniCelle)) out[chiave] = iso
    else scarta(`data ${nome}`)
  }

  // numeri: le cifre devono comparire nella riga (o l'importo si deve poter leggere da una cella)
  const importiCelle = origine.celle.map((c) => normalizzaImporto(c)).filter((n): n is number => n != null)
  if (ai.numero_dipendenti != null) {
    const n = ai.numero_dipendenti
    if (Number.isInteger(n) && n >= 0 && n <= 1_000_000 && (t.cifre.includes(String(n)) || importiCelle.includes(n))) out.numero_dipendenti = n
    else scarta('dipendenti')
  }
  if (ai.fatturato != null) {
    const f = Math.round(ai.fatturato * 100) / 100
    if (Number.isFinite(f) && f >= 0 && f <= 1e13 && (t.cifre.includes(String(Math.trunc(f))) || importiCelle.some((x) => Math.abs(x - f) < 0.01)))
      out.fatturato = f
    else scarta('fatturato')
  }

  const collaboratore = pulisci(ai.collaboratore).slice(0, 200)
  if (collaboratore) {
    if (paroleNellaRiga(collaboratore, t)) out.collaboratore_testo = collaboratore
    else scarta('collaboratore')
  }

  const piva = normalizzaPartitaIva(ai.partita_iva)
  if (piva) {
    if (t.compatto.includes(piva.replace(/^0+/, ''))) out.partita_iva = piva
    else scarta('partita IVA')
  }
  const cf = normalizzaCodiceFiscale(ai.codice_fiscale)
  if (cf) {
    if (t.compatto.includes(cf.replace(/^0+/, ''))) out.codice_fiscale = cf
    else scarta('codice fiscale')
  }
  const tel = normalizzaTelefono(ai.telefono)
  if (tel) {
    const cifre = tel.replace(/\D/g, '')
    if (cifre.length >= 3 && t.compatto.includes(cifre)) out.telefono = tel
    else scarta('telefono')
  }
  return out
}

/**
 * Controlla la risposta dell'AI per un blocco: righe del blocco (numero noto, una volta sola),
 * dati validi. Restituisce le righe con dati e i numeri delle righe vuote o mancanti.
 */
export function validaRisposta(
  risposta: z.infer<typeof schemaRispostaAI>,
  intestazione: string[],
  righe: RigaFile[],
): { righe: RigaImport[]; vuote: number[]; mancanti: number[] } {
  const perNumero = new Map(righe.map((r) => [r.numero, r]))
  const fatte = new Set<number>()
  const out: RigaImport[] = []
  const vuote: number[] = []
  for (const ai of risposta.righe) {
    const origine = perNumero.get(ai.riga)
    if (!origine || fatte.has(ai.riga)) continue
    fatte.add(ai.riga)
    const r = validaRigaAI(ai, origine, intestazione)
    if (rigaSenzaDati(r)) vuote.push(r.riga)
    else out.push(r)
  }
  return { righe: out, vuote, mancanti: righe.filter((r) => !fatte.has(r.numero)).map((r) => r.numero) }
}
