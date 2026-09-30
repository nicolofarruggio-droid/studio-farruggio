'use client'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Errore({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="alert">
      <AlertTriangle className="size-8 text-avviso" aria-hidden />
      <h1 className="text-xl font-semibold">Qualcosa è andato storto</h1>
      <p className="text-muted-foreground">La pagina non si è caricata correttamente. Riprova; se il problema continua, avvisa l&apos;admin.</p>
      <Button onClick={reset}>Riprova</Button>
    </div>
  )
}
