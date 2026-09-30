import { NextResponse, type NextRequest } from 'next/server'
import { cronAutorizzato } from '@/lib/cron/autorizza'
import { urlSito } from '@/lib/sito'
import { mandaEmailNotifiche } from '@/lib/studio/email-notifiche'

// Processo pianificato delle email di notifica (sezione 8). Vercel Cron chiama questa route con
// "Authorization: Bearer <CRON_SECRET>". Frequenza consigliata: ogni 5 minuti ("*/5 * * * *").
// Il riepilogo delle scadenze parte una volta al giorno, al primo giro dopo le 7 (ora italiana).
// Con ?riepilogo=forza manda subito il riepilogo di oggi (a chi non l'ha ancora ricevuto): utile per le prove.

export const maxDuration = 60


export async function GET(request: NextRequest) {
  if (!cronAutorizzato(request)) return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  try {
    const resoconto = await mandaEmailNotifiche({
      sito: await urlSito(),
      forzaRiepilogo: request.nextUrl.searchParams.get('riepilogo') === 'forza',
    })
    return NextResponse.json(resoconto)
  } catch (e) {
    console.error('Cron notifiche:', e)
    return NextResponse.json({ errore: 'Invio delle notifiche non riuscito' }, { status: 500 })
  }
}
