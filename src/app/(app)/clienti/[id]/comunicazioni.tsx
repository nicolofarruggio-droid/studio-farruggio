'use client'
import { useActionState, useState, useTransition } from 'react'
import type { EsitoAzione } from '@/lib/errori'
import { toast } from 'sonner'
import { ClipboardPaste, Loader2, Sparkles } from 'lucide-react'
import { aggiungiComunicazione, riassumiEmailIncollata } from '../azioni'
import { Campo, Input, Select, Textarea } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Alert } from '@/components/ui/alert'
import { oggiISO } from '@/lib/date'

/** Inserimento manuale di una comunicazione e riassunto AI di un'email incollata (sezione 16.1). */
export function ModuloComunicazione({ cliente }: { cliente: string }) {
  const [incolla, setIncolla] = useState(false)
  const [testoEmail, setTestoEmail] = useState('')
  const [erroreAI, setErroreAI] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const [campi, setCampi] = useState({ data: oggiISO(), canale: 'telefono', testo: '', fonte: 'manuale', mittente: '', oggetto: '' })
  const [esito, azione] = useActionState(async (prima: EsitoAzione | null, fd: FormData) => {
    const r = await aggiungiComunicazione(cliente, prima, fd)
    if (r.ok) {
      toast.success(r.messaggio ?? 'Aggiunta allo storico.')
      setCampi({ data: oggiISO(), canale: 'telefono', testo: '', fonte: 'manuale', mittente: '', oggetto: '' })
      setTestoEmail('')
      setIncolla(false)
    }
    return r
  }, null)

  const riassumi = () =>
    avvia(async () => {
      setErroreAI(null)
      const r = await riassumiEmailIncollata(cliente, testoEmail)
      if (!r.ok) return setErroreAI(r.errore)
      setCampi({
        data: r.dati?.data ?? oggiISO(), canale: 'email', testo: r.dati?.riassunto ?? '', fonte: 'email_incollata',
        mittente: r.dati?.mittente ?? '', oggetto: r.dati?.oggetto ?? '',
      })
    })

  const errori = esito && !esito.ok ? esito.campi : undefined
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Aggiungi una comunicazione</p>
        <Button variant="outline" size="sm" onClick={() => setIncolla(!incolla)} aria-expanded={incolla}>
          <ClipboardPaste /> {incolla ? 'Chiudi "Incolla un\'email"' : 'Incolla un\'email'}
        </Button>
      </div>

      {incolla && (
        <div className="grid gap-2">
          <Campo id="testo-email" etichetta="Testo dell'email" aiuto="L'AI propone data e riassunto e compila il modulo qui sotto: controlla e poi salva. Niente viene salvato senza la tua conferma.">
            <Textarea value={testoEmail} onChange={(e) => setTestoEmail(e.target.value)} rows={6} placeholder="Incolla qui l'email, con mittente, data e oggetto se ci sono…" />
          </Campo>
          {erroreAI && <Alert variant="pericolo"><p>{erroreAI}</p></Alert>}
          <div>
            <Button variant="secondary" onClick={riassumi} disabled={inCorso || testoEmail.trim().length < 20}>
              {inCorso ? <Loader2 className="animate-spin" /> : <Sparkles />} {inCorso ? 'Riassunto in corso…' : 'Riassumi con l\'AI'}
            </Button>
          </div>
        </div>
      )}

      <form action={azione} className="grid gap-3" noValidate>
        <MessaggioEsito esito={esito?.ok ? null : esito} />
        <input type="hidden" name="fonte" value={campi.fonte} />
        <input type="hidden" name="mittente" value={campi.mittente} />
        <input type="hidden" name="oggetto" value={campi.oggetto} />
        {campi.fonte === 'email_incollata' && (
          <Alert variant="info">
            <Sparkles aria-hidden />
            <p>Riassunto proposto dall&apos;AI{campi.oggetto ? ` · oggetto: ${campi.oggetto}` : ''}{campi.mittente ? ` · da: ${campi.mittente}` : ''}. Controllalo prima di salvare.</p>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="com-data" etichetta="Data" errore={errori?.data}>
            <Input name="data" type="date" value={campi.data} max={oggiISO()} onChange={(e) => setCampi({ ...campi, data: e.target.value })} required />
          </Campo>
          <Campo id="com-canale" etichetta="Canale">
            <Select name="canale" value={campi.canale} onChange={(e) => setCampi({ ...campi, canale: e.target.value })}>
              <option value="telefono">Telefono</option>
              <option value="incontro">Incontro</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="altro">Altro</option>
            </Select>
          </Campo>
        </div>
        <Campo id="com-testo" etichetta="Descrizione" errore={errori?.testo}>
          <Textarea name="testo" rows={4} value={campi.testo} onChange={(e) => setCampi({ ...campi, testo: e.target.value })} placeholder="Per esempio: ha chiamato per sapere a che punto è la dichiarazione IVA…" required />
        </Campo>
        <div><PulsanteInvio testoAttesa="Salvataggio…">Aggiungi allo storico</PulsanteInvio></div>
      </form>
    </div>
  )
}
