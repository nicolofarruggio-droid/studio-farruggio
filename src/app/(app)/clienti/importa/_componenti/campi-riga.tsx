'use client'
import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/campi'
import { cn } from '@/lib/utils'

type PropsCampo = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'defaultValue'> & {
  valore: string
  onConferma: (testo: string) => void
}

/**
 * Campo di testo dell'anteprima: si scrive liberamente e il valore si applica all'uscita dal campo
 * (o con Invio), così l'anteprima non si ricalcola a ogni tasto. Usare con key={valore} per
 * ripartire dal valore aggiornato.
 */
export function CampoTesto({ valore, onConferma, className, ...props }: PropsCampo) {
  const [testo, setTesto] = useState(valore)
  return (
    <Input
      {...props}
      value={testo}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={() => {
        if (testo !== valore) onConferma(testo)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setTesto(valore)
      }}
      className={cn('h-8 px-2 text-sm', className)}
    />
  )
}

/** Data con il selettore del browser ("AAAA-MM-GG"). */
export function CampoData({
  valore, onConferma, className, ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { valore: string | null; onConferma: (v: string | null) => void }) {
  return (
    <Input
      {...props}
      type="date"
      min="1950-01-01"
      max="2100-12-31"
      value={valore ?? ''}
      onChange={(e) => onConferma(e.target.value || null)}
      className={cn('h-8 w-36 px-2 text-sm', className)}
    />
  )
}

/** Numero (intero o con decimali) con il campo numerico del browser. */
export function CampoNumero({
  valore, onConferma, intero, className, ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { valore: number | null; intero?: boolean; onConferma: (v: number | null) => void }) {
  const [testo, setTesto] = useState(valore == null ? '' : String(valore))
  const conferma = () => {
    if (testo.trim() === '') return valore == null ? undefined : onConferma(null)
    const n = Number(testo)
    if (!Number.isFinite(n) || n < 0 || (intero && !Number.isInteger(n))) {
      setTesto(valore == null ? '' : String(valore))
      return
    }
    if (n !== valore) onConferma(intero ? n : Math.round(n * 100) / 100)
  }
  return (
    <Input
      {...props}
      type="number"
      inputMode={intero ? 'numeric' : 'decimal'}
      min={0}
      step={intero ? 1 : 0.01}
      value={testo}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={conferma}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={cn('h-8 px-2 text-sm', className)}
    />
  )
}
