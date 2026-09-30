import Link from 'next/link'
import { CheckCircle2, Info, MailWarning, ShieldCheck } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { gmailSimulato } from '@/lib/email-lettura/gmail-prova'
import { googleConfigurato } from '@/lib/email-lettura/oauth'
import { configControlli, descriviOrari } from '@/lib/email-lettura/orari'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { collegaInSolaLettura, rimandaCollegamento } from '../azioni'
import { ElenchiPermessi } from '../permessi'
import { ModuloCollegaProva } from '../moduli-prova'

export const metadata = { title: 'Collega la tua email' }

export default async function PaginaCollegaEmail({ searchParams }: PageProps<'/email/collega'>) {
  const { persona, utente, studio } = await richiediUtente()
  const sp = await searchParams
  const primo = sp.primo === '1'
  const [casella] = await conUtente(persona, (tx) => tx<{ stato: string; indirizzo: string | null }[]>`
    select stato, indirizzo from public.caselle_email where utente_id = ${utente.id}`)
  const collegata = casella?.stato === 'collegata'
  const configurato = googleConfigurato()
  const prova = gmailSimulato()

  return (
    <div className="mx-auto max-w-3xl">
      <Intestazione
        titolo="Collega la tua email in sola lettura"
        descrizione={primo
          ? `Benvenuto, ${utente.nome}. Un ultimo passaggio, facoltativo: le email che ricevi dai clienti possono diventare riassunti nelle loro Comunicazioni.`
          : 'Le email che ricevi dai clienti diventano riassunti nelle loro Comunicazioni, senza che tu debba fare nulla.'}
      />

      <Card>
        <CardContent className="grid gap-6 pt-5">
          <ElenchiPermessi />

          <section aria-labelledby="da-sapere" className="grid gap-2 text-sm">
            <h3 id="da-sapere" className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5 text-primary" aria-hidden /> Da sapere
            </h3>
            <ul className="grid list-disc gap-1.5 pl-5">
              <li>Si leggono <strong>solo le email arrivate dopo il collegamento</strong>: quelle già presenti nella casella non vengono mai lette.</li>
              <li>Le email che non arrivano da un cliente vengono <strong>ignorate</strong>: il loro testo non viene letto né salvato.</li>
              <li>A Google si chiede <strong>solo il permesso di sola lettura</strong>: con questo permesso è Google stesso a impedire invii, modifiche ed eliminazioni.</li>
              <li>Puoi <strong>scollegare la casella quando vuoi</strong>, dalla pagina «La mia email».</li>
              <li>Il controllo delle nuove email avviene {descriviOrari(configControlli())}.</li>
            </ul>
          </section>

          {sp.errore === 'configurazione' && (
            <Alert variant="avviso">
              <MailWarning aria-hidden />
              <p>Il collegamento con Google non è ancora configurato su questa piattaforma: per ora non è possibile collegare la casella.</p>
            </Alert>
          )}

          {!studio.lettura_email_attiva ? (
            <div className="grid gap-4">
              <Alert>
                <Info aria-hidden />
                <p>
                  La lettura automatica delle email <strong>non è ancora attiva</strong> per il tuo studio.
                  {utente.ruolo === 'admin'
                    ? ' Puoi attivarla dalle impostazioni dello studio quando saranno chiusi i passaggi richiesti: verifica di Google, parere sui controlli a distanza e informativa ai collaboratori, informativa ai clienti.'
                    : ' L\'admin la attiverà quando saranno chiusi i passaggi richiesti (verifica di Google, informative ai collaboratori e ai clienti).'}
                  {' '}Per ora non devi fare nulla: potrai collegare la casella in seguito da «La mia email».
                </p>
              </Alert>
              <form action={rimandaCollegamento}>
                <PulsanteInvio>Continua</PulsanteInvio>
              </form>
            </div>
          ) : collegata ? (
            <div className="grid gap-4">
              <Alert variant="successo">
                <CheckCircle2 aria-hidden />
                <p>La tua casella {casella.indirizzo ? <strong>{casella.indirizzo}</strong> : null} è già collegata in sola lettura.</p>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button asChild><Link href="/email">Vai a «La mia email»</Link></Button>
                {primo && <form action={rimandaCollegamento}><PulsanteInvio variant="outline">Continua</PulsanteInvio></form>}
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {!configurato && sp.errore !== 'configurazione' && (
                <Alert variant="avviso">
                  <MailWarning aria-hidden />
                  <p>Il collegamento con Google non è ancora configurato su questa piattaforma: per ora non è possibile collegare la casella. Puoi continuare e collegarla più avanti.</p>
                </Alert>
              )}
              {casella?.stato === 'da_ricollegare' && (
                <Alert variant="avviso">
                  <MailWarning aria-hidden />
                  <p>Google ha revocato l&apos;accesso alla tua casella: ricollegala perché le email dei clienti tornino nelle Comunicazioni.</p>
                </Alert>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {configurato && (
                  <form action={collegaInSolaLettura}>
                    <PulsanteInvio className="w-full sm:w-auto" testoAttesa="Apertura di Google…">Collega in sola lettura</PulsanteInvio>
                  </form>
                )}
                <form action={rimandaCollegamento}>
                  <PulsanteInvio variant="outline" className="w-full sm:w-auto">Più tardi</PulsanteInvio>
                </form>
              </div>
              {configurato && (
                <p className="text-xs text-muted-foreground">
                  Si apre la pagina di Google, che ti chiederà un solo permesso: vedere i tuoi messaggi email (sola lettura).
                  Se scegli «Più tardi», nella dashboard resterà un promemoria con «Collega la tua email».
                </p>
              )}
              {prova && (
                <div className="grid gap-2 rounded-lg border border-dashed p-4">
                  <p className="text-sm"><strong>Modalità di prova:</strong> puoi collegare una casella finta, senza Google, per provare il flusso.</p>
                  <ModuloCollegaProva />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
