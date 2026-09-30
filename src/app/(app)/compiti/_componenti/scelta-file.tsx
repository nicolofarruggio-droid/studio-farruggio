'use client'
import { useRef } from 'react'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ACCEPT, DESCRIZIONE_TIPI, MAX_FILE_PER_VOLTA, descriviLimite, validaFile } from '@/lib/documenti/regole'
import { formattaDimensione } from '@/lib/utils'

/** File scelti che si possono caricare (gli altri vengono mostrati con il motivo e non si caricano). */
export const fileValidi = (file: File[], limiteByte: number) =>
  file.filter((f) => validaFile({ nome: f.name, tipo: f.type, dimensione: f.size }, limiteByte).ok)

/**
 * Scelta di uno o più file con un normale campo file (niente solo trascinamento, sezione 13.1):
 * mostra subito, per ogni file, se si può caricare o perché no.
 */
export function SceltaFile({
  id, file, onCambia, limiteByte, disabled, 'aria-describedby': descritto,
}: {
  id: string
  file: File[]
  onCambia: (file: File[]) => void
  limiteByte: number
  disabled?: boolean
  'aria-describedby'?: string
}) {
  const campo = useRef<HTMLInputElement>(null)
  const togliTutti = () => {
    if (campo.current) campo.current.value = ''
    onCambia([])
  }
  const troppi = file.length > MAX_FILE_PER_VOLTA
  return (
    <div className="grid gap-2">
      <input
        ref={campo}
        id={id}
        type="file"
        multiple
        accept={ACCEPT}
        disabled={disabled}
        aria-describedby={descritto}
        onChange={(e) => onCambia(Array.from(e.target.files ?? []))}
        className="block w-full cursor-pointer rounded-md border border-input bg-card text-sm shadow-xs file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-input file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="text-xs text-muted-foreground">
        Puoi sceglierne più di uno insieme. Ammessi: {DESCRIZIONE_TIPI}; al massimo {descriviLimite(limiteByte)} per file.
      </p>
      {file.length > 0 && (
        <div className="grid gap-1.5 rounded-md border bg-muted/30 p-2">
          <ul className="grid gap-1" aria-label="File scelti">
            {file.map((f, i) => {
              const v = validaFile({ nome: f.name, tipo: f.type, dimensione: f.size }, limiteByte)
              return (
                <li key={`${f.name}-${i}`} className="flex items-start gap-2 text-sm">
                  {v.ok ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-successo" aria-hidden />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-pericolo" aria-hidden />
                  )}
                  <span className="min-w-0 break-words">
                    {v.ok ? (
                      <>
                        <span className="font-medium">{v.nome}</span>{' '}
                        <span className="text-muted-foreground">· {formattaDimensione(f.size)} · pronto</span>
                      </>
                    ) : (
                      <span className="text-pericolo">Non si carica: {v.errore}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          {troppi && (
            <p className="text-sm font-medium text-pericolo">Puoi caricare al massimo {MAX_FILE_PER_VOLTA} file per volta.</p>
          )}
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={togliTutti} disabled={disabled}>
            <X aria-hidden /> Togli i file scelti
          </Button>
        </div>
      )}
    </div>
  )
}
