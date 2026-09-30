import 'server-only'
import { headers } from 'next/headers'

/** Indirizzo pubblico del sito, per i link nelle email e i ritorni da Google. */
export async function urlSito(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Accetta solo percorsi interni per i redirect dopo l'accesso. */
export function percorsoSicuro(next: string | null | undefined, predefinito = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return predefinito
  return next
}
