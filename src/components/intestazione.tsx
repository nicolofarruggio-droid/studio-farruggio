import { cn } from '@/lib/utils'

export function Intestazione({
  titolo, descrizione, azioni, className,
}: { titolo: React.ReactNode; descrizione?: React.ReactNode; azioni?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titolo}</h1>
        {descrizione && <p className="text-sm text-muted-foreground">{descrizione}</p>}
      </div>
      {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
    </div>
  )
}
