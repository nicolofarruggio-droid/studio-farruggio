import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { leggiSessione } from '@/lib/auth/sessione'
import { percorsoSicuro } from '@/lib/sito'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuloVerifica } from './modulo'

export const metadata = { title: 'Verifica in due passaggi' }

export default async function PaginaVerifica({ searchParams }: PageProps<'/accedi/verifica'>) {
  const q = await searchParams
  const next = typeof q.next === 'string' ? percorsoSicuro(q.next, '') : ''
  const s = await leggiSessione()
  if (!s) redirect('/accedi')
  if (!s.serveSecondoPassaggio) redirect(next || '/dashboard')
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <CardTitle className="text-xl">Verifica in due passaggi</CardTitle>
        <CardDescription>
          Apri l&apos;app di autenticazione sul telefono e scrivi il codice di 6 cifre di BigBrotherStudio per{' '}
          <strong className="text-foreground">{s.persona.email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ModuloVerifica next={next} />
        <p className="text-center text-sm text-muted-foreground">
          Hai perso il telefono? Chiedi a un admin del tuo studio di toglierti la verifica in due passaggi.
        </p>
        <form action="/auth/esci" method="post" className="text-center">
          <Button type="submit" variant="link" size="sm">Esci e usa un altro account</Button>
        </form>
      </CardContent>
    </Card>
  )
}
