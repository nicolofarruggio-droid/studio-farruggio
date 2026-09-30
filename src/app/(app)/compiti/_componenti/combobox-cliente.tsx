'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Campo "Cliente" del modulo compito (sezione 8): combobox accessibile (ruoli combobox/listbox,
// aria-activedescendant). Il menu è chiuso e si apre solo cliccando o entrando nel campo; scrivendo
// l'elenco si restringe; la prima voce è "Nessun cliente". Frecce, Invio per scegliere, Esc chiude
// solo il menu. Si chiude anche cliccando fuori.

export type OpzioneCliente = { id: string; nome: string; dettaglio: string; ricerca: string; referente_id: string | null }

const NESSUNO: OpzioneCliente = { id: '', nome: 'Nessun cliente', dettaglio: 'Compito generale dello studio', ricerca: '', referente_id: null }
const MAX_VOCI = 80

/** Testo confrontabile: minuscolo e senza accenti. */
export const perRicerca = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ComboboxCliente({
  id, name, clienti, valore, onCambia, 'aria-describedby': descritto, 'aria-invalid': invalido, disabled,
}: {
  id?: string
  name: string
  clienti: OpzioneCliente[]
  valore: string
  onCambia: (cliente: OpzioneCliente) => void
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  disabled?: boolean
}) {
  const auto = useId()
  const idCampo = id ?? `cliente-${auto}`
  const idElenco = `${idCampo}-elenco`
  const scelto = clienti.find((c) => c.id === valore) ?? NESSUNO
  const [aperto, setAperto] = useState(false)
  const [testo, setTesto] = useState(scelto.nome)
  const [filtro, setFiltro] = useState('')
  const [attiva, setAttiva] = useState(0)
  const contenitore = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  const trovati = useMemo(() => {
    const parole = perRicerca(filtro).split(/\s+/).filter(Boolean)
    return parole.length ? clienti.filter((c) => parole.every((p) => c.ricerca.includes(p))) : clienti
  }, [clienti, filtro])
  const voci = useMemo(() => [NESSUNO, ...trovati.slice(0, MAX_VOCI)], [trovati])
  const nascosti = trovati.length - (voci.length - 1)
  const indice = Math.min(attiva, voci.length - 1)

  // chiusura cliccando fuori
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: PointerEvent) => {
      if (!contenitore.current?.contains(e.target as Node)) chiudi()
    }
    document.addEventListener('pointerdown', fuori)
    return () => document.removeEventListener('pointerdown', fuori)
  })

  // la voce attiva resta visibile scorrendo con le frecce
  useEffect(() => {
    if (aperto) document.getElementById(`${idCampo}-voce-${indice}`)?.scrollIntoView({ block: 'nearest' })
  }, [aperto, indice, idCampo])

  function apri() {
    if (aperto || disabled) return
    // scrivendo si sostituisce il nome scelto, invece di aggiungerci lettere
    campo.current?.select()
    setFiltro('')
    setAttiva(Math.max(0, [NESSUNO, ...clienti.slice(0, MAX_VOCI)].findIndex((c) => c.id === scelto.id)))
    setAperto(true)
  }

  function chiudi() {
    setAperto(false)
    setFiltro('')
    setTesto(scelto.nome)
  }

  function scegli(c: OpzioneCliente) {
    onCambia(c)
    setTesto(c.nome)
    setFiltro('')
    setAperto(false)
  }

  function tasto(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!aperto) apri()
        else setAttiva(Math.min(indice + 1, voci.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!aperto) apri()
        else setAttiva(Math.max(indice - 1, 0))
        break
      case 'Home':
        if (aperto) { e.preventDefault(); setAttiva(0) }
        break
      case 'End':
        if (aperto) { e.preventDefault(); setAttiva(voci.length - 1) }
        break
      case 'Enter':
        // con il menu aperto Invio sceglie la voce (e non invia il modulo)
        if (aperto) {
          e.preventDefault()
          if (voci[indice]) scegli(voci[indice])
        }
        break
      case 'Escape':
        // Esc chiude solo il menu, non il modulo né una finestra che lo contiene
        if (aperto) {
          e.preventDefault()
          e.stopPropagation()
          chiudi()
        }
        break
      case 'Tab':
        if (aperto) chiudi()
        break
      default:
        // a menu chiuso, la prima lettera scritta sostituisce il nome mostrato e apre l'elenco
        if (!aperto && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) e.currentTarget.select()
    }
  }

  return (
    <div ref={contenitore} className="relative">
      <input type="hidden" name={name} value={scelto.id} />
      <div className="relative">
        <input
          ref={campo}
          id={idCampo}
          type="text"
          role="combobox"
          aria-expanded={aperto}
          aria-controls={idElenco}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={aperto ? `${idCampo}-voce-${indice}` : undefined}
          aria-describedby={descritto}
          aria-invalid={invalido}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="Cerca per nome dell'azienda o del titolare"
          value={testo}
          onClick={apri}
          onFocus={apri}
          onChange={(e) => {
            setTesto(e.target.value)
            setFiltro(e.target.value)
            setAperto(true)
            setAttiva(e.target.value.trim() ? 1 : 0)
          }}
          onKeyDown={tasto}
          className={cn(
            'h-9 w-full min-w-0 rounded-md border border-input bg-card py-1 pr-9 pl-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive',
            !scelto.id && !filtro && 'text-muted-foreground',
          )}
        />
        <ChevronDown
          aria-hidden
          className={cn('pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground transition-transform', aperto && 'rotate-180')}
        />
      </div>
      <div
        className={cn(
          'absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md',
          !aperto && 'hidden',
        )}
      >
        <ul
          id={idElenco}
          role="listbox"
          aria-label="Clienti"
          className="max-h-72 overflow-y-auto p-1"
          // il clic su una voce non deve togliere il fuoco al campo
          onMouseDown={(e) => e.preventDefault()}
        >
          {voci.map((c, i) => {
            const selezionata = c.id === scelto.id
            return (
              <li
                key={c.id || 'nessuno'}
                id={`${idCampo}-voce-${i}`}
                role="option"
                aria-selected={selezionata}
                onClick={() => scegli(c)}
                onMouseMove={() => indice !== i && setAttiva(i)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm select-none',
                  i === indice && 'bg-accent text-accent-foreground',
                  i === 0 && voci.length > 1 && 'mb-1 border-b pb-2',
                )}
              >
                <Check aria-hidden className={cn('mt-0.5 size-4 shrink-0 text-primary', !selezionata && 'invisible')} />
                <span className="grid min-w-0">
                  <span className={cn('truncate', selezionata && 'font-medium', !c.id && 'italic')}>{c.nome}</span>
                  {c.dettaglio && <span className="truncate text-xs text-muted-foreground">{c.dettaglio}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        {(trovati.length === 0 || nascosti > 0) && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {trovati.length === 0
              ? `Nessun cliente trovato con «${filtro.trim()}».`
              : `Altri ${nascosti} clienti: scrivi per restringere l'elenco.`}
          </p>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {aperto && filtro.trim() ? `${trovati.length} clienti trovati` : ''}
      </p>
    </div>
  )
}
