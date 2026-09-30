'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2, UserPlus } from 'lucide-react'
import type { RigaCliente, Collega } from '@/lib/dati/clienti'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Checkbox, Select } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { IndicatoreRapido } from '@/components/indicatore-rapido'
import { euro, numero } from '@/lib/utils'
import { assegnaClienti, eliminaClienti } from '../azioni'

type Colonna = { chiave: string; etichetta: string; destra?: boolean }
const COLONNE: Colonna[] = [
  { chiave: 'ragione_sociale', etichetta: 'Ragione sociale' },
  { chiave: 'titolare', etichetta: 'Titolare' },
  { chiave: 'referente', etichetta: 'Referente' },
  { chiave: 'iva', etichetta: 'IVA' },
  { chiave: 'prima_nota', etichetta: 'Prima nota' },
  { chiave: 'dipendenti', etichetta: 'N. dipendenti', destra: true },
  { chiave: 'fatturato', etichetta: 'Fatturato', destra: true },
  { chiave: 'compiti', etichetta: 'Compiti aperti', destra: true },
]

export function TabellaClienti({
  righe, admin, colleghi, soglie, ordina, verso, parametri,
}: {
  righe: RigaCliente[]
  admin: boolean
  colleghi: Collega[]
  soglie: { iva: number; prima_nota: number }
  ordina: string
  verso: 'asc' | 'desc'
  parametri: Record<string, string>
}) {
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const [destinatario, setDestinatario] = useState('')
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()
  const router = useRouter()

  const tutti = righe.length > 0 && selezionati.size === righe.length
  const scelti = useMemo(() => righe.filter((r) => selezionati.has(r.id)), [righe, selezionati])

  const link = (col: string) => {
    const p = new URLSearchParams(parametri)
    p.set('ordina', col)
    p.set('verso', ordina === col && verso === 'asc' ? 'desc' : 'asc')
    return `/clienti?${p.toString()}`
  }

  const cambia = (id: string, si: boolean) =>
    setSelezionati((s) => {
      const n = new Set(s)
      if (si) n.add(id)
      else n.delete(id)
      return n
    })

  const assegna = () =>
    avvia(async () => {
      const r = await assegnaClienti([...selezionati], destinatario)
      if (r.ok) {
        toast.success(r.messaggio)
        setSelezionati(new Set())
        router.refresh()
      } else toast.error(r.errore)
    })

  const elimina = () =>
    avvia(async () => {
      const r = await eliminaClienti([...selezionati])
      if (r.ok) {
        toast.success(r.messaggio)
        setSelezionati(new Set())
        setConferma(false)
        router.refresh()
      } else toast.error(r.errore)
    })

  return (
    <div className="grid gap-3">
      {admin && selezionati.size > 0 && (
        <div role="region" aria-label="Azioni sui clienti selezionati" className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <p className="mr-2 text-sm font-medium">
            {selezionati.size === 1 ? '1 cliente selezionato' : `${selezionati.size} clienti selezionati`}
          </p>
          <Select aria-label="Collaboratore a cui assegnare" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} className="w-56">
            <option value="">Assegna a…</option>
            {colleghi.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} {c.cognome}{c.ruolo === 'admin' ? ' (admin)' : ''}</option>
            ))}
          </Select>
          <Button variant="secondary" disabled={!destinatario || inCorso} onClick={assegna}>
            <UserPlus /> Assegna
          </Button>
          <Button variant="destructive" className="ml-auto" disabled={inCorso} onClick={() => setConferma(true)}>
            <Trash2 /> Elimina
          </Button>
          <Button variant="ghost" onClick={() => setSelezionati(new Set())}>Deseleziona</Button>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <THead>
            <TR>
              {admin && (
                <TH className="w-10">
                  <Checkbox
                    aria-label="Seleziona tutti i clienti in elenco"
                    checked={tutti}
                    onChange={(e) => setSelezionati(e.target.checked ? new Set(righe.map((r) => r.id)) : new Set())}
                  />
                </TH>
              )}
              {COLONNE.map((c) => {
                const attiva = ordina === c.chiave
                const Icona = attiva ? (verso === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                return (
                  <TH key={c.chiave} className={c.destra ? 'text-right' : ''} aria-sort={attiva ? (verso === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <Link href={link(c.chiave)} className="inline-flex items-center gap-1 hover:text-foreground" scroll={false}>
                      {c.etichetta}
                      <Icona className="size-3.5" aria-hidden />
                      <span className="sr-only">
                        {attiva ? (verso === 'asc' ? ', ordinato crescente: clicca per decrescente' : ', ordinato decrescente: clicca per crescente') : ', clicca per ordinare'}
                      </span>
                    </Link>
                  </TH>
                )
              })}
            </TR>
          </THead>
          <TBody>
            {righe.length === 0 && (
              <TR>
                <TD colSpan={COLONNE.length + 1} className="py-10 text-center text-muted-foreground">Nessun cliente trovato.</TD>
              </TR>
            )}
            {righe.map((r) => (
              <TR key={r.id} data-selezionata={selezionati.has(r.id)}>
                {admin && (
                  <TD>
                    <Checkbox aria-label={`Seleziona ${r.ragione_sociale}`} checked={selezionati.has(r.id)} onChange={(e) => cambia(r.id, e.target.checked)} />
                  </TD>
                )}
                <TD className="max-w-72">
                  <Link href={`/clienti/${r.id}`} className="font-medium hover:text-primary hover:underline">{r.ragione_sociale}</Link>
                  {r.stato === 'archiviato' && <span className="ml-2 text-xs text-muted-foreground">(archiviato)</span>}
                  {r.partita_iva && <p className="text-xs text-muted-foreground">P.IVA {r.partita_iva}</p>}
                </TD>
                <TD className="text-sm">{r.titolare ?? <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-sm">{r.referente ?? <span className="text-muted-foreground">Nessuno</span>}</TD>
                <TD><IndicatoreRapido cliente={r.id} nomeCliente={r.ragione_sociale} tipo="iva" valore={r.iva} soglia={soglie.iva} modificabile={r.puo_lavorare} /></TD>
                <TD><IndicatoreRapido cliente={r.id} nomeCliente={r.ragione_sociale} tipo="prima_nota" valore={r.prima_nota} soglia={soglie.prima_nota} modificabile={r.puo_lavorare} /></TD>
                <TD className="text-right tabular-nums">{r.numero_dipendenti ?? <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-right tabular-nums">{r.fatturato ? euro.format(Number(r.fatturato)) : <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-right tabular-nums">
                  {r.compiti_aperti > 0 ? <Link href={`/compiti?cliente=${r.id}`} className="hover:underline">{numero.format(r.compiti_aperti)}</Link> : 0}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById('annulla-elimina')?.focus() }}>
          <DialogHeader>
            <DialogTitle>
              {scelti.length === 1 ? 'Sei sicuro di voler eliminare questo cliente?' : `Sei sicuro di voler eliminare questi ${scelti.length} clienti?`}
            </DialogTitle>
            <DialogDescription>
              Insieme ai clienti vengono eliminati anche i loro compiti con i documenti, le comunicazioni e lo storico delle date.
              I clienti restano nel Cestino per 30 giorni, poi vengono cancellati per sempre.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
            {scelti.map((c) => <li key={c.id}>{c.nome_visualizzazione}</li>)}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button id="annulla-elimina" variant="secondary">Annulla</Button>
            </DialogClose>
            <Button variant="destructive" disabled={inCorso} onClick={elimina}>ELIMINA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
