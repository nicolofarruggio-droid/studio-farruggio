import 'server-only'
import { headers } from 'next/headers'
export { percorsoSicuro } from './percorso-sicuro'

/**
 * Indirizzo pubblico del sito, per i link nelle email e i ritorni da Google.
 * In produzione non si usa mai l'intestazione Host della richiesta (potrebbe essere falsificata):
 * vale NEXT_PUBLIC_SITE_URL oppure il dominio di produzione di Vercel.
 */
export async function urlSito(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}
