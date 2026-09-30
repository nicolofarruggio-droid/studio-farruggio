import Link from 'next/link'
import { CalendarDays, FileSpreadsheet, List, Plus } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { elencoCompiti } from '@/lib/dati/compiti'
import { compitiRimandati, opzioniFiltri, puoCreareCompiti } from '@/lib/dati/scheda-compito'
import { Intestazione } from '@/components/intestazione'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FiltriCompiti } from './_componenti/filtri'
import { filtriAttivi, leggiParametri, ordinaCompiti, queryElenco, STATI_FILTRO } from './_componenti/filtri-url'
import { TabellaCompiti, VistaScadenze } from './_componenti/elenco'

export const metadata = { title: 'Compiti' }

const LIMITE = 500

/**
 * Elenco compiti (sezione 9, schermata 4; per il collaboratore "I miei compiti"): filtri negli URL,
 * vista a lista e vista per scadenza. Le righe le filtra RLS: ognuno vede solo i compiti che può vedere.
 */
export default async function PaginaCompiti({ searchParams }: PageProps<'/compiti'>) {
  const { persona, utente, studio } = await richiediUtente()
  const parametri = leggiParametri(await searchParams)
  const tuttoLoStudio = utente.ruolo === 'admin' || studio.visibilita !== 'solo_propri'
  const titolo = tuttoLoStudio ? 'Compiti' : 'I miei compiti'

  const { compiti, opzioni, rimandati } = await conUtente(persona, async (tx) => {
    const [compiti, opzioni, rimandati] = await Promise.all([
      elencoCompiti(tx, parametri.filtri, LIMITE + 1),
      opzioniFiltri(tx, tuttoLoStudio),
      compitiRimandati(tx),
    ])
    return { compiti, opzioni, rimandati }
  })
  const troppi = compiti.length > LIMITE
  const righe = parametri.vista === 'lista'
    ? ordinaCompiti(compiti.slice(0, LIMITE), parametri.ordina, parametri.verso)
    : compiti.slice(0, LIMITE)
  const attivi = filtriAttivi(parametri)
  const statoTesto = STATI_FILTRO[parametri.filtri.stato as keyof typeof STATI_FILTRO]?.toLowerCase() ?? ''

  return (
    <>
      <Intestazione
        titolo={titolo}
        descrizione={tuttoLoStudio
          ? 'Tutti i compiti singoli dello studio, con filtri per collaboratore, cliente, stato, scadenza e priorità.'
          : 'I compiti assegnati a te e quelli che hai creato, ordinati per scadenza.'}
        azioni={
          <>
            <Button asChild variant="outline">
              <a href={`/compiti/esporta${queryElenco(parametri, { vista: '' })}`}><FileSpreadsheet aria-hidden /> Esporta in Excel</a>
            </Button>
            {puoCreareCompiti(utente.ruolo, studio.creazione_compiti) && (
              <Button asChild><Link href="/compiti/nuovo"><Plus aria-hidden /> Nuovo compito</Link></Button>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        <FiltriCompiti
          key={queryElenco(parametri)}
          parametri={parametri}
          attivi={attivi}
          collaboratori={opzioni.collaboratori}
          clienti={opzioni.clienti}
          senzaCliente={opzioni.senzaCliente}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Vista dei compiti" className="inline-flex rounded-lg border bg-muted/40 p-1">
            {([['lista', 'Lista', List], ['scadenze', 'Per scadenza', CalendarDays]] as const).map(([v, etichetta, Icona]) => (
              <Link
                key={v}
                href={`/compiti${queryElenco(parametri, { vista: v })}`}
                aria-current={parametri.vista === v ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  parametri.vista === v && 'bg-card text-foreground shadow-xs',
                )}
              >
                <Icona className="size-4" aria-hidden /> {etichetta}
              </Link>
            ))}
          </nav>
          <p className="text-sm text-muted-foreground" role="status">
            {righe.length === 1 ? '1 compito' : `${righe.length} compiti`}
            {statoTesto && ` · ${statoTesto}`}
            {troppi && ` · mostrati i primi ${LIMITE}: restringi i filtri`}
          </p>
        </div>

        {righe.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {attivi ? 'Nessun compito con questi filtri.' : 'Nessun compito aperto.'}
          </div>
        ) : parametri.vista === 'lista' ? (
          <TabellaCompiti compiti={righe} parametri={parametri} rimandati={rimandati} />
        ) : (
          <VistaScadenze compiti={righe} rimandati={rimandati} />
        )}
      </div>
    </>
  )
}
