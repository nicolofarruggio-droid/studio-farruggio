// Registro attività: azioni tradotte in italiano leggibile e dettagli "prima → dopo" (sezioni 11 e 13.4).
import { etichettaCreazione, etichettaLivello, etichettaRuolo, etichettaVisibilita } from './testi'

export const AZIONI: Record<string, string> = {
  studio_registrato: 'Studio registrato',
  impostazione_modificata: 'Impostazione dello studio modificata',
  invito_creato: 'Invito mandato',
  invito_rinnovato: 'Invito rinviato',
  invito_annullato: 'Invito annullato',
  invito_accettato: 'Invito accettato',
  ruolo_modificato: 'Ruolo cambiato',
  utente_disattivato: 'Persona disattivata',
  utente_riattivato: 'Persona riattivata',
  accesso_concesso: 'Accesso tra colleghi concesso',
  accesso_revocato: 'Accesso tra colleghi tolto',
  clienti_assegnati: 'Clienti assegnati',
  collaboratore_aggiunto: 'Collaboratore aggiunto a un cliente',
  collaboratore_tolto: 'Collaboratore tolto da un cliente',
  clienti_eliminati: 'Clienti spostati nel cestino',
  cliente_ripristinato: 'Cliente ripristinato dal cestino',
  clienti_importati: 'Clienti importati',
  assegnazioni_importate: 'Assegnazioni importate',
  cliente_eliminato_definitivamente: 'Cliente eliminato definitivamente',
  email_cliente_aggiunta: 'Indirizzo email del cliente aggiunto',
  email_cliente_rimossa: 'Indirizzo email del cliente tolto',
  esportazione_clienti: 'Esportazione dell\'elenco clienti',
  mittente_collegato: 'Mittente collegato a un cliente',
  azione_annullata: 'Modifica annullata',
  indicatore_aggiornato: 'Indicatore aggiornato',
  compito_creato: 'Compito creato',
  compito_stato_cambiato: 'Stato del compito cambiato',
  commento_aggiunto: 'Commento aggiunto',
  documento_caricato: 'Documento caricato',
  cliente_creato: 'Cliente creato',
  cliente_modificato: 'Cliente modificato',
  cliente_archiviato: 'Cliente archiviato',
  agente_creato: 'Account agente creato',
  permessi_agente_modificati: 'Permessi dell\'agente cambiati',
  token_agente_creato: 'Token API creato',
  token_agente_revocato: 'Token API revocato',
  proposta_creata: 'Proposta dell\'agente in attesa',
  proposta_approvata: 'Proposta dell\'agente approvata',
  proposta_rifiutata: 'Proposta dell\'agente rifiutata',
  proposta_fallita: 'Proposta dell\'agente non riuscita',
  esportazione_dati: 'Esportazione dei dati dello studio',
  due_passaggi_attivata: 'Verifica in due passaggi attivata',
  due_passaggi_disattivata: 'Verifica in due passaggi disattivata',
  due_passaggi_tolta: 'Verifica in due passaggi tolta da un admin',
  casella_collegata: 'Casella email collegata',
  casella_scollegata: 'Casella email scollegata',
  annullamento: 'Modifica annullata',
}

