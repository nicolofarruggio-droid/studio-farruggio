'use client'
import { useActionState } from 'react'
import { reimpostaPassword } from '../azioni'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Campo, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'

export default function PaginaReimpostaPassword() {
  const [esito, azione] = useActionState(reimpostaPassword, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Scegli una nuova password</CardTitle>
        <CardDescription>Almeno 10 caratteri. Da ora entrerai con questa.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={azione} className="grid gap-4" noValidate>
          <MessaggioEsito esito={esito} />
          <Campo id="password" etichetta="Nuova password" errore={campi?.password}>
            <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Campo>
          <Campo id="conferma" etichetta="Ripeti la password" errore={campi?.conferma}>
            <Input name="conferma" type="password" autoComplete="new-password" required />
          </Campo>
          <PulsanteInvio className="w-full" testoAttesa="Salvataggio…">Salva la password</PulsanteInvio>
        </form>
      </CardContent>
    </Card>
  )
}
