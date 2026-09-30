// Riconoscimento delle colonne dai nomi dell'intestazione: l'alternativa senza AI (sezione 6).
import { chiaveTesto } from './normalizza'

export const CAMPI_COLONNA = {
  nome_azienda: 'Ragione sociale',
  titolari: 'Titolari (nome e cognome)',
  titolari_cognome_nome: 'Titolari (cognome e nome)',
  nome_titolare: 'Nome del titolare',
  cognome_titolare: 'Cognome del titolare',
  email: 'Email',
  pec: 'PEC',
  prima_nota: 'Ultimo aggiornamento prima nota',
  iva: 'Ultimo aggiornamento IVA',
  numero_dipendenti: 'Numero di dipendenti',
  fatturato: 'Fatturato (€)',
  collaboratore: 'Collaboratore dello studio',
  partita_iva: 'Partita IVA',
  codice_fiscale: 'Codice fiscale',
  telefono: 'Telefono',
} as const

export type CampoColonna = keyof typeof CAMPI_COLONNA
/** Per ogni colonna del file, il campo in cui va (null = colonna ignorata). */
export type Mappatura = (CampoColonna | null)[]

/** Campi che possono venire da più colonne (si uniscono). */
export const CAMPI_MULTIPLI: ReadonlySet<CampoColonna> = new Set(['email', 'pec', 'titolari', 'titolari_cognome_nome'])

// L'ordine conta: "Partita IVA" prima di "IVA", "Nome azienda" prima di "Nome", "PEC" prima di "Email".
const REGOLE: [CampoColonna, RegExp][] = [
  ['partita_iva', /\b(partita iva|partita i v a|p iva|piva|p i v a|vat)\b/],
  ['codice_fiscale', /\b(codice fiscale|cod fiscale|cod fisc|c f|cf)\b/],
  ['pec', /\b(pec|posta certificata|posta elettronica certificata)\b/],
  ['email', /\b(e ?mail|mail|posta elettronica|posta|indirizzi email)\b/],
  ['prima_nota', /\b(prima nota|p n|pn|contabilita|registrazioni contabili)\b/],
  ['iva', /\b(iva|liquidazion[ei]|registri iva)\b/],
  ['fatturato', /\b(fatturato|volume d ?affari|volume di affari|ricavi|giro d ?affari|vda)\b/],
  ['collaboratore', /\b(collaborator[ei]|referente|referente studio|addetto|responsabile|seguito da|operatore|assegnat[oa]|incaricat[oa]|gestito da|consulente)\b/],
  ['numero_dipendenti', /\b(dipendent[ei]|n dip|addetti|organico|personale)\b/],
  ['telefono', /\b(telefono|telefoni|tel|cellulare|cell|mobile|recapito telefonico)\b/],
  ['nome_azienda', /\b(ragione sociale|rag soc|ragione|azienda|denominazione|ditta|societa|impresa)\b/],
  ['titolari_cognome_nome', /\bcognome (e )?nome\b/],
  ['titolari', /\b(nome (e )?cognome|titolar[ei]|legale rappresentante|rappresentante|soci|socio|nominativo|cliente|clienti|contatto)\b/],
  ['cognome_titolare', /^cognome( titolare)?$/],
  ['nome_titolare', /^nome( titolare)?$/],
]

export function campoDaIntestazione(intestazione: string): CampoColonna | null {
  const h = chiaveTesto(intestazione)
  if (!h) return null
  for (const [campo, re] of REGOLE) if (re.test(h)) return campo
  return null
}

/** Mappatura proposta dai nomi dell'intestazione; l'admin la può correggere a mano. */
export function riconosciColonne(intestazione: string[]): Mappatura {
  const usati = new Set<CampoColonna>()
  const m: Mappatura = intestazione.map((h) => {
    const c = campoDaIntestazione(h)
    if (!c) return null
    if (usati.has(c) && !CAMPI_MULTIPLI.has(c)) return null
    usati.add(c)
    return c
  })
  // "Nome" senza una colonna "Cognome": è il nome completo del titolare
  if (usati.has('nome_titolare') && !usati.has('cognome_titolare')) {
    return m.map((c) => (c === 'nome_titolare' ? 'titolari' : c))
  }
  return m
}

/** Quante colonne di una riga sembrano un'intestazione conosciuta. */
function punteggioIntestazione(celle: string[]): number {
  return celle.filter((c) => c && c.length <= 60 && campoDaIntestazione(c)).length
}

/**
 * Riga di intestazione fra le prime righe del file: quella con più nomi di colonna riconosciuti
 * (così un titolo sopra la tabella non viene scambiato per l'intestazione). Indice nell'elenco.
 */
export function trovaIntestazione(righe: string[][]): number {
  let migliore = -1
  let punti = 0
  for (let i = 0; i < Math.min(righe.length, 15); i++) {
    const p = punteggioIntestazione(righe[i])
    if (p > punti) {
      punti = p
      migliore = i
    }
  }
  if (migliore >= 0) return migliore
  // nessun nome riconosciuto: la prima riga con almeno due celle di testo
  const i = righe.findIndex((r) => r.filter((c) => c && !/^[\d\s.,€/-]+$/.test(c)).length >= 2)
  return i >= 0 ? i : 0
}
