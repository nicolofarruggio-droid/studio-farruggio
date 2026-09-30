import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ModuloRegistrazione } from './modulo'
import { PulsanteGoogle, Separatore } from '../google'

export const metadata = { title: 'Registra lo studio' }

export default function PaginaRegistrazione() {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Registra il tuo studio</CardTitle>
        <CardDescription>
          Crei uno spazio privato per il tuo studio e ne diventi l&apos;admin. Potrai poi invitare colleghi e collaboratori.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <PulsanteGoogle testo="Registrati con Google" />
        <Separatore />
        <ModuloRegistrazione />
        <p className="text-center text-sm text-muted-foreground">
          Hai già un account?{' '}
          <Link href="/accedi" className="font-medium text-primary hover:underline">Accedi</Link>
        </p>
      </CardContent>
    </Card>
  )
}
