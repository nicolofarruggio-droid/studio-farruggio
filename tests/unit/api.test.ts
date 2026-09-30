// API per gli agenti (sezione 13): token, limiti di frequenza, validazione degli input, errori,
// registro delle azioni e specifica OpenAPI (valida e allineata alle rotte implementate).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { componiTokenAgente, eTokenAgente, leggiAutorizzazione, LUNGHEZZA_PREFISSO } from '@/lib/api/token'
import { eScrittura, intestazioniLimite, limitiDaAmbiente, messaggioLimite } from '@/lib/api/limiti'
import {
  corpoCommento, corpoCreaCompito, corpoIndicatore, corpoModificaCompito, eSoloCambioStato, idDaPercorso, inputModificaCompito,
  leggiScadenza, ORDINAMENTI_CLIENTI, queryClienti, queryCompiti, queryVuota, STATI_COMPITO, validaCorpo, validaDati, validaQuery,
} from '@/lib/api/schemi'
import { daDatabase, ErroreApi } from '@/lib/api/errori'
import { AZIONI_AGENTE, AZIONI_PROPOSTA, livello, tuttiIPermessi } from '@/lib/api/permessi-agente'
import { aOAd, descriviVoceRegistro, GIORNI_ANNULLAMENTO, motivoNonAnnullabile } from '@/lib/api/registro'
import { indicatore, pagina } from '@/lib/api/formato'
import { specificaOpenApi } from '@/lib/api/openapi'

const radice = path.resolve(__dirname, '../..')
const TOKEN = 'bbs_' + 'A'.repeat(20) + '-_' + 'b'.repeat(21)

function errore(fn: () => unknown): ErroreApi {
  try {
    fn()
  } catch (e) {
    if (e instanceof ErroreApi) return e
    throw e
  }
  throw new Error('nessun errore')
}

describe('token', () => {
  it('riconosce token agente, access token di Supabase e intestazioni sbagliate', () => {
    expect(leggiAutorizzazione(`Bearer ${TOKEN}`)).toEqual({ tipo: 'agente', token: TOKEN })
    expect(leggiAutorizzazione(`bearer   ${TOKEN}  `)).toEqual({ tipo: 'agente', token: TOKEN })
    expect(leggiAutorizzazione('Bearer aaa.bbb.ccc')).toEqual({ tipo: 'persona', token: 'aaa.bbb.ccc' })
    expect(leggiAutorizzazione(null).tipo).toBe('errore')
    expect(leggiAutorizzazione('').tipo).toBe('errore')
    expect(leggiAutorizzazione(`Basic ${TOKEN}`).tipo).toBe('errore')
    expect(leggiAutorizzazione('Bearer bbs_corto')).toMatchObject({ tipo: 'errore', messaggio: expect.stringMatching(/per intero/) })
    expect(leggiAutorizzazione('Bearer qualcosa')).toMatchObject({ tipo: 'errore' })
    expect(leggiAutorizzazione(`Bearer ${TOKEN} altro`).tipo).toBe('errore')
  })

  it('i messaggi di errore non contengono mai il token', () => {
    const sbagliato = 'bbs_' + 'x'.repeat(40)
    const r = leggiAutorizzazione(`Bearer ${sbagliato}`)
    expect(r.tipo).toBe('errore')
    expect(JSON.stringify(r)).not.toContain(sbagliato)
  })

  it('compone il token dal codice casuale di 32 byte e ne tiene solo il prefisso', () => {
    const codice = Buffer.alloc(32, 7).toString('base64url')
    const { token, prefisso } = componiTokenAgente(codice)
    expect(token).toBe('bbs_' + codice)
    expect(eTokenAgente(token)).toBe(true)
    expect(prefisso).toBe(token.slice(0, LUNGHEZZA_PREFISSO))
    expect(prefisso.length).toBe(12)
    expect(() => componiTokenAgente('troppo-corto')).toThrow()
  })
})

