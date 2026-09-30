'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/campi'
import { MessaggioEsito } from '@/components/ui/messaggio'
import type { EsitoAzione } from '@/lib/errori'
import { MAX_FILE_PER_VOLTA } from '@/lib/documenti/regole'
import { caricaFile } from './carica-file'
import { SceltaFile, fileValidi } from './scelta-file'

/** Caricamento di uno o più documenti nel compito, con pulsante esplicito (sezione 8 e 13.1). */
export function CaricaDocumenti({ compito, limiteByte }: { compito: string; limiteByte: number }) {
  const router = useRouter()
  const [file, setFile] = useState<File[]>([])
  const [chiave, setChiave] = useState(0)
  const [esito, setEsito] = useState<EsitoAzione | null>(null)
  const [avanzamento, setAvanzamento] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const validi = fileValidi(file, limiteByte)

  const carica = () =>
    avvia(async () => {
      setEsito(null)
      setAvanzamento('Preparazione del caricamento…')
      const r = await caricaFile(compito, validi, (fatti, totale) => setAvanzamento(`Caricamento: ${fatti} di ${totale} file…`))
      setAvanzamento(null)
      if (r.ok) {
        setEsito({ ok: true, messaggio: r.messaggio })
        toast.success(r.messaggio)
        setFile([])
        setChiave((k) => k + 1) // svuota il campo file
      } else {
        setEsito({ ok: false, errore: r.errore })
      }
      router.refresh()
    })

  return (
    <form
      className="grid gap-3 rounded-lg border border-dashed p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (validi.length && file.length <= MAX_FILE_PER_VOLTA) carica()
      }}
    >
      <Label htmlFor="nuovi-documenti">Aggiungi documenti</Label>
      <SceltaFile key={chiave} id="nuovi-documenti" file={file} onCambia={(f) => { setFile(f); setEsito(null) }} limiteByte={limiteByte} disabled={inCorso} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={inCorso || validi.length === 0 || file.length > MAX_FILE_PER_VOLTA}>
          {inCorso ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {validi.length > 1 ? `Carica ${validi.length} file` : 'Carica il file'}
        </Button>
        {avanzamento && <span role="status" className="text-sm text-muted-foreground">{avanzamento}</span>}
      </div>
      <MessaggioEsito esito={esito} />
    </form>
  )
}
