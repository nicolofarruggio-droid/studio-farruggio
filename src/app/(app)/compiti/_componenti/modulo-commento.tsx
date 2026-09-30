'use client'
import { useActionState, useState, startTransition } from 'react'
import { Loader2, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Campo, Textarea } from '@/components/ui/campi'
import { MessaggioEsito } from '@/components/ui/messaggio'
import type { EsitoAzione } from '@/lib/errori'
import { aggiungiCommento } from '../azioni'

/** Nuovo commento sul compito: il canale per i chiarimenti tra admin e collaboratore (sezione 8). */
export function ModuloCommento({ compito }: { compito: string }) {
  const [testo, setTesto] = useState('')
  const [esito, invia, inAttesa] = useActionState(async (prima: EsitoAzione | null, fd: FormData) => {
    const r = await aggiungiCommento(prima, fd)
    if (r.ok) setTesto('')
    return r
  }, null)
  const errore = esito && !esito.ok ? esito.campi?.testo : undefined
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => invia(fd))
      }}
    >
      <input type="hidden" name="compito" value={compito} />
      <Campo id="nuovo-commento" etichetta="Scrivi un commento" errore={errore}>
        <Textarea
          name="testo"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          rows={3}
          maxLength={10000}
          placeholder="Esempio: il contratto è pronto, l'ho già visionato: ora va controllato."
        />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={inAttesa || !testo.trim()}>
          {inAttesa ? <Loader2 className="animate-spin" aria-hidden /> : <MessageSquarePlus aria-hidden />} Aggiungi commento
        </Button>
      </div>
      {!errore && <MessaggioEsito esito={esito} />}
    </form>
  )
}