describe('limiti di frequenza', () => {
  it('120 letture e 30 scritture al minuto, configurabili; valori non validi ignorati', () => {
    expect(limitiDaAmbiente({})).toEqual({ letture: 120, scritture: 30 })
    expect(limitiDaAmbiente({ API_LIMITE_LETTURE: '300', API_LIMITE_SCRITTURE: '5' })).toEqual({ letture: 300, scritture: 5 })
    expect(limitiDaAmbiente({ API_LIMITE_LETTURE: '0', API_LIMITE_SCRITTURE: 'tanti' })).toEqual({ letture: 120, scritture: 30 })
    expect(limitiDaAmbiente({ API_LIMITE_LETTURE: '1.5', API_LIMITE_SCRITTURE: '-3' })).toEqual({ letture: 120, scritture: 30 })
  })

  it('GET è una lettura, il resto scrittura', () => {
    expect(eScrittura('GET')).toBe(false)
    expect(eScrittura('head')).toBe(false)
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(eScrittura(m)).toBe(true)
  })

  it('intestazioni: Retry-After solo quando la richiesta è bloccata', () => {
    expect(intestazioniLimite(30, { consentito: true, conteggio: 10, riprova_tra: 42 })).toEqual({
      'X-RateLimit-Limit': '30', 'X-RateLimit-Remaining': '20', 'X-RateLimit-Reset': '42',
    })
    const bloccata = intestazioniLimite(30, { consentito: false, conteggio: 31, riprova_tra: 12 })
    expect(bloccata['Retry-After']).toBe('12')
    expect(bloccata['X-RateLimit-Remaining']).toBe('0')
    expect(messaggioLimite(true, 30, 1)).toMatch(/30 scritture al minuto.*1 secondo\./)
    expect(messaggioLimite(false, 120, 20)).toMatch(/120 letture al minuto.*20 secondi\./)
  })
})

