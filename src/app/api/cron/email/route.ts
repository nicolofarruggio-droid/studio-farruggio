import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { eseguiControlliPianificati } from '@/lib/email-lettura/sincronizza'

// Processo pianificato del controllo email (sezione 16.3). Vercel Cron lo chiama ogni 10 minuti con
// "Authorization: Bearer <CRON_SECRET>"; fuori orario (8–21, lunedì–sabato, ora italiana) esce subito.
// Risponde solo con numeri: nessun contenuto delle email.

export const maxDuration = 300

function autorizzato(request: NextRequest): boolean {
  const segreto = process.env.CRON_SECRET
  if (!segreto) return false
  const atteso = Buffer.from(`Bearer ${segreto}`)
  const dato = Buffer.from(request.headers.get('authorization') ?? '')
  return atteso.length === dato.length && timingSafeEqual(atteso, dato)
}

export async function GET(request: NextRequest) {
  if (!autorizzato(request)) return Response.json({ errore: 'Non autorizzato' }, { status: 401 })
  const riepilogo = await eseguiControlliPianificati()
  return Response.json(riepilogo, { headers: { 'Cache-Control': 'no-store' } })
}
