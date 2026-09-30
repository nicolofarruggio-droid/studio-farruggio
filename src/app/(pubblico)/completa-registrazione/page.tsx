import { redirect } from 'next/navigation'
import { leggiSessione } from '@/lib/auth/sessione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuloCompleta } from './modulo'

export const metadata = { title: 'Completa la registrazione' }

export default async function PaginaCompleta() {
  const s = await leggiSessione()
  if (!s) redirect('/accedi')
  if (s.utente) redirect('/dashboard')
  const m = s.metadati as Record<string, string | undefined>
  const [primo, ...resto] = (m.full_name ?? m.name ?? '').split(' ')
  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Registra il tuo studio</CardTitle>
        <CardDescription>
          Stai entrando come <strong>{s.persona.email}</strong>. Conferma i dati: lo studio viene creato e tu ne diventi
          l&apos;admin. Se invece qualcuno ti ha invitato in uno studio, apri il link dell&apos;invito che hai ricevuto.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ModuloCompleta
          nome={m.nome ?? m.given_name ?? primo ?? ''}
          cognome={m.cognome ?? m.family_name ?? resto.join(' ')}
          nomeStudio={m.nome_studio ?? ''}
        />
        <form action="/auth/esci" method="post" className="text-center">
          <Button type="submit" variant="link" size="sm">Esci e usa un altro account</Button>
        </form>
      </CardContent>
    </Card>
  )
}
