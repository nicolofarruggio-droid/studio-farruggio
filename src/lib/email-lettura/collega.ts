import 'server-only'
import { conUtente, type Persona } from '@/lib/db'
import { urlSito } from '@/lib/sito'
import { casellaGiaUsata, salvaCasellaCollegata, tokenDiProva } from './casella'
import { creaClienteGmail } from './gmail'
import { casellaDiProva, gmailSimulato } from './gmail-prova'
import {
  PERCORSO_RITORNO, creaStato, googleConfigurato, permessoSoloLettura, revocaToken, scambiaCodice, urlConsenso,
} from './oauth'
import { ErrorePermesso } from './tipi'

// Collegamento della casella (sezione 16.2): ognuno collega SOLO la propria, con il solo permesso gmail.readonly.

export class ErroreCasellaGiaCollegata extends Error {}
export class ErroreConfigurazione extends Error {}

export async function indirizzoRitorno(): Promise<string> {
  return `${await urlSito()}${PERCORSO_RITORNO}`
}

/** URL della schermata di consenso di Google e codice da tenere nel cookie anti-CSRF. */
export async function preparaConsenso(utente: { id: string; email: string }): Promise<{ url: string; nonce: string }> {
  if (!googleConfigurato()) throw new ErroreConfigurazione('Collegamento con Google non configurato')
  const { state, nonce } = creaStato(utente.id)
  const url = urlConsenso({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    redirectUri: await indirizzoRitorno(),
    state,
    loginHint: utente.email,
  })
  return { url, nonce }
}

/** Il primo accesso è concluso (collegata, rimandata o non disponibile): non si ripropone la schermata. */
export async function segnaOnboardingEmail(persona: Persona): Promise<void> {
  await conUtente(persona, (tx) =>
    tx`update public.utenti set onboarding_email_il = coalesce(onboarding_email_il, now()) where id = ${persona.id}`)
}

async function dopoCollegamento(persona: Persona, casellaId: string, indirizzo: string, prova: boolean) {
  await conUtente(persona, async (tx) => {
    await tx`update public.utenti set onboarding_email_il = coalesce(onboarding_email_il, now()) where id = ${persona.id}`
    await tx`select public.registra_attivita('casella_collegata', 'casella', ${casellaId}::uuid,
      ${tx.json({ indirizzo, permesso: 'gmail.readonly', ...(prova ? { prova: true } : {}) })})`
  })
}

/**
 * Ritorno da Google: scambia il codice, controlla che il permesso concesso sia ESATTAMENTE gmail.readonly
 * (altrimenti revoca e si ferma), legge il profilo (indirizzo e punto di partenza della cronologia),
 * salva la casella e il token cifrato.
 */
export async function completaCollegamento(p: {
  persona: Persona
  utente: { id: string; studio_id: string }
  codice: string
}): Promise<{ indirizzo: string }> {
  const t = await scambiaCodice(p.codice, await indirizzoRitorno())
  if (!permessoSoloLettura(t.scope)) {
    await revocaToken(t.refreshToken ?? t.accessToken)
    throw new ErrorePermesso(`Permesso concesso diverso da gmail.readonly: ${t.scope}`)
  }
  if (!t.refreshToken) {
    await revocaToken(t.accessToken)
    throw new Error('Google non ha dato il token per i controlli sul server')
  }
  let salvata = false
  try {
    // il cursore parte da qui: le email già presenti nella casella non si leggono mai
    const profilo = await creaClienteGmail(t.accessToken).profilo()
    const indirizzo = profilo.emailAddress.toLowerCase()
    if (await casellaGiaUsata(indirizzo, p.utente.id)) throw new ErroreCasellaGiaCollegata('Casella già collegata da un altro utente')
    const id = await salvaCasellaCollegata({
      studioId: p.utente.studio_id,
      utenteId: p.utente.id,
      indirizzo,
      historyId: profilo.historyId,
      token: t.refreshToken,
    })
    salvata = true
    await dopoCollegamento(p.persona, id, indirizzo, false)
    return { indirizzo }
  } catch (e) {
    // collegamento non completato: il token appena concesso non deve restare valido presso Google
    if (!salvata) await revocaToken(t.refreshToken)
    throw e
  }
}

/** Solo modalità di prova (GMAIL_SIMULATO=1): collega una casella finta con l'indirizzo dell'utente. */
export async function collegaCasellaDiProva(p: {
  persona: Persona
  utente: { id: string; studio_id: string; email: string }
}): Promise<void> {
  if (!gmailSimulato()) throw new ErroreConfigurazione('La modalità di prova non è attiva')
  if (!process.env.EMAIL_TOKEN_CHIAVE) throw new ErroreConfigurazione('Manca EMAIL_TOKEN_CHIAVE')
  const indirizzo = p.utente.email.toLowerCase()
  const profilo = await casellaDiProva(indirizzo).profilo()
  const id = await salvaCasellaCollegata({
    studioId: p.utente.studio_id,
    utenteId: p.utente.id,
    indirizzo,
    historyId: profilo.historyId,
    token: tokenDiProva(indirizzo),
  })
  await dopoCollegamento(p.persona, id, indirizzo, true)
}
