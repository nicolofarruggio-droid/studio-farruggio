import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { emailConfigurata } from '@/lib/posta'
import { Intestazione } from '@/components/intestazione'
import { Button } from '@/components/ui/button'
import { ImportaCollaboratori } from './importa'

export const metadata = { title: 'Importa collaboratori' }

export default async function PaginaImportaCollaboratori() {
  const { persona } = await richiediAdmin()
  const { emailStudio, emailInvitate } = await conUtente(persona, async (tx) => ({
    emailStudio: (await tx<{ email: string }[]>`select lower(email) as email from public.utenti where ruolo <> 'agente'`).map((r) => r.email),
    emailInvitate: (await tx<{ email: string }[]>`select lower(email) as email from public.inviti where stato = 'in_attesa'`).map((r) => r.email),
  }))
  return (
    <>
      <Intestazione
        titolo="Importa collaboratori"
        descrizione="Carica un file Excel, CSV o ODS con le persone da invitare: controlli l'anteprima e poi mandiamo gli inviti."
        azioni={
          <Button asChild variant="outline">
            <Link href="/studio/utenti"><ArrowLeft aria-hidden /> Utenti e inviti</Link>
          </Button>
        }
      />
      <ImportaCollaboratori emailStudio={emailStudio} emailInvitate={emailInvitate} emailConfigurata={emailConfigurata()} />
    </>
  )
}
