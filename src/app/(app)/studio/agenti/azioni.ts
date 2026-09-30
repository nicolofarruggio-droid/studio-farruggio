'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { ErroreUtente, messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { codiceCasuale, sha256 } from '@/lib/cripto'
import { componiTokenAgente } from '@/lib/api/token'
import { AZIONI_AGENTE } from '@/lib/api/permessi-agente'
import { chiamanteDaSessione } from '@/lib/api/autenticazione'
import { approvaProposta, rifiutaProposta } from '@/lib/api/proposte'
import { annullaAzioneAgente } from '@/lib/api/annullamento'

// Azioni della pagina "Agenti AI e API" (solo admin). Ogni funzione SQL ricontrolla che chi chiama
// sia admin dello studio: questi controlli qui servono solo a dare messaggi chiari.

const PERCORSO = '/studio/agenti'
const id = z.uuid()

const campo = (fd: FormData, nome: string) => {
  const v = fd.get(nome)
  return typeof v === 'string' ? v : ''
}

async function esegui(fn: () => Promise<string>): Promise<EsitoAzione> {
  try {
    const messaggio = await fn()
    revalidatePath(PERCORSO)
    return { ok: true, messaggio }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}

const schemaAgente = z.object({
  nome: z.string().trim().min(1, 'Scrivi un nome, per esempio "Claude Cowork".').max(100, 'Al massimo 100 caratteri.'),
  descrizione: z.string().trim().max(500, 'Al massimo 500 caratteri.'),
})

export async function creaAgente(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const d = schemaAgente.safeParse({ nome: campo(fd, 'nome'), descrizione: campo(fd, 'descrizione') })
  if (!d.success) {
    const campi = Object.fromEntries(d.error.issues.map((i) => [String(i.path[0]), i.message]))
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }
  const { persona } = await richiediAdmin()
  return esegui(async () => {
    await conUtente(persona, (tx) => tx`select public.crea_agente(${d.data.nome}, ${d.data.descrizione}, ${crypto.randomUUID()})`)
    return `Account agente "${d.data.nome}" creato, in sola lettura. Ora crea un token per collegarlo e, se serve, abilita le scritture.`
  })
}

export async function impostaPermessi(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const agente = id.safeParse(campo(fd, 'agente'))
  if (!agente.success) return { ok: false, errore: 'Agente non valido.' }
  const permessi: Record<string, string> = {}
  for (const a of AZIONI_AGENTE) {
    const v = campo(fd, a)
    if (v === 'si' || v === 'proposta') permessi[a] = v
    else if (v !== 'no' && v !== '') return { ok: false, errore: 'Valore di permesso non valido.' }
  }
  const { persona } = await richiediAdmin()
  return esegui(async () => {
    await conUtente(persona, (tx) => tx`select public.imposta_permessi_agente(${agente.data}, ${tx.json(permessi)})`)
    return Object.keys(permessi).length ? 'Permessi salvati.' : 'Permessi salvati: l\'agente è in sola lettura.'
  })
}

export async function impostaAttivo(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const agente = id.safeParse(campo(fd, 'agente'))
  const attivo = campo(fd, 'attivo') === 'true'
  if (!agente.success) return { ok: false, errore: 'Agente non valido.' }
  const { persona } = await richiediAdmin()
  return esegui(async () => {
    await conUtente(persona, async (tx) => {
      // da qui si sospendono solo gli account agente (le persone si gestiscono in "Utenti e inviti")
      const [u] = await tx<{ ruolo: string }[]>`select ruolo from public.utenti where id = ${agente.data}`
      if (u?.ruolo !== 'agente') throw new ErroreUtente('Agente non trovato.')
      await tx`select public.imposta_utente_attivo(${agente.data}, ${attivo})`
    })
    return attivo ? 'Account agente riattivato.' : 'Account agente sospeso: i suoi token non funzionano finché non lo riattivi.'
  })
}

const schemaToken = z.object({
  agente: z.uuid(),
  nome: z.string().trim().max(100, 'Al massimo 100 caratteri.'),
  giorni: z.coerce.number({ error: 'Scrivi un numero di giorni.' }).int('Scrivi un numero intero di giorni.')
    .min(1, 'Almeno 1 giorno.').max(365, 'Al massimo 365 giorni.'),
})

export type EsitoToken = EsitoAzione<{ token: string; prefisso: string; giorni: number }>

export async function creaToken(_prima: EsitoToken | null, fd: FormData): Promise<EsitoToken> {
  const d = schemaToken.safeParse({ agente: campo(fd, 'agente'), nome: campo(fd, 'nome'), giorni: campo(fd, 'giorni') || '90' })
  if (!d.success) {
    const campi = Object.fromEntries(d.error.issues.map((i) => [String(i.path[0]), i.message]))
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }
  const { persona } = await richiediAdmin()
  // Il token in chiaro esiste solo qui e nella risposta all'admin: nel database va l'impronta SHA-256.
  const { token, prefisso } = componiTokenAgente(codiceCasuale(32))
  try {
    await conUtente(persona, (tx) =>
      tx`select public.crea_token_agente(${d.data.agente}, ${d.data.nome || 'Token'}, ${sha256(token)}, ${prefisso}, ${d.data.giorni})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath(PERCORSO)
  return { ok: true, messaggio: 'Token creato.', dati: { token, prefisso, giorni: d.data.giorni } }
}

export async function revocaToken(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const token = id.safeParse(campo(fd, 'token'))
  if (!token.success) return { ok: false, errore: 'Token non valido.' }
  const { persona } = await richiediAdmin()
  return esegui(async () => {
    await conUtente(persona, (tx) => tx`select public.revoca_token_agente(${token.data})`)
    return 'Token revocato: da ora le richieste con questo token vengono rifiutate.'
  })
}

export async function approva(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const proposta = id.safeParse(campo(fd, 'proposta'))
  if (!proposta.success) return { ok: false, errore: 'Proposta non valida.' }
  const contesto = await richiediAdmin()
  const esito = await approvaProposta(chiamanteDaSessione(contesto), proposta.data)
  revalidatePath('/', 'layout')
  return esito.ok ? { ok: true, messaggio: esito.messaggio } : { ok: false, errore: esito.errore }
}

export async function rifiuta(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const proposta = id.safeParse(campo(fd, 'proposta'))
  if (!proposta.success) return { ok: false, errore: 'Proposta non valida.' }
  const motivo = campo(fd, 'motivo').trim().slice(0, 1000)
  const contesto = await richiediAdmin()
  const esito = await rifiutaProposta(chiamanteDaSessione(contesto), proposta.data, motivo || null)
  revalidatePath(PERCORSO)
  return esito.ok ? { ok: true, messaggio: esito.messaggio } : { ok: false, errore: esito.errore }
}

export async function annulla(_prima: EsitoAzione | null, fd: FormData): Promise<EsitoAzione> {
  const riga = id.safeParse(campo(fd, 'azione'))
  if (!riga.success) return { ok: false, errore: 'Azione non valida.' }
  const { persona } = await richiediAdmin()
  const esito = await annullaAzioneAgente(persona, riga.data)
  revalidatePath('/', 'layout')
  return esito.ok ? { ok: true, messaggio: esito.messaggio } : { ok: false, errore: esito.errore }
}
