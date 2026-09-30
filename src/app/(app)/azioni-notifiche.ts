'use server'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { ultimeNotifiche } from '@/lib/notifiche'

export async function leggiNotifiche() {
  const { persona } = await richiediUtente()
  return conUtente(persona, ultimeNotifiche)
}

export async function segnaNotificheLette(ids: string[] | null) {
  const { persona } = await richiediUtente()
  await conUtente(persona, (tx) => tx`select public.segna_notifiche_lette(${ids}::uuid[])`)
  return conUtente(persona, ultimeNotifiche)
}
