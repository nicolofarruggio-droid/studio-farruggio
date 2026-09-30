import Link from 'next/link'
import { MailWarning } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function BannerEmail({ stato }: { stato: string }) {
  if (stato === 'collegata') return null
  return (
    <Alert variant="avviso" className="mb-6 items-center">
      <MailWarning aria-hidden />
      <p className="flex-1">
        {stato === 'da_ricollegare'
          ? 'Google ha revocato l\'accesso alla tua casella: ricollegala perché le email dei clienti tornino nelle Comunicazioni.'
          : 'La tua casella email non è collegata: le email che ricevi dai clienti non finiscono nelle loro Comunicazioni.'}
      </p>
      <Button asChild size="sm"><Link href="/email/collega">Collega la tua email</Link></Button>
    </Alert>
  )
}
