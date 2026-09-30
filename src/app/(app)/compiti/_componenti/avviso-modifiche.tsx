'use client'
import { useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'

/** Conferma dopo "Salva le modifiche": toglie ?esito= dall'indirizzo, così non ricompare ricaricando. */
export function AvvisoModifiche() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('esito')) return
    url.searchParams.delete('esito')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [])
  return (
    <Alert variant="successo">
      <CheckCircle2 aria-hidden />
      <p>Modifiche salvate.</p>
    </Alert>
  )
}
