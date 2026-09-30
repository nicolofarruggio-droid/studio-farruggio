import 'server-only'
import { randomUUID } from 'node:crypto'
import { conUtente } from '@/lib/db'
import { limiteDocumenti, linkTemporaneo, salvaOggetto, DURATA_LINK_SECONDI } from '@/lib/documenti'
import { MAX_FILE_PER_VOLTA, percorsoDocumento, pulisciNomeFile, validaFile } from '@/lib/documenti/regole'
import type { Chiamante } from './autenticazione'
import { ErroreApi, nonTrovato, permessoNegato } from './errori'

// Documenti dei compiti via API (sezione 13.2): elenco, link temporaneo per aprire o scaricare,
// caricamento di file piccoli (multipart). Stesse regole dell'interfaccia: permessi nel database,
// tipi e dimensioni controllati, nessuna eliminazione. Per gli agenti serve carica_documenti = "sì".

/** Limite per una richiesta di caricamento via API (le piattaforme serverless accettano corpi piccoli). */
export function limiteCaricamentoApi(): number {
  const mb = Number(process.env.API_DOCUMENTI_MAX_MB ?? 4)
  return Math.min(limiteDocumenti(), Math.max(1, Number.isFinite(mb) ? mb : 4) * 1024 * 1024)
}

type Documento = { id: string; nome_file: string; tipo: string; dimensione: number; caricato_da: string | null; caricato_il: Date }

export async function elencaDocumenti(c: Chiamante, compito: string) {
  return conUtente(c.persona, async (tx) => {
    const [k] = await tx`select id from public.compiti where id = ${compito}`
    if (!k) throw nonTrovato('Compito non trovato')
    const dati = await tx<Documento[]>`
      select d.id, d.nome_file, d.tipo, d.dimensione::int as dimensione, trim(u.nome || ' ' || u.cognome) as caricato_da, d.caricato_il
      from public.compiti_documenti d left join public.utenti u on u.id = d.caricato_da
      where d.compito_id = ${compito} order by d.caricato_il`
    return { dati }
  })
}

export async function linkDocumento(c: Chiamante, compito: string, documento: string, modo: 'apri' | 'scarica') {
  const [d] = await conUtente(c.persona, (tx) => tx<{ percorso: string; nome_file: string; tipo: string }[]>`
    select percorso, nome_file, tipo from public.compiti_documenti where id = ${documento} and compito_id = ${compito}`)
  if (!d) throw nonTrovato('Documento non trovato')
  const url = await linkTemporaneo(d.percorso, { modo, nome: d.nome_file, tipo: d.tipo })
  return { url, scade_tra_secondi: DURATA_LINK_SECONDI, nome_file: d.nome_file }
}

export async function caricaDocumenti(c: Chiamante, compito: string, file: File[]) {
  if (c.tipo === 'agente') {
    const p = c.utente.permessi_agente?.carica_documenti
    if (p === 'proposta') throw permessoNegato('I documenti non si caricano in modalità proposta: serve il permesso "carica documenti" = sì.')
    if (p !== 'si') throw permessoNegato('Questo account agente non è abilitato a caricare documenti.')
  }
  if (file.length === 0) throw new ErroreApi(422, 'dati_non_validi', 'Nessun file: manda i file nel campo "file" (multipart/form-data).')
  if (file.length > MAX_FILE_PER_VOLTA) throw new ErroreApi(422, 'dati_non_validi', `Al massimo ${MAX_FILE_PER_VOLTA} file per richiesta.`)
  const limite = limiteCaricamentoApi()
  const totale = file.reduce((s, f) => s + f.size, 0)
  if (totale > limite) {
    throw new ErroreApi(422, 'dati_non_validi', `I file superano ${Math.round(limite / 1024 / 1024)} MB per richiesta: mandali in più richieste.`)
  }
  const controllati = file.map((f) => ({ f, v: validaFile({ nome: f.name, tipo: f.type, dimensione: f.size }, limiteDocumenti()) }))
  const errori = controllati.flatMap(({ v }) => (v.ok ? [] : [`${v.nome}: ${v.errore}`]))
  if (errori.length) throw new ErroreApi(422, 'dati_non_validi', `Nessun file caricato. ${errori.join(' ')}`)

  const [k] = await conUtente(c.persona, (tx) => tx<{ studio_id: string; aperto: boolean; puo: boolean }[]>`
    select studio_id, public.compito_aperto(stato) as aperto,
      (public.puo_lavorare_compito(id) or public.puo_controllare_compito(id)) as puo
    from public.compiti where id = ${compito}`)
  if (!k) throw nonTrovato('Compito non trovato')
  if (!k.puo) throw permessoNegato('Non puoi caricare documenti su questo compito.')
  if (!k.aperto) throw new ErroreApi(409, 'conflitto', 'Il compito è chiuso: va riaperto per aggiungere documenti.')

  const caricati: { id: string; nome_file: string; tipo: string; dimensione: number }[] = []
  for (const { f, v } of controllati) {
    if (!v.ok) continue
    const id = randomUUID()
    const percorso = percorsoDocumento(k.studio_id, compito, id)
    const dati = new Uint8Array(await f.arrayBuffer())
    await salvaOggetto(percorso, dati, v.tipo)
    caricati.push({ id, nome_file: pulisciNomeFile(v.nome), tipo: v.tipo, dimensione: dati.byteLength })
    await conUtente(c.persona, async (tx) => {
      await tx`select public.registra_documento(${compito}, ${id}, ${pulisciNomeFile(v.nome)}, ${v.tipo}, ${dati.byteLength}, ${percorso})`
      if (c.tipo === 'agente') {
        await tx`select public.registra_attivita('documento_caricato', 'compito', ${compito},
          ${tx.json({ documento_id: id, nome_file: pulisciNomeFile(v.nome), dimensione: dati.byteLength })}, false)`
      }
    }, { origine: c.tipo === 'agente' ? 'agente' : undefined })
  }
  await conUtente(c.persona, (tx) => tx`select public.notifica_documenti(${compito}, ${caricati.length})`)
  return { dati: caricati }
}
