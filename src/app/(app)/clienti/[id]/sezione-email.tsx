'use client'
import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Mail, ShieldCheck, X } from 'lucide-react'
import { aggiungiEmailCliente, rimuoviEmailCliente } from '../azioni'
import { Input, Select, Label } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SchedaCliente } from '@/lib/dati/scheda-cliente'

/** "Indirizzi email collegati" (sezione 16.1): servono all'AI per riconoscere le email del cliente. */
export function SezioneEmail({ cliente, email, modificabile }: { cliente: string; email: SchedaCliente['email']; modificabile: boolean }) {
  const [esito, azione] = useActionState(aggiungiEmailCliente.bind(null, cliente), null)
  const modulo = useRef<HTMLFormElement>(null)
  const [daTogliere, setDaTogliere] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  useEffect(() => {
    if (esito?.ok) {
      toast.success(esito.messaggio ?? 'Indirizzo aggiunto.')
      modulo.current?.reset()
    }
  }, [esito])

  const togli = () =>
    avvia(async () => {
      const r = await rimuoviEmailCliente(cliente, daTogliere!)
      if (r.ok) toast.success(r.messaggio)
      else toast.error(r.errore)
      setDaTogliere(null)
    })

  return (
    <div className="grid gap-4">
      {email.length === 0 ? (
        <Alert variant="avviso">
          <AlertTriangle aria-hidden />
          <p>Questo cliente non ha indirizzi email: senza, le sue email non possono essere collegate alle Comunicazioni.</p>
        </Alert>
      ) : (
        <ul className="divide-y rounded-lg border" role="list">
          {email.map((e) => (
            <li key={e.indirizzo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <Mail className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-medium break-all">{e.indirizzo}</span>
              {e.tipo === 'pec' && <Badge variant="default"><ShieldCheck aria-hidden /> PEC</Badge>}
              <span className="text-xs text-muted-foreground">
                {e.riassunte === 1 ? '1 email riassunta' : `${e.riassunte} email riassunte`}
              </span>
              {e.altri_clienti.length > 0 && (
                <span className="flex flex-wrap items-center gap-1 text-xs text-avviso">
                  <AlertTriangle className="size-3.5" aria-hidden /> Collegato anche a:
                  {e.altri_clienti.map((c, i) => (
                    <span key={c.id}>
                      <Link href={`/clienti/${c.id}`} className="underline">{c.nome}</Link>
                      {i < e.altri_clienti.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </span>
              )}
              {modificabile && (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDaTogliere(e.indirizzo)} aria-label={`Rimuovi ${e.indirizzo}`}>
                  <X /> Rimuovi
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {modificabile && (
        <form ref={modulo} action={azione} className="grid gap-2" noValidate>
          <MessaggioEsito esito={esito?.ok ? null : esito} />
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="nuova-email">Aggiungi un indirizzo</Label>
              <Input id="nuova-email" name="indirizzo" type="email" placeholder="nome@azienda.it" required
                aria-invalid={esito && !esito.ok ? true : undefined} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tipo-email">Tipo</Label>
              <Select id="tipo-email" name="tipo" defaultValue="ordinaria">
                <option value="ordinaria">Email ordinaria</option>
                <option value="pec">PEC</option>
              </Select>
            </div>
            <PulsanteInvio variant="secondary">Aggiungi indirizzo</PulsanteInvio>
          </div>
          <p className="text-xs text-muted-foreground">Le modifiche valgono dal prossimo controllo delle email.</p>
        </form>
      )}

      <Dialog open={daTogliere !== null} onOpenChange={(o) => !o && setDaTogliere(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimuovere l&apos;indirizzo {daTogliere}?</DialogTitle>
            <DialogDescription>Dal prossimo controllo le email da questo indirizzo non arriveranno più nelle Comunicazioni del cliente. Quelle già riassunte restano.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Annulla</Button></DialogClose>
            <Button variant="destructive" disabled={inCorso} onClick={togli}>Rimuovi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
