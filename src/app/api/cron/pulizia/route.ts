import { NextResponse } from 'next/server'
import { comeSistema } from '@/lib/db'
import { cronAutorizzato } from '@/lib/cron/autorizza'
import { eliminaFileDocumenti } from '@/lib/clienti/file'

// Ogni notte: cancella per sempre i clienti rimasti nel cestino più di 30 giorni, con i loro documenti.
export async function GET(request: Request) {
  if (!cronAutorizzato(request)) return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  const righe = await comeSistema((sql) => sql<{ cliente_id: string; percorso: string | null }[]>`
    select cliente_id, percorso from public.svuota_cestino_scaduto(30)`)
  const percorsi = righe.map((r) => r.percorso).filter((p): p is string => Boolean(p))
  await eliminaFileDocumenti(percorsi)
  return NextResponse.json({ clienti: new Set(righe.map((r) => r.cliente_id)).size, documenti: percorsi.length })
}