describe('validazione degli input', () => {
  const params = (s: string) => new URLSearchParams(s)

  it('parametri di ricerca: valori di default, conversioni e parametri sconosciuti', () => {
    expect(validaQuery(queryClienti, params(''))).toMatchObject({ limite: 50, pagina: 1 })
    expect(validaQuery(queryClienti, params('ritardo=iva&ordina=iva&verso=desc&limite=10&pagina=2')))
      .toMatchObject({ ritardo: 'iva', ordina: 'iva', verso: 'desc', limite: 10, pagina: 2 })
    expect(validaQuery(queryClienti, params('collaboratore=nessuno')).collaboratore).toBe('nessuno')
    const sconosciuto = errore(() => validaQuery(queryClienti, params('ritardi=iva')))
    expect(sconosciuto.stato).toBe(400)
    expect(sconosciuto.message).toMatch(/sconosciuto: ritardi.*ammessi.*ritardo/)
    expect(errore(() => validaQuery(queryClienti, params('limite=abc'))).stato).toBe(400)
    expect(errore(() => validaQuery(queryClienti, params('limite=501'))).stato).toBe(400)
    expect(errore(() => validaQuery(queryClienti, params('q=a&q=b'))).message).toMatch(/ripetuto/)
    expect(errore(() => validaQuery(queryCompiti, params('stato=aperto'))).campi?.[0].campo).toBe('stato')
    expect(errore(() => validaQuery(queryCompiti, params('collaboratore=123'))).stato).toBe(400)
    expect(errore(() => validaQuery(queryVuota, params('x=1'))).message).toMatch(/non accetta parametri/)
  })

  it('nuovo compito: default, scadenza e campi non previsti', () => {
    const d = validaDati(corpoCreaCompito, { titolo: '  Contratto  ', assegnatari: ['6f1c1f0e-8a3c-4d2b-9a3e-1b2c3d4e5f60'] })
    expect(d).toEqual({
      titolo: 'Contratto', descrizione: '', cliente_id: null, assegnatari: ['6f1c1f0e-8a3c-4d2b-9a3e-1b2c3d4e5f60'],
      scadenza: null, priorita: 'normale',
    })
    const e = errore(() => validaDati(corpoCreaCompito, { titolo: '', assegnatari: [], extra: 1, scadenza: '02/10/2026' }))
    expect(e.stato).toBe(422)
    expect(e.campi?.map((c) => c.campo).sort()).toEqual(['assegnatari', 'extra', 'scadenza', 'titolo'])
    expect(validaDati(corpoCreaCompito, { titolo: 'x', assegnatari: ['6f1c1f0e-8a3c-4d2b-9a3e-1b2c3d4e5f60'], scadenza: '2026-10-02T17:30:00+02:00' }).scadenza)
      .toBe('2026-10-02T17:30:00+02:00')
  })

  it('scadenza: solo data = fine giornata a Roma senza orario; con ora = istante preciso', () => {
    expect(leggiScadenza(null)).toEqual({ istante: null, conOrario: false })
    const giorno = leggiScadenza('2026-10-02')
    expect(giorno.conOrario).toBe(false)
    expect(giorno.istante?.toISOString()).toBe('2026-10-02T21:59:59.000Z')
    const ora = leggiScadenza('2026-10-02T17:30:00+02:00')
    expect(ora).toEqual({ istante: new Date('2026-10-02T15:30:00.000Z'), conOrario: true })
  })

  it('modifica di un compito: almeno un campo, motivo per annullare, "rimanda indietro" coerente', () => {
    expect(errore(() => validaDati(corpoModificaCompito, {})).message).toMatch(/almeno un campo/)
    expect(errore(() => validaDati(corpoModificaCompito, { stato: 'annullato' })).campi?.[0].campo).toBe('motivo')
    expect(errore(() => validaDati(corpoModificaCompito, { rimanda_indietro: true, stato: 'completato' })).campi?.[0].campo).toBe('stato')
    expect(errore(() => validaDati(corpoModificaCompito, { stato: 'chiuso' })).stato).toBe(422)
    const soloStato = validaDati(corpoModificaCompito, { stato: 'pronto_revisione' })
    expect(eSoloCambioStato(soloStato)).toBe(true)
    expect(eSoloCambioStato(validaDati(corpoModificaCompito, { priorita: 'alta', stato: 'in_lavorazione' }))).toBe(false)
    // i dati di una proposta contengono anche l'id del percorso
    expect(validaDati(inputModificaCompito, { compito_id: '6f1c1f0e-8a3c-4d2b-9a3e-1b2c3d4e5f60', stato: 'in_lavorazione' }))
      .toMatchObject({ stato: 'in_lavorazione' })
    expect(errore(() => validaDati(corpoModificaCompito, { compito_id: '6f1c1f0e-8a3c-4d2b-9a3e-1b2c3d4e5f60', stato: 'in_lavorazione' })).stato).toBe(422)
  })

  it('indicatore e commento', () => {
    expect(validaDati(corpoIndicatore, { aggiornato_fino_al: '2026-08-31' })).toEqual({ aggiornato_fino_al: '2026-08-31', non_applicabile: false })
    expect(validaDati(corpoIndicatore, { aggiornato_fino_al: null, non_applicabile: true })).toEqual({ aggiornato_fino_al: null, non_applicabile: true })
    expect(errore(() => validaDati(corpoIndicatore, { aggiornato_fino_al: '2026-02-30' })).message).toMatch(/AAAA-MM-GG/)
    expect(errore(() => validaDati(corpoIndicatore, { aggiornato_fino_al: '31/08/2026' })).stato).toBe(422)
    expect(errore(() => validaDati(corpoIndicatore, {})).campi?.[0].campo).toBe('aggiornato_fino_al')
    expect(errore(() => validaDati(corpoCommento, { testo: '   ' })).message).toMatch(/vuoto/)
  })

  it('corpo della richiesta: serve JSON valido', async () => {
    const richiesta = (corpo: string, tipo = 'application/json') =>
      new Request('http://localhost/api/v1/compiti', { method: 'POST', body: corpo, headers: { 'content-type': tipo } })
    await expect(validaCorpo(corpoCommento, richiesta('{"testo":"ciao"}'))).resolves.toEqual({ testo: 'ciao' })
    await expect(validaCorpo(corpoCommento, richiesta('non json'))).rejects.toMatchObject({ stato: 400, message: expect.stringMatching(/non è JSON/) })
    await expect(validaCorpo(corpoCommento, richiesta('{"testo":"ciao"}', 'text/plain'))).rejects.toMatchObject({ stato: 400 })
    await expect(validaCorpo(corpoCommento, richiesta('{"testo":""}'))).rejects.toMatchObject({ stato: 422 })
  })

  it('identificativi nel percorso', () => {
    expect(idDaPercorso('6F1C1F0E-8A3C-4D2B-9A3E-1B2C3D4E5F60')).toBe('6f1c1f0e-8a3c-4d2b-9a3e-1b2c3d4e5f60')
    expect(errore(() => idDaPercorso('123')).stato).toBe(400)
    expect(errore(() => idDaPercorso(undefined)).stato).toBe(400)
  })
})

