import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL non configurata')
  return url
}

export function supabaseChiavePubblica() {
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!k) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY non configurata')
  return k
}

/** Client Supabase con la sessione dell'utente (cookie). Usato solo per l'autenticazione. */
export async function supabaseServer() {
  const negozio = await cookies()
  return createServerClient(supabaseUrl(), supabaseChiavePubblica(), {
    cookies: {
      getAll: () => negozio.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) negozio.set(name, value, options)
        } catch {
          // chiamato da un Server Component: i cookie li aggiorna il proxy
        }
      },
    },
  })
}

/** Client con la chiave di servizio: solo sul server, per operazioni di amministrazione dell'autenticazione e dei file. */
export function supabaseServizio() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata')
  return createClient(supabaseUrl(), k, { auth: { persistSession: false, autoRefreshToken: false } })
}
