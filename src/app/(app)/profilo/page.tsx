import { ShieldAlert } from 'lucide-react'
import { richiediUtente } from '@/lib/auth/sessione'
import { supabaseServer } from '@/lib/supabase/server'
import { emailConfigurata } from '@/lib/posta'
import { formattaData } from '@/lib/date'
import { preferenzeComplete } from '@/lib/studio/preferenze'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { DuePassaggi, ModuloDati, ModuloPassword, ModuloPreferenze } from './moduli'

export const metadata = { title: 'Il mio profilo' }

export default async function PaginaProfilo() {
  const { utente, studio } = await richiediUtente()
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.mfa.listFactors()
  const fattori = (data?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({ id: f.id, nome: f.friendly_name || 'App di autenticazione', creato_il: formattaData(f.created_at) }))
  const admin = utente.ruolo === 'admin'

  return (
    <>
      <Intestazione
        titolo="Il mio profilo"
        descrizione={`${utente.email} · ${admin ? 'Admin' : 'Collaboratore'} di ${studio.nome}`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {admin && fattori.length === 0 && (
          <Alert variant="avviso" className="lg:col-span-2">
            <ShieldAlert aria-hidden />
            <p>
              <strong>Ti consigliamo la verifica in due passaggi.</strong> Come admin puoi vedere e cambiare tutto lo studio:
              con il codice dell&apos;app, una password rubata non basta per entrare.
            </p>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>I tuoi dati</CardTitle>
              <CardDescription>Come ti vedono i colleghi nel gestionale.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ModuloDati nome={utente.nome} cognome={utente.cognome} email={utente.email} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Password</CardTitle>
              <CardDescription>La password è solo tua: nessuno nello studio la vede.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ModuloPassword /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Email di notifica</CardTitle>
              <CardDescription>Scegli quali email ricevere. Di base sono tutte attive.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ModuloPreferenze preferenze={preferenzeComplete(utente.preferenze_notifiche)} emailAttive={emailConfigurata()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Verifica in due passaggi</CardTitle>
              <CardDescription>Facoltativa{admin ? ', consigliata agli admin' : ''}.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><DuePassaggi fattori={fattori} /></CardContent>
        </Card>
      </div>
    </>
  )
}
