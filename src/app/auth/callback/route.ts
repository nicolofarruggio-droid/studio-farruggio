import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { destinazioneDopoConferma } from '@/lib/auth/dopo-accesso'

// Ritorno da "Accedi con Google" e dai link con codice PKCE.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  if (code) {
    const supabase = await supabaseServer()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      return NextResponse.redirect(new URL(await destinazioneDopoConferma(data.user, next), request.url))
    }
  }
  const errore = searchParams.get('error_description') ? 'google' : 'link'
  return NextResponse.redirect(new URL(`/accedi?errore=${errore}`, request.url))
}
