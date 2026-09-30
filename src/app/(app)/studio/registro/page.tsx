import Link from 'next/link'
import { Bot, ChevronLeft, ChevronRight, Filter, User } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { azioniNelRegistro, nomiUtenti, registroAttivita, RIGHE_PER_PAGINA, type FiltriRegistro } from '@/lib/dati/studio'
import { formattaDataOra, isoValida } from '@/lib/date'
import { AZIONI, descriviAzione, descriviDettagli, descriviEntita } from '@/lib/studio/registro'
import { etichettaRuolo } from '@/lib/studio/testi'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Label, Select } from '@/components/ui/campi'

export const metadata = { title: 'Registro attività' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function PaginaRegistro({ searchParams }: PageProps<'/studio/registro'>) {
  const { persona } = await richiediAdmin()
  const q = await searchParams
  const filtri: FiltriRegistro = {
    da: isoValida(uno(q.da)) ? uno(q.da) : undefined,
    a: isoValida(uno(q.a)) ? uno(q.a) : undefined,
    persona: UUID.test(uno(q.persona)) ? uno(q.persona) : undefined,
    azione: /^[a-z_]{1,60}$/.test(uno(q.azione)) ? uno(q.azione) : undefined,
    soloAgenti: uno(q.agenti) === '1',
    pagina: Math.max(1, Number.parseInt(uno(q.pagina), 10) || 1),
  }
  const { registro, persone, azioni } = await conUtente(persona, async (tx) => ({
    registro: await registroAttivita(tx, filtri),
    persone: await nomiUtenti(tx),
    azioni: await azioniNelRegistro(tx),
  }))
  const nomi = new Map(persone.map((p) => [p.id, p.nome]))
  const pagine = Math.max(1, Math.ceil(registro.totale / RIGHE_PER_PAGINA))
  const tutteLeAzioni = [...new Set([...azioni, ...Object.keys(AZIONI)])].sort((a, b) => descriviAzione(a).localeCompare(descriviAzione(b), 'it'))
  const filtrato = Boolean(filtri.da || filtri.a || filtri.persona || filtri.azione || filtri.soloAgenti)

  const link = (pagina: number) => {
    const p = new URLSearchParams()
    if (filtri.da) p.set('da', filtri.da)
    if (filtri.a) p.set('a', filtri.a)
    if (filtri.persona) p.set('persona', filtri.persona)
    if (filtri.azione) p.set('azione', filtri.azione)
    if (filtri.soloAgenti) p.set('agenti', '1')
    if (pagina > 1) p.set('pagina', String(pagina))
    const s = p.toString()
    return `/studio/registro${s ? `?${s}` : ''}`
  }

  return (
    <>
      <Intestazione
        titolo="Registro attività"
        descrizione="Le operazioni sensibili dello studio: inviti, ruoli, accessi, impostazioni, assegnazioni, esportazioni e le azioni degli agenti."
      />
      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardContent className="pt-5">
            <form method="get" className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_auto_auto]" aria-label="Filtri del registro">
              <div className="grid gap-1.5">
                <Label htmlFor="f-da">Dal</Label>
                <Input id="f-da" name="da" type="date" defaultValue={filtri.da} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="f-a">Al</Label>
                <Input id="f-a" name="a" type="date" defaultValue={filtri.a} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="f-persona">Chi</Label>
                <Select id="f-persona" name="persona" defaultValue={filtri.persona ?? ''}>
                  <option value="">Tutti</option>
                  {persone.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}{p.ruolo === 'agente' ? ' (agente)' : ''}{p.attivo ? '' : ' — disattivato'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="f-azione">Tipo di azione</Label>
                <Select id="f-azione" name="azione" defaultValue={filtri.azione ?? ''}>
                  <option value="">Tutte</option>
                  {tutteLeAzioni.map((a) => <option key={a} value={a}>{descriviAzione(a)}</option>)}
                </Select>
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox name="agenti" value="1" defaultChecked={filtri.soloAgenti} />
                Solo agenti
              </label>
              <div className="flex gap-2">
                <Button type="submit"><Filter aria-hidden /> Filtra</Button>
                {filtrato && <Button asChild variant="ghost"><Link href="/studio/registro">Togli i filtri</Link></Button>}
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground" role="status">
          {registro.totale === 0
            ? 'Nessuna attività con questi filtri.'
            : `${registro.totale} ${registro.totale === 1 ? 'attività' : 'attività'}${pagine > 1 ? ` · pagina ${filtri.pagina} di ${pagine}` : ''}`}
        </p>

        {registro.righe.length > 0 && (
          <Card>
            <CardContent className="px-0 py-2">
              <Table>
                <THead>
                  <TR>
                    <TH>Quando</TH>
                    <TH>Chi</TH>
                    <TH>Azione</TH>
                    <TH>Su cosa</TH>
                    <TH>Dettagli</TH>
                  </TR>
                </THead>
                <TBody>
                  {registro.righe.map((r) => {
                    const dettagli = descriviDettagli(r.azione, r.dettagli, nomi)
                    return (
                      <TR key={r.id}>
                        <TD className="text-sm whitespace-nowrap">{formattaDataOra(r.creato_il)}</TD>
                        <TD>
                          {r.attore_ruolo === 'agente' ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="avviso"><Bot aria-hidden /> Agente</Badge>
                              <span className="text-sm">{r.attore_nome ?? 'account eliminato'}</span>
                            </span>
                          ) : r.attore_id ? (
                            <span className="grid">
                              <span className="flex items-center gap-1.5 text-sm font-medium"><User className="size-3.5 text-muted-foreground" aria-hidden /> {r.attore_nome ?? 'persona eliminata'}</span>
                              {r.attore_ruolo && <span className="text-xs text-muted-foreground">{etichettaRuolo(r.attore_ruolo)}</span>}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Sistema</span>
                          )}
                        </TD>
                        <TD className="text-sm font-medium">
                          {descriviAzione(r.azione)}
                          {r.annullato_il && <Badge variant="neutro" className="ml-2">Annullata</Badge>}
                        </TD>
                        <TD className="text-sm">
                          {r.entita && <span className="block text-xs text-muted-foreground">{descriviEntita(r.entita)}</span>}
                          {r.entita_nome ?? ''}
                        </TD>
                        <TD className="max-w-md text-sm">
                          {dettagli.length > 0 ? (
                            <ul className="grid gap-0.5">{dettagli.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {pagine > 1 && (
          <nav aria-label="Pagine del registro" className="flex items-center justify-between gap-2">
            {filtri.pagina! > 1 ? (
              <Button asChild variant="outline"><Link href={link(filtri.pagina! - 1)}><ChevronLeft aria-hidden /> Più recenti</Link></Button>
            ) : <span />}
            <span className="text-sm text-muted-foreground">Pagina {filtri.pagina} di {pagine}</span>
            {filtri.pagina! < pagine ? (
              <Button asChild variant="outline"><Link href={link(filtri.pagina! + 1)}>Meno recenti <ChevronRight aria-hidden /></Link></Button>
            ) : <span />}
          </nav>
        )}
      </div>
    </>
  )
}
