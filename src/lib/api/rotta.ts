import 'server-only'
import type { NextRequest } from 'next/server'
import { comeSistema } from '@/lib/db'
import { autentica, type Chiamante } from './autenticazione'
import { daDatabase, ErroreApi, rispostaErrore } from './errori'
import { eScrittura, intestazioniLimite, limitiDaAmbiente, messaggioLimite } from './limiti'

// Involucro comune delle rotte /api/v1: autenticazione, limiti di frequenza, errori in JSON.
// Le rotte restano sottili: la logica vive in operazioni.ts e scritture.ts, così un futuro
// server MCP può esporre le stesse operazioni senza passare da HTTP (sezione 13.2).

export type Esito = { stato: number; dati: unknown; intestazioni?: Record<string, string> }

export const risposta = (dati: unknown, stato = 200, intestazioni?: Record<string, string>): Esito => ({ stato, dati, intestazioni })

export type Parametri = Record<string, string | string[] | undefined>
type Gestore = (c: { richiesta: NextRequest; chiamante: Chiamante; parametri: Parametri }) => Promise<Esito>

/** Conta la richiesta nel minuto corrente (per token) e blocca con 429 oltre il limite. */
async function controllaLimite(tokenId: string, metodo: string): Promise<Record<string, string>> {
  const scrittura = eScrittura(metodo)
  const limiti = limitiDaAmbiente()
  const limite = scrittura ? limiti.scritture : limiti.letture
  const [esito] = await comeSistema((sql) => sql<{ consentito: boolean; conteggio: number; riprova_tra: number }[]>`
    select consentito, conteggio, riprova_tra from public.api_registra_uso(${tokenId}, ${scrittura}, ${limite})`)
  const intestazioni = intestazioniLimite(limite, esito)
  if (!esito.consentito) {
    throw new ErroreApi(429, 'troppe_richieste', messaggioLimite(scrittura, limite, esito.riprova_tra), undefined, intestazioni)
  }
  return intestazioni
}

export function rotta(gestore: Gestore) {
  return async (richiesta: NextRequest, contesto: { params: Promise<Parametri> }): Promise<Response> => {
    let intestazioni: Record<string, string> = {}
    try {
      const chiamante = await autentica(richiesta)
      if (chiamante.token) intestazioni = await controllaLimite(chiamante.token.id, richiesta.method)
      const e = await gestore({ richiesta, chiamante, parametri: await contesto.params })
      return Response.json(e.dati, {
        status: e.stato,
        headers: { ...intestazioni, ...e.intestazioni, 'Cache-Control': 'no-store' },
      })
    } catch (err) {
      return rispostaErrore(daDatabase(err), intestazioni)
    }
  }
}
