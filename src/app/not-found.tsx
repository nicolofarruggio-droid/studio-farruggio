import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

export default function NonTrovato() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">Pagina non trovata</h1>
      <p className="max-w-md text-muted-foreground">
        La pagina non esiste oppure non hai i permessi per vederla. Se pensi che sia un errore, chiedi all&apos;admin del tuo studio.
      </p>
      <Button asChild><Link href="/dashboard">Torna alla dashboard</Link></Button>
    </main>
  )
}