describe('errori del database → codici HTTP', () => {
  it('ogni codice delle funzioni SQL ha il suo stato', () => {
    const casi: [string, number][] = [
      ['42501', 403], ['P0002', 404], ['22023', 422], ['23514', 422], ['P0001', 409], ['23505', 409], ['22P02', 400],
    ]
    for (const [code, stato] of casi) expect(daDatabase({ code, message: 'Messaggio' }).stato, code).toBe(stato)
    expect(daDatabase({ code: '42501', message: 'permission denied for table compiti' }).message).toBe('Non hai i permessi per questa operazione.')
    expect(daDatabase({ code: 'P0002', message: 'Compito non trovato' }).message).toBe('Compito non trovato')
    const e = new ErroreApi(429, 'troppe_richieste', 'x')
    expect(daDatabase(e)).toBe(e)
  })

  it('un errore inatteso diventa 500 senza dettagli interni', () => {
    const r = daDatabase(new Error('connessione rifiutata: postgres://utente:segreto@host'))
    expect(r.stato).toBe(500)
    expect(r.message).not.toMatch(/segreto/)
  })
})

describe('permessi dell\'agente', () => {
  it('le azioni sono le stesse di public.azioni_agente() nel database', () => {
    const sql = readFileSync(path.join(radice, 'supabase/migrations/20260930000500_agenti.sql'), 'utf8')
    const m = /azioni_agente\(\)[\s\S]*?array\[([^\]]+)\]/.exec(sql)
    const nelDb = m![1].split(',').map((x) => x.trim().replace(/'/g, ''))
    expect([...AZIONI_AGENTE]).toEqual(nelDb)
  })

  it('tutto ciò che non è "si" o "proposta" vale "no" (sola lettura di default)', () => {
    expect(tuttiIPermessi({})).toEqual(Object.fromEntries(AZIONI_AGENTE.map((a) => [a, 'no'])))
    expect(livello({ crea_compiti: 'si' }, 'crea_compiti')).toBe('si')
    expect(livello({ crea_compiti: 'proposta' }, 'crea_compiti')).toBe('proposta')
    expect(livello({ crea_compiti: 'SI' }, 'crea_compiti')).toBe('no')
    expect(livello(null, 'commenta')).toBe('no')
  })

  it('ogni azione proponibile dipende da un permesso esistente', () => {
    for (const p of Object.values(AZIONI_PROPOSTA)) expect(AZIONI_AGENTE).toContain(p)
  })
})

describe('registro delle azioni degli agenti', () => {
  const adesso = new Date('2026-09-30T12:00:00Z')
  const riga = (azione: string, extra: Partial<{ annullabile: boolean; annullato_il: Date | null; creato_il: Date }> = {}) =>
    ({ azione, annullabile: true, annullato_il: null, creato_il: new Date('2026-09-29T12:00:00Z'), ...extra })

  it('annullabili: indicatori e compiti recenti; mai i commenti; non due volte', () => {
    expect(motivoNonAnnullabile(riga('indicatore_aggiornato'), adesso)).toBeNull()
    expect(motivoNonAnnullabile(riga('compito_creato'), adesso)).toBeNull()
    expect(motivoNonAnnullabile(riga('commento_aggiunto', { annullabile: false }), adesso)).toMatch(/commenti non si eliminano/)
    expect(motivoNonAnnullabile(riga('compito_creato', { annullato_il: new Date() }), adesso)).toMatch(/Già annullata/)
    expect(motivoNonAnnullabile(riga('indicatore_aggiornato', { annullabile: false }), adesso)).toMatch(/non ha cambiato nulla/)
    const vecchia = new Date(adesso.getTime() - (GIORNI_ANNULLAMENTO + 1) * 86_400_000)
    expect(motivoNonAnnullabile(riga('compito_creato', { creato_il: vecchia }), adesso)).toMatch(/più di 30 giorni/)
  })

  it('descrizioni leggibili', () => {
    expect(descriviVoceRegistro('indicatore_aggiornato', {
      tipo: 'iva', cliente: 'Auto Shop', prima: { aggiornato_fino_al: '2026-06-30', non_applicabile: false },
      dopo: { aggiornato_fino_al: '2026-08-31', non_applicabile: false },
    })).toBe('Ha aggiornato IVA di «Auto Shop»: da giugno 2026 ad agosto 2026')
    expect(descriviVoceRegistro('compito_stato_cambiato', { titolo: 'X', prima: 'assegnato', dopo: 'pronto_revisione' }))
      .toBe('Ha cambiato lo stato del compito «X» da Assegnato a Pronto per revisione')
    expect(descriviVoceRegistro('proposta_creata', { azione: 'crea_compito' })).toBe('Ha proposto di creare un compito (da approvare)')
    expect(aOAd('agosto')).toBe('ad agosto')
    expect(aOAd('luglio')).toBe('a luglio')
  })
})

describe('forma delle risposte', () => {
  it('indicatori con stato e descrizione', () => {
    expect(indicatore(null, 2)).toMatchObject({ stato: 'da_impostare', aggiornato_fino_al: null, non_applicabile: false })
    expect(indicatore({ aggiornato_fino_al: null, non_applicabile: true }, 2).stato).toBe('non_applicabile')
    expect(indicatore({ aggiornato_fino_al: '2020-01-31', non_applicabile: false }, 2)).toMatchObject({ stato: 'in_ritardo', descrizione: 'In ritardo: gennaio 2020' })
  })

  it('paginazione', () => {
    const righe = Array.from({ length: 7 }, (_, i) => i)
    expect(pagina(righe, { pagina: 2, limite: 3 })).toEqual({ dati: [3, 4, 5], pagina: 2, limite: 3, ha_altre: true, totale: 7 })
    expect(pagina(righe, { pagina: 3, limite: 3 }, false)).toEqual({ dati: [6], pagina: 3, limite: 3, ha_altre: false })
  })
})

// ---------------------------------------------------------------------------
// Specifica OpenAPI
// ---------------------------------------------------------------------------
function rotteImplementate(): { percorso: string; metodi: string[] }[] {
  const base = path.join(radice, 'src/app/api/v1')
  const risultato: { percorso: string; metodi: string[] }[] = []
  const visita = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const pieno = path.join(dir, nome)
      if (statSync(pieno).isDirectory()) visita(pieno)
      else if (nome === 'route.ts') {
        const relativo = path.relative(base, dir).split(path.sep).join('/')
        if (relativo.includes('[...')) continue // risposta 404 per i percorsi inesistenti
        const percorso = '/' + relativo.replace(/\[([^\]]+)\]/g, '{$1}')
        const testo = readFileSync(pieno, 'utf8')
        const metodi = [...testo.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1].toLowerCase())
        risultato.push({ percorso, metodi })
      }
    }
  }
  visita(base)
  return risultato
}

