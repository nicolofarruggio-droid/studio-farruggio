// Testi delle email di notifica (sezione 8). Solo logica pura, senza invio.
// Regola: niente contenuto dei documenti né testo di commenti e spiegazioni, solo il riferimento
// al compito (titolo) e il link alla sua scheda.
import { partiRoma } from '@/lib/date'

export type ElementoNovita = {
  tipo: 'assegnato' | 'pronto' | 'documenti' | 'rimandato' | 'commento'
  compitoId: string | null
  titolo: string | null
  /** frase già pronta, senza contenuti riservati (es. "Giulia Verdi ti ha assegnato: Bilancio 2025") */
  frase: string
}

export type CompitoRiepilogo = {
  id: string
  titolo: string
  /** descrizione leggibile della scadenza, es. "oggi alle 17:00" */
  scadenza: string
  gruppo: 'scaduto' | 'oggi' | 'domani' | 'assegnato_scaduto'
}

export type PezziEmail = {
  oggetto: string
  titolo: string
  testo: string
  paragrafiHtml: string[]
  pulsante?: { testo: string; url: string }
  nota: string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Il riepilogo delle scadenze parte una volta al giorno dalle 7 (ora italiana); fino alle 10 si recupera un ritardo del cron. */
export function eOraDelRiepilogo(adesso: Date = new Date()): boolean {
  const { ora } = partiRoma(adesso)
  return ora >= 7 && ora < 10
}

const OGGETTI: Record<ElementoNovita['tipo'], string> = {
  assegnato: 'Nuovo compito',
  pronto: 'Compito pronto per revisione',
  documenti: 'Nuovi documenti',
  rimandato: 'Compito rimandato indietro',
  commento: 'Nuovo commento',
}

const AGGIUNTE: Partial<Record<ElementoNovita['tipo'], string>> = {
  rimandato: 'Trovi la spiegazione nella scheda del compito.',
  commento: 'Leggilo nella scheda del compito.',
}

function notaPiede(sito: string) {
  return `Per riservatezza questa email non contiene documenti né testi dei commenti: li trovi nel gestionale. Scegli quali email ricevere dal tuo profilo: ${sito}/profilo`
}

const tronca = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Una sola email per persona con tutte le novità arrivate dall'ultimo invio. */
export function emailNovita(nome: string, elementi: ElementoNovita[], sito: string): PezziEmail {
  const link = (e: ElementoNovita) => (e.compitoId ? `${sito}/compiti/${e.compitoId}` : `${sito}/dashboard`)
  const frase = (e: ElementoNovita) => {
    const aggiunta = AGGIUNTE[e.tipo]
    if (!aggiunta) return e.frase
    return /[.!?…]$/.test(e.frase.trim()) ? `${e.frase.trim()} ${aggiunta}` : `${e.frase.trim()}. ${aggiunta}`
  }
  if (elementi.length === 1) {
    const e = elementi[0]
    return {
      oggetto: e.titolo ? `${OGGETTI[e.tipo]}: ${tronca(e.titolo)}` : OGGETTI[e.tipo],
      titolo: OGGETTI[e.tipo],
      testo: `Ciao ${nome},\n\n${frase(e)}\n\nApri il compito: ${link(e)}\n\n${notaPiede(sito)}`,
      paragrafiHtml: [`Ciao ${esc(nome)},`, esc(frase(e))],
      pulsante: { testo: e.compitoId ? 'Apri il compito' : 'Apri BigBrotherStudio', url: link(e) },
      nota: esc(notaPiede(sito)),
    }
  }
  return {
    oggetto: `Hai ${elementi.length} novità su BigBrotherStudio`,
    titolo: `${elementi.length} novità sui tuoi compiti`,
    testo: `Ciao ${nome},\n\n${elementi.map((e) => `- ${frase(e)}\n  ${link(e)}`).join('\n')}\n\n${notaPiede(sito)}`,
    paragrafiHtml: [
      `Ciao ${esc(nome)}, ecco le novità:`,
      ...elementi.map(
        (e) => `• ${esc(frase(e))}<br><a href="${esc(link(e))}" style="color:#2f3a8f">Apri il compito</a>`,
      ),
    ],
    pulsante: { testo: 'Apri BigBrotherStudio', url: `${sito}/dashboard` },
    nota: esc(notaPiede(sito)),
  }
}

const TITOLI_GRUPPI: Record<CompitoRiepilogo['gruppo'], string> = {
  scaduto: 'Già scaduti',
  oggi: 'Scadono oggi',
  domani: 'Scadono domani',
  assegnato_scaduto: 'Compiti che hai assegnato ad altri, scaduti',
}

/** Riepilogo del mattino: scadenze di oggi e domani e compiti scaduti. `null` se non c'è nulla da dire. */
export function emailRiepilogo(nome: string, giorno: string, compiti: CompitoRiepilogo[], sito: string): PezziEmail | null {
  if (compiti.length === 0) return null
  const gruppi = (Object.keys(TITOLI_GRUPPI) as CompitoRiepilogo['gruppo'][])
    .map((g) => ({ g, elenco: compiti.filter((c) => c.gruppo === g) }))
    .filter((x) => x.elenco.length > 0)
  const [a, m, g] = giorno.split('-')
  const data = `${g}/${m}/${a}`
  const scaduti = compiti.filter((c) => c.gruppo === 'scaduto').length
  const oggi = compiti.filter((c) => c.gruppo === 'oggi').length
  const parti = [oggi ? `${oggi} in scadenza oggi` : '', scaduti ? `${scaduti} ${scaduti === 1 ? 'scaduto' : 'scaduti'}` : '']
    .filter(Boolean)
    .join(', ')
  return {
    oggetto: `Le tue scadenze del ${data}${parti ? ` (${parti})` : ''}`,
    titolo: `Le tue scadenze del ${data}`,
    testo: `Ciao ${nome},\n\n${gruppi
      .map((x) => `${TITOLI_GRUPPI[x.g]} (${x.elenco.length}):\n${x.elenco.map((c) => `- ${c.titolo} — ${c.scadenza}\n  ${sito}/compiti/${c.id}`).join('\n')}`)
      .join('\n\n')}\n\nTutti i tuoi compiti: ${sito}/compiti\n\n${notaPiede(sito)}`,
    paragrafiHtml: [
      `Ciao ${esc(nome)}, ecco il riepilogo delle tue scadenze.`,
      ...gruppi.map(
        (x) =>
          `<strong>${esc(TITOLI_GRUPPI[x.g])} (${x.elenco.length})</strong><br>${x.elenco
            .map((c) => `• <a href="${esc(`${sito}/compiti/${c.id}`)}" style="color:#2f3a8f">${esc(c.titolo)}</a> — ${esc(c.scadenza)}`)
            .join('<br>')}`,
      ),
    ],
    pulsante: { testo: 'Apri i tuoi compiti', url: `${sito}/compiti` },
    nota: esc(notaPiede(sito)),
  }
}
