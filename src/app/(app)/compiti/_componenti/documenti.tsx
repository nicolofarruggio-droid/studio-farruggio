import { Bot, Download, ExternalLink, File, FileArchive, FileImage, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Documento } from '@/lib/dati/scheda-compito'
import { tipoAnteprima, estensione } from '@/lib/documenti/regole'
import { formattaDataOra } from '@/lib/date'
import { formattaDimensione } from '@/lib/utils'

function IconaFile({ nome, tipo }: { nome: string; tipo: string }) {
  const est = estensione(nome)
  const Icona = tipo.startsWith('image/') ? FileImage
    : ['xls', 'xlsx', 'ods', 'csv'].includes(est) ? FileSpreadsheet
      : ['zip', '7z', 'rar'].includes(est) ? FileArchive
        : ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'].includes(est) ? FileText : File
  return <Icona className="size-5 shrink-0 text-muted-foreground" aria-hidden />
}

/**
 * Elenco dei documenti (sezione 8): nome, dimensione, chi e quando; "Apri" (anteprima nel browser per
 * immagini, PDF, testo e CSV) e "Scarica". Sempre visibile, anche a compito chiuso. Nessun pulsante elimina.
 */
export function ElencoDocumenti({ documenti }: { documenti: Documento[] }) {
  if (documenti.length === 0) return <p className="text-sm text-muted-foreground">Nessun documento caricato.</p>
  return (
    <ul className="divide-y rounded-lg border" aria-label="Documenti del compito">
      {documenti.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <IconaFile nome={d.nome_file} tipo={d.tipo} />
          <div className="grid min-w-0 flex-1 basis-48">
            <span className="font-medium wrap-anywhere">{d.nome_file}</span>
            <span className="text-xs text-muted-foreground">
              {formattaDimensione(Number(d.dimensione))} · caricato da{' '}
              {d.caricato_da_agente && <><Bot className="inline size-3.5 align-[-2px]" aria-hidden /> agente · </>}
              {d.caricato_da_nome ?? 'utente non più presente'} il {formattaDataOra(d.caricato_il)}
            </span>
          </div>
          <div className="flex gap-2">
            {tipoAnteprima(d.tipo) && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/documenti/${d.id}?modo=apri`} target="_blank" rel="noopener noreferrer" aria-label={`Apri ${d.nome_file} (in una nuova scheda)`}>
                  <ExternalLink aria-hidden /> Apri
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={`/api/documenti/${d.id}?modo=scarica`} aria-label={`Scarica ${d.nome_file}`}>
                <Download aria-hidden /> Scarica
              </a>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
