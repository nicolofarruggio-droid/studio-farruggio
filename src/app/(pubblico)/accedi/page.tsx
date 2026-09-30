import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { leggiSessione } from '@/lib/auth/sessione'
import { percorsoSicuro } from '@/lib/sito'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { ModuloAccesso } from './modulo'
import { PulsanteGoogle, Separatore } from '../google'

export const metadata = { title: 'Accedi' }

const ERRORI: Record<string, string> = {
  link: 'Il link non è valido o è scaduto. Accedi oppure chiedi un nuovo link.',
  google: 'Accesso con Google non riuscito. Riprova, oppure entra con email e password.',
}

export default async function PaginaAccesso({ searchParams }: PageProps<'/accedi'>) {
  const q = await searchParams
  const next = typeof q.next === 'string' ? percorsoSicuro(q.next, '') : ''
  const s = await leggiSessione()
  if (s?.utente?.attivo) redirect(next || '/dashboard')
  const errore = typeof q.errore === 'string' ? ERRORI[q.errore] : undefined
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Accedi</CardTitle>
        <CardDescription>Entra con la tua email e la password personale.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {errore && (
          <Alert variant="pericolo">
            <AlertCircle aria-hidden />
            <p>{errore}</p>
          </Alert>
        )}
        <ModuloAccesso next={next} />
        <Separatore />
        <PulsanteGoogle next={next} />
        <p className="text-center text-sm text-muted-foreground">
          Il tuo studio non è ancora registrato?{' '}
          <Link href="/registrati" className="font-medium text-primary hover:underline">
            Registra lo studio
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
