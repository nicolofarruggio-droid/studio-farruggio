import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/supabase/server'
import { destinazioneDopoConferma } from '@/lib/auth/dopo-accesso'

// Link delle email di Supabase Auth (conferma indirizzo, recupero password): token_hash + type.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')
  if (tokenHash && type) {
    const supabase = await supabaseServer()
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error && data.user) {
      return NextResponse.redirect(new URL(await destinazioneDopoConferma(data.user, next), request.url))
    }
  }
  return NextResponse.redirect(new URL('/accedi?errore=link', request.url))
}
