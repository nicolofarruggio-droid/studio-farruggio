import type { NextRequest } from 'next/server'
import { cronAutorizzato } from '@/lib/cron/autorizza'
import { eseguiControlliPianificati } from '@/lib/email-lettura/sincronizza'

// Processo pianificato del controllo email (sezione 16.3). Vercel Cron lo chiama ogni 10 minuti con
// "Authorization: Bearer <CRON_SECRET>"; fuori orario (8–21, lunedì–sabato, ora italiana) esce subito.
// Risponde solo con numeri: nessun contenuto delle email.

export const maxDuration = 300


export async function GET(request: NextRequest) {
  if (!cronAutorizzato(request)) return Response.json({ errore: 'Non autorizzato' }, { status: 401 })
  const riepilogo = await eseguiControlliPianificati()
  return Response.json(riepilogo, { headers: { 'Cache-Control': 'no-store' } })
}
