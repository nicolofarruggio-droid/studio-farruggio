import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Aggiorna la sessione di Supabase (cookie) a ogni richiesta e manda al login chi non è autenticato.
// I controlli di permesso veri sono nel database (RLS) e nelle pagine: questo è solo il primo filtro.

const PUBBLICHE = [
  '/accedi', '/registrati', '/password-dimenticata', '/invito', '/auth', '/privacy', '/termini', '/accesso-sospeso',
]

export async function proxy(request: NextRequest) {
  let risposta = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value)
        risposta = NextResponse.next({ request })
        for (const { name, value, options } of lista) risposta.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const percorso = request.nextUrl.pathname
  const pubblica = percorso === '/' || PUBBLICHE.some((p) => percorso === p || percorso.startsWith(p + '/'))
  if (!user && !pubblica) {
    const url = request.nextUrl.clone()
    url.pathname = '/accedi'
    url.search = ''
    url.searchParams.set('next', percorso + request.nextUrl.search)
    return NextResponse.redirect(url)
  }
  return risposta
}

export const config = {
  matcher: [
    // tutto tranne file statici, immagini e API (che hanno la propria autenticazione)
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/).*)',
  ],
}