type Spec = {
  openapi: string
  paths: Record<string, Record<string, { operationId: string; requestBody?: { content: Record<string, { schema: { $ref: string } }> } }>>
  components: { schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }> } & Record<string, Record<string, unknown>>
}

describe('specifica OpenAPI', () => {
  const testo = JSON.stringify(specificaOpenApi)
  const spec = JSON.parse(testo) as Spec

  it('è JSON valido, versione 3.1, con operationId unici', () => {
    expect(spec.openapi).toBe('3.1.0')
    const ids = Object.values(spec.paths).flatMap((p) => Object.values(p).map((o) => o.operationId))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(Boolean)).toBe(true)
  })

  it('descrive tutte le rotte implementate, e solo quelle', () => {
    const rotte = rotteImplementate()
    expect(rotte.length).toBeGreaterThanOrEqual(10)
    for (const r of rotte) {
      expect(spec.paths[r.percorso], r.percorso).toBeDefined()
      expect(Object.keys(spec.paths[r.percorso]).sort(), r.percorso).toEqual([...r.metodi].sort())
    }
    expect(Object.keys(spec.paths).sort()).toEqual(rotte.map((r) => r.percorso).sort())
  })

  it('ogni riferimento $ref punta a un componente esistente', () => {
    const refs = [...testo.matchAll(/"\$ref":"#\/components\/([^/]+)\/([^"]+)"/g)]
    expect(refs.length).toBeGreaterThan(10)
    for (const [, sezione, nome] of refs) expect(spec.components[sezione]?.[nome], `${sezione}/${nome}`).toBeDefined()
  })

  it('i corpi delle richieste hanno gli stessi campi degli schemi di validazione', () => {
    const campiZod = (s: { shape: Record<string, unknown> }) => Object.keys(s.shape).sort()
    const campiSpec = (nome: string) => Object.keys(spec.components.schemas[nome].properties ?? {}).sort()
    expect(campiSpec('CorpoCreaCompito')).toEqual(campiZod(corpoCreaCompito))
    expect(campiSpec('CorpoIndicatore')).toEqual(campiZod(corpoIndicatore))
    expect(campiSpec('CorpoCommento')).toEqual(campiZod(corpoCommento))
    const modifica = campiZod(inputModificaCompito as unknown as { shape: Record<string, unknown> }).filter((k) => k !== 'compito_id')
    expect(campiSpec('CorpoModificaCompito')).toEqual(modifica)
    expect([...(spec.components.schemas.CorpoCreaCompito.required ?? [])].sort()).toEqual(['assegnatari', 'titolo'])
  })

  it('i valori ammessi coincidono con quelli della validazione', () => {
    const clienti = spec.paths['/clienti'].get as unknown as { parameters: { name: string; schema: { enum?: string[] } }[] }
    expect(clienti.parameters.find((p) => p.name === 'ordina')?.schema.enum).toEqual([...ORDINAMENTI_CLIENTI])
    expect((spec.components.schemas.CompitoInElenco.properties!.stato as { enum: string[] }).enum).toEqual([...STATI_COMPITO])
  })

  it('le scritture dichiarano il permesso dell\'agente che serve', () => {
    for (const [percorso, operazioni] of Object.entries(spec.paths)) {
      for (const [metodo, op] of Object.entries(operazioni)) {
        if (metodo === 'get') continue
        expect((op as Record<string, unknown>)['x-permesso-agente'], `${metodo} ${percorso}`).toBeTypeOf('string')
      }
    }
  })

  it('docs/openapi.json è aggiornato (npx tsx scripts/openapi.ts)', () => {
    const file = readFileSync(path.join(radice, 'docs/openapi.json'), 'utf8')
    expect(JSON.parse(file)).toEqual(spec)
  })
})
