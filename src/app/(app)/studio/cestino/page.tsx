import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { formattaDataOra } from '@/lib/date'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { AzioniCestino } from './azioni-cestino'

export const metadata = { title: 'Cestino' }

export default async function PaginaCestino() {
  const { persona } = await richiediAdmin()
  const righe = await conUtente(persona, (tx) => tx<{ id: string; nome_visualizzazione: string; eliminato_il: Date; da: string | null }[]>`
    select c.id, c.nome_visualizzazione, c.eliminato_il, trim(u.nome || ' ' || u.cognome) as da
    from public.clienti_nel_cestino() c left join public.utenti u on u.id = c.eliminato_da`)
  return (
    <>
      <Intestazione
        titolo="Cestino"
        descrizione="I clienti eliminati restano qui per 30 giorni con compiti, documenti e comunicazioni, poi vengono cancellati per sempre."
      />
      <Card>
        <CardContent className="px-0 pt-2 pb-2">
          <Table>
            <THead><TR><TH>Cliente</TH><TH>Eliminato il</TH><TH>Da</TH><TH>Cancellazione definitiva</TH><TH><span className="sr-only">Azioni</span></TH></TR></THead>
            <TBody>
              {righe.length === 0 && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">Il cestino è vuoto.</TD></TR>}
              {righe.map((r) => {
                const scadenza = new Date(new Date(r.eliminato_il).getTime() + 30 * 86400000)
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.nome_visualizzazione}</TD>
                    <TD>{formattaDataOra(r.eliminato_il)}</TD>
                    <TD>{r.da ?? '—'}</TD>
                    <TD>{formattaDataOra(scadenza)}</TD>
                    <TD className="text-right"><AzioniCestino id={r.id} nome={r.nome_visualizzazione} /></TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
