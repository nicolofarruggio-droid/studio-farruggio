'use client'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react'
import type { Importata, Saltata } from '@/lib/importazione/scrittura'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type EsitoFinale = {
  nomeFile: string
  importate: Importata[]
  saltate: Saltata[]
  senzaCollaboratore: number[]
  errori: string[]
  secondi: number
}

/** Riepilogo finale: clienti importati, righe saltate con il motivo, link all'elenco clienti. */
export function Riepilogo({
  esito, restanti, onTornaAnteprima, onNuova,
}: { esito: EsitoFinale; restanti: number; onTornaAnteprima: () => void; onNuova: () => void }) {
  const n = esito.importate.length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Importazione completata</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert variant={n ? 'successo' : 'avviso'}>
          {n ? <CheckCircle2 aria-hidden /> : <CircleAlert aria-hidden />}
          <div className="grid gap-1">
            <p className="font-medium">
              {n ? `Importati ${n} ${n === 1 ? 'cliente' : 'clienti'}` : 'Nessun cliente importato'} da {esito.nomeFile}
              {n > 0 && ` in ${esito.secondi.toLocaleString('it-IT')} secondi`}.
            </p>
            <p>
              {esito.saltate.length
                ? `${esito.saltate.length} ${esito.saltate.length === 1 ? 'riga saltata' : 'righe saltate'}: trovi il motivo qui sotto.`
                : 'Nessuna riga saltata.'}
            </p>
          </div>
        </Alert>
        {esito.errori.length > 0 && (
          <Alert variant="pericolo">
            <AlertCircle aria-hidden />
            <div className="grid gap-1">
              <p className="font-medium">Alcuni blocchi non sono stati importati:</p>
              <ul className="list-disc pl-4">
                {esito.errori.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </Alert>
        )}
        {esito.senzaCollaboratore.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Righe {esito.senzaCollaboratore.join(', ')}: il collaboratore scelto non è più attivo, il cliente è stato importato senza collaboratore.
          </p>
        )}
        {esito.saltate.length > 0 && (
          <details className="rounded-lg border" open={esito.saltate.length <= 15}>
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Righe saltate ({esito.saltate.length})</summary>
            <div className="max-h-96 overflow-auto border-t">
              <table className="w-full text-sm">
                <caption className="sr-only">Righe del file non importate e motivo</caption>
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="h-8 px-4 text-left font-semibold">Riga</th>
                    <th scope="col" className="h-8 px-4 text-left font-semibold">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {esito.saltate.map((s, i) => (
                    <tr key={`${s.riga}-${i}`} className="border-b last:border-0">
                      <td className="px-4 py-1.5 font-mono text-xs">{s.riga}</td>
                      <td className="px-4 py-1.5">{s.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        {n > 0 && (
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Clienti importati ({n})</summary>
            <ul className="max-h-96 overflow-auto border-t px-4 py-2 text-sm">
              {esito.importate.map((c) => (
                <li key={c.id} className="py-0.5">
                  <Link href={`/clienti/${c.id}`} className="text-primary underline-offset-2 hover:underline">
                    {c.nome}
                  </Link>{' '}
                  <span className="text-xs text-muted-foreground">(riga {c.riga})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/clienti">
              Vai all’elenco clienti <ArrowRight aria-hidden />
            </Link>
          </Button>
          {restanti > 0 && (
            <Button variant="outline" onClick={onTornaAnteprima}>
              Torna all’anteprima delle {restanti} righe non importate
            </Button>
          )}
          <Button variant="outline" onClick={onNuova}>
            <RotateCcw aria-hidden /> Nuova importazione
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
