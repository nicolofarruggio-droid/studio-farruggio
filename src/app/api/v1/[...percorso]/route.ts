import { ErroreApi, rispostaErrore } from '@/lib/api/errori'

// Percorsi /api/v1 che non esistono: risposta JSON esplicita invece della pagina 404 del sito.
function nonEsiste(richiesta: Request) {
  const percorso = new URL(richiesta.url).pathname
  return rispostaErrore(new ErroreApi(404, 'non_trovato',
    `Il percorso ${richiesta.method} ${percorso} non esiste. L'elenco delle operazioni è in /api/v1/openapi.json.`))
}

export const GET = nonEsiste
export const POST = nonEsiste
export const PUT = nonEsiste
export const PATCH = nonEsiste
export const DELETE = nonEsiste
