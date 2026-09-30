'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { passwordDimenticata } from '../azioni'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Campo, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'

export default function PaginaPasswordDimenticata() {
  const [esito, azione] = useActionState(passwordDimenticata, null)
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Password dimenticata?</CardTitle>
        <CardDescription>Scrivi la tua email: ti mandiamo un link per scegliere una nuova password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={azione} className="grid gap-4" noValidate>
          <MessaggioEsito esito={esito} />
          <Campo id="email" etichetta="Email" errore={esito && !esito.ok ? esito.campi?.email : undefined}>
            <Input name="email" type="email" autoComplete="email" required />
          </Campo>
          <PulsanteInvio className="w-full" testoAttesa="Invio…">Mandami il link</PulsanteInvio>
          <Link href="/accedi" className="text-center text-sm text-primary hover:underline">Torna all&apos;accesso</Link>
        </form>
      </CardContent>
    </Card>
  )
}
