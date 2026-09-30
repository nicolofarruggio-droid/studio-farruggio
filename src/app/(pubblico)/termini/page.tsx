import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

export const metadata = { title: 'Termini di servizio' }

// SEGNAPOSTO (sezione 11): da completare con il consulente prima dell'apertura a studi esterni.
export default function PaginaTermini() {
  return (
    <Card className="w-full max-w-3xl">
      <CardHeader><CardTitle className="text-xl">Termini di servizio</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm leading-relaxed">
        <Alert variant="avviso">
          <AlertTriangle aria-hidden />
          <p><strong>Testo provvisorio.</strong> I termini di servizio vanno scritti con un consulente prima di aprire la piattaforma a studi esterni.</p>
        </Alert>
        <ul className="list-disc space-y-1 pl-5">
          <li>Abbonamento per studio; consumo AI compreso nel prezzo (sezione 17.2).</li>
          <li>Ogni studio ha uno spazio privato: i dati non sono condivisi con altri studi.</li>
          <li>Esportazione e cancellazione dei dati dello studio su richiesta dell&apos;admin.</li>
        </ul>
      </CardContent>
    </Card>
  )
}
