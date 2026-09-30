import { Bot } from 'lucide-react'
import type { Commento } from '@/lib/dati/scheda-compito'
import { formattaDataOra } from '@/lib/date'
import { iniziali } from '@/lib/utils'

/** Commenti in ordine cronologico (sezione 8). */
export function ElencoCommenti({ commenti, io }: { commenti: Commento[]; io: string }) {
  if (commenti.length === 0) return <p className="text-sm text-muted-foreground">Nessun commento.</p>
  return (
    <ol className="grid gap-4" aria-label="Commenti">
      {commenti.map((m) => {
        const [nome, ...cognome] = (m.autore ?? '?').split(' ')
        return (
          <li key={m.id} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {m.autore_agente ? <Bot className="size-4" /> : iniziali(nome, cognome.join(' '))}
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="text-sm">
                <span className="font-medium">
                  {m.autore_agente && 'agente · '}
                  {m.autore ?? 'Utente non più presente'}
                  {m.autore_id === io && ' (tu)'}
                </span>{' '}
                <span className="text-xs text-muted-foreground">· {formattaDataOra(m.creato_il)}</span>
              </p>
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap break-words">{m.testo}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
