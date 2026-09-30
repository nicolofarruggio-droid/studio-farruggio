import Link from 'next/link'
import { Eye, Info, PencilLine } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { nomeCompleto, richiediAdmin } from '@/lib/auth/sessione'
import { elencoAccessi, elencoPersone, type AccessoCollega } from '@/lib/dati/studio'
import { formattaDataOra } from '@/lib/date'
import { etichettaVisibilita } from '@/lib/studio/testi'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { ModuloAccesso, TogliAccesso } from './modulo'

export const metadata = { title: 'Accessi tra colleghi' }

const frase = (a: AccessoCollega) =>
  `${a.utente} ${a.livello === 'completa' ? 'può vedere e lavorare' : 'può vedere'} nello spazio di ${a.proprietario}`

function Livello({ livello }: { livello: string }) {
  return livello === 'completa' ? (
    <Badge variant="avviso"><PencilLine aria-hidden /> Può anche lavorarci</Badge>
  ) : (
    <Badge variant="neutro"><Eye aria-hidden /> Solo per vedere</Badge>
  )
}

export default async function PaginaAccessi() {
  const { persona, studio } = await richiediAdmin()
  const { accessi, persone } = await conUtente(persona, async (tx) => ({
    accessi: await elencoAccessi(tx),
    persone: await elencoPersone(tx),
  }))
  const attive = persone.filter((p) => p.attivo)
  const collaboratori = attive.filter((p) => p.ruolo === 'collaboratore').map((p) => ({ id: p.id, nome: nomeCompleto(p), ruolo: p.ruolo }))
  const proprietari = attive.map((p) => ({ id: p.id, nome: nomeCompleto(p), ruolo: p.ruolo }))

  return (
    <>
      <Intestazione
        titolo="Accessi tra colleghi"
        descrizione="Permessi particolari: il collaboratore A può accedere allo spazio del collega B. Lo spazio di B sono i clienti e i compiti assegnati a B, con documenti, commenti e comunicazioni."
      />
      <div className="grid grid-cols-1 gap-6">
        <Alert variant="info">
          <Info aria-hidden />
          <p>
            Visibilità attuale dello studio: <strong>{etichettaVisibilita(studio.visibilita)}</strong>.{' '}
            {studio.visibilita === 'solo_propri'
              ? 'Ogni collaboratore vede solo il suo lavoro: con gli accessi gli apri anche lo spazio di un collega.'
              : studio.visibilita === 'studio_lettura'
                ? 'I collaboratori vedono già tutto: un accesso "può anche lavorarci" permette di lavorare nello spazio di un collega.'
                : 'I collaboratori vedono e lavorano già su tutto: gli accessi servono se torni a una visibilità più stretta.'}{' '}
            <Link href="/studio/impostazioni" className="font-medium text-primary underline-offset-4 hover:underline">Cambia la visibilità</Link>.
            B vede chi ha accesso al suo spazio; gli altri colleghi no.
          </p>
        </Alert>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Concedi un accesso</CardTitle>
              <CardDescription>Se l&apos;accesso esiste già, ne cambi il livello. Vale subito.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {collaboratori.length === 0 ? (
              <p className="text-sm text-muted-foreground">Non ci sono collaboratori attivi a cui concedere un accesso.</p>
            ) : (
              <ModuloAccesso collaboratori={collaboratori} proprietari={proprietari} />
            )}
          </CardContent>
        </Card>

        <Card aria-labelledby="titolo-accessi">
          <CardHeader>
            <div>
              <CardTitle id="titolo-accessi">Accessi concessi ({accessi.length})</CardTitle>
              <CardDescription>Chi disattivi perde gli accessi ricevuti; chi diventa admin non ne ha più bisogno.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-2">
            {accessi.length === 0 ? (
              <p className="px-5 pb-3 text-sm text-muted-foreground">Nessun accesso tra colleghi.</p>
            ) : (
              <>
                <ul className="divide-y border-t md:hidden" role="list">
                  {accessi.map((a) => (
                    <li key={a.id} className="grid gap-2 px-5 py-3">
                      <span className="text-sm">
                        <strong>{a.utente}</strong> può accedere allo spazio di <strong>{a.proprietario}</strong>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Livello livello={a.livello} />
                        <span className="text-xs text-muted-foreground">
                          Concesso{a.creato_da_nome ? ` da ${a.creato_da_nome}` : ''} il {formattaDataOra(a.creato_il)}
                        </span>
                      </span>
                      <div><TogliAccesso id={a.id} frase={frase(a)} /></div>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Chi (A)</TH>
                        <TH>Può accedere allo spazio di (B)</TH>
                        <TH>Livello</TH>
                        <TH>Concesso da</TH>
                        <TH>Quando</TH>
                        <TH><span className="sr-only">Azioni</span></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {accessi.map((a) => (
                        <TR key={a.id}>
                          <TD className="font-medium">{a.utente}</TD>
                          <TD>
                            {a.proprietario}
                            {a.proprietario_ruolo === 'admin' && <span className="ml-1 text-xs text-muted-foreground">(admin)</span>}
                          </TD>
                          <TD><Livello livello={a.livello} /></TD>
                          <TD className="text-sm">{a.creato_da_nome ?? '—'}</TD>
                          <TD className="text-sm whitespace-nowrap">{formattaDataOra(a.creato_il)}</TD>
                          <TD className="text-right"><TogliAccesso id={a.id} frase={frase(a)} /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
