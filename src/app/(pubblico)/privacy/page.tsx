import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

export const metadata = { title: 'Informativa privacy' }

// SEGNAPOSTO (sezione 11): testo da far completare a un consulente privacy prima di aprire
// la piattaforma a studi esterni, insieme all'accordo di trattamento dati (DPA).
export default function PaginaPrivacy() {
  return (
    <Card className="w-full max-w-3xl">
      <CardHeader><CardTitle className="text-xl">Informativa privacy</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm leading-relaxed">
        <Alert variant="avviso">
          <AlertTriangle aria-hidden />
          <p><strong>Testo provvisorio.</strong> Questa informativa è un segnaposto e va completata da un consulente privacy prima di aprire la piattaforma a studi esterni.</p>
        </Alert>
        <h2 className="font-semibold">Punti da completare</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Titolare e responsabili del trattamento; accordo di trattamento dati (DPA) con ogni studio.</li>
          <li>Dati trattati: anagrafiche dei clienti degli studi, documenti dei compiti, comunicazioni e riassunti delle email.</li>
          <li>Luogo dei dati: database e file in UE (Francoforte). Le funzioni AI usano l&apos;API di Anthropic con elaborazione fuori dall&apos;UE: da coprire con DPA e clausole contrattuali standard (sezione 17.3).</li>
          <li>Lettura automatica delle email dei collaboratori in sola lettura: informativa ai collaboratori e parere su art. 4 dello Statuto dei lavoratori (sezione 16.5).</li>
          <li>Tempi di conservazione, backup, diritti degli interessati, contatti.</li>
        </ul>
      </CardContent>
    </Card>
  )
}