/** "clienti_importati" → "Clienti importati" anche per le azioni che non conosciamo ancora. */
export function descriviAzione(azione: string): string {
  if (AZIONI[azione]) return AZIONI[azione]
  const t = azione.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const ENTITA: Record<string, string> = {
  studio: 'Studio',
  utente: 'Persona',
  invito: 'Invito',
  accesso_collega: 'Accesso tra colleghi',
  cliente: 'Cliente',
  compito: 'Compito',
  proposta: 'Proposta',
  casella: 'Casella email',
}

export const descriviEntita = (e: string | null) => (e ? ENTITA[e] ?? e : '')

const CAMPI_STUDIO: Record<string, string> = {
  visibilita: 'Visibilità tra collaboratori',
  creazione_compiti: 'Chi può creare compiti',
  soglia_ritardo_iva_mesi: 'Soglia di ritardo IVA',
  soglia_ritardo_prima_nota_mesi: 'Soglia di ritardo prima nota',
  lettura_email_attiva: 'Lettura automatica delle email',
  nome: 'Nome dello studio',
}

function valoreCampo(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '(vuoto)'
  if (campo === 'visibilita') return etichettaVisibilita(String(v))
  if (campo === 'creazione_compiti') return etichettaCreazione(String(v))
  if (campo === 'lettura_email_attiva') return v === true ? 'attiva' : 'spenta'
  if (campo.startsWith('soglia_')) return `${v} ${Number(v) === 1 ? 'mese' : 'mesi'}`
  return String(v)
}

function breve(v: unknown): string {
  if (v === null || v === undefined) return '(vuoto)'
  if (typeof v === 'boolean') return v ? 'sì' : 'no'
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return t.length > 120 ? t.slice(0, 119) + '…' : t
}

/**
 * Righe leggibili dei dettagli di un'attività. `nomi` traduce gli id delle persone in nomi.
 * Esempio: impostazione_modificata → "Visibilità tra collaboratori: Solo i propri → Tutto lo studio, in sola lettura".
 */
export function descriviDettagli(azione: string, dettagli: Record<string, unknown> | null, nomi: Map<string, string> = new Map()): string[] {
  const d = dettagli ?? {}
  const nome = (id: unknown) => (typeof id === 'string' ? nomi.get(id) ?? 'persona non più presente' : '')
  switch (azione) {
    case 'impostazione_modificata': {
      const campo = String(d.campo ?? '')
      return [`${CAMPI_STUDIO[campo] ?? campo}: ${valoreCampo(campo, d.prima)} → ${valoreCampo(campo, d.dopo)}`]
    }
    case 'ruolo_modificato':
      return [`Ruolo: ${etichettaRuolo(String(d.prima ?? ''))} → ${etichettaRuolo(String(d.dopo ?? ''))}`]
    case 'invito_creato':
      return [`${d.email ?? ''} come ${etichettaRuolo(String(d.ruolo ?? '')).toLowerCase()}`]
    case 'invito_accettato':
      return d.email ? [String(d.email)] : []
    case 'accesso_concesso':
    case 'accesso_revocato':
      return [`${nome(d.utente_id)} → spazio di ${nome(d.proprietario_id)} (${etichettaLivello(String(d.livello ?? '')).toLowerCase()})`]
    case 'clienti_assegnati': {
      const n = Number(d.numero ?? (Array.isArray(d.clienti) ? d.clienti.length : 0))
      return [`${n} ${n === 1 ? 'cliente' : 'clienti'}`]
    }
    case 'clienti_eliminati': {
      const nomiClienti = Array.isArray(d.nomi) ? (d.nomi as unknown[]).map(String) : []
      return nomiClienti.length ? [nomiClienti.join(', ')] : []
    }
    case 'collaboratore_aggiunto':
    case 'collaboratore_tolto':
      return d.utente_id ? [nome(d.utente_id)] : []
    case 'esportazione_dati': {
      const righe = d.righe && typeof d.righe === 'object' ? (d.righe as Record<string, number>) : null
      return righe ? [Object.entries(righe).map(([k, v]) => `${k}: ${v}`).join(' · ')] : []
    }
    case 'permessi_agente_modificati':
      return [`Prima: ${breve(d.prima)} · Dopo: ${breve(d.dopo)}`]
  }
  // generico: "prima → dopo" (campo per campo se sono oggetti), poi gli altri dati in chiaro
  const righe: string[] = []
  const altri = Object.entries(d).filter(([k]) => !['prima', 'dopo', 'clienti'].includes(k) && !k.endsWith('_id'))
  if ('prima' in d || 'dopo' in d) {
    const p = d.prima
    const q = d.dopo
    if (p && q && typeof p === 'object' && typeof q === 'object' && !Array.isArray(p) && !Array.isArray(q)) {
      const a = p as Record<string, unknown>
      const b = q as Record<string, unknown>
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) righe.push(`${k.replace(/_/g, ' ')}: ${breve(a[k])} → ${breve(b[k])}`)
      }
    } else righe.push(`${breve(p)} → ${breve(q)}`)
  }
  for (const [k, v] of altri.slice(0, 6)) righe.push(`${k.replace(/_/g, ' ')}: ${breve(v)}`)
  return righe
}
