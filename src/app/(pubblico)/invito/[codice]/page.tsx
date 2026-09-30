import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { comeSistema } from '@/lib/db'
import { sha256 } from '@/lib/cripto'
import { leggiSessione } from '@/lib/auth/sessione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ModuloConfermaInvito, ModuloPasswordInvito, PulsanteAccetta } from './moduli'
import { PulsanteGoogle, Separatore } from '../../google'

export const metadata = { title: 'Invito' }

type Info = { studio_nome: string; email: string; nome: string; cognome: string; ruolo: string; stato: string; scaduto: boolean; email_inviata: boolean }

function Errore({ titolo, testo }: { titolo: string; testo: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">{titolo}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert variant="pericolo">
          <AlertCircle aria-hidden />
          <p>{testo}</p>
        </Alert>
        <Button asChild variant="outline"><Link href="/accedi">Vai all&apos;accesso</Link></Button>
      </CardContent>
    </Card>
  )
}

export default async function PaginaInvito({ params }: PageProps<'/invito/[codice]'>) {
  const { codice } = await params
  const [invito] = await comeSistema((sql) => sql<Info[]>`select * from public.info_invito(${sha256(codice)})`)
  if (!invito || invito.stato === 'annullato') return <Errore titolo="Invito non valido" testo="Questo invito non esiste o è stato annullato. Chiedi all'admin del tuo studio un nuovo invito." />
  if (invito.stato === 'accettato') return <Errore titolo="Invito già usato" testo="Questo invito è già stato accettato. Entra con la tua email e la tua password." />
  if (invito.scaduto) return <Errore titolo="Invito scaduto" testo="Il link vale 7 giorni ed è scaduto. Chiedi all'admin del tuo studio di rinviarti l'invito." />

  const s = await leggiSessione()
  const ruolo = invito.ruolo === 'admin' ? 'admin' : 'collaboratore'
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Benvenuto, {invito.nome}</CardTitle>
        <CardDescription>
          Sei stato invitato nello studio <strong className="text-foreground">{invito.studio_nome}</strong> come{' '}
          <strong className="text-foreground">{ruolo}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {s ? (
          s.utente ? (
            <Alert variant="avviso">
              <AlertCircle aria-hidden />
              <p>Hai già fatto accesso come {s.persona.email}, che appartiene già a uno studio. Esci per usare l&apos;invito.</p>
            </Alert>
          ) : s.persona.email === invito.email.toLowerCase() ? (
            <PulsanteAccetta codice={codice} />
          ) : (
            <Alert variant="pericolo">
              <AlertCircle aria-hidden />
              <p>
                Hai fatto accesso come <strong>{s.persona.email}</strong>, ma l&apos;invito è per{' '}
                <strong>{invito.email}</strong>. Esci e usa l&apos;account giusto.
              </p>
            </Alert>
          )
        ) : (
          <>
            {invito.email_inviata ? (
              <ModuloPasswordInvito codice={codice} email={invito.email} />
            ) : (
              <ModuloConfermaInvito codice={codice} email={invito.email} />
            )}
            <Separatore />
            <div className="grid gap-2">
              <PulsanteGoogle next={`/invito/${codice}`} />
              <p className="text-center text-xs text-muted-foreground">Usa l&apos;account Google di {invito.email}.</p>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Hai già un account con questo indirizzo?{' '}
              <Link href={`/accedi?next=/invito/${codice}`} className="font-medium text-primary hover:underline">Accedi</Link>{' '}
              e riapri il link.
            </p>
          </>
        )}
        {s && (
          <form action="/auth/esci" method="post" className="text-center">
            <Button type="submit" variant="link" size="sm">Esci</Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
