import { redirect } from 'next/navigation'
import { leggiSessione } from '@/lib/auth/sessione'

export default async function Home() {
  const s = await leggiSessione()
  redirect(s?.utente ? '/dashboard' : '/accedi')
}
