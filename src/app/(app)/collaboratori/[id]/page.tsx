import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye, ArrowLeft } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediAdmin, nomeCompleto } from '@/lib/auth/sessione'
import { Intestazione } from '@/components/intestazione'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { VistaCollaboratore } from '@/components/dashboard/vista-collaboratore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { elencoClienti } from '@/lib/dati/clienti'
import { AssegnaClienti } from './assegna-clienti'

export const metadata = { title: 'Vista collaboratore' }

/** L'admin "entra" nella vista di un collaboratore: la dashboard come la vede lui, in sola lettura (sezione 3). */
export default async function PaginaVistaCollaboratore({ params }: PageProps<'/collaboratori/[id]'>) {
  const { id } = await params
  const { persona, studio } = await richiediAdmin()
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  return conUtente(persona, async (tx) => {
    const [c] = await tx<{ id: string; nome: string; cognome: string; ruolo: string; attivo: boolean }[]>`
      select id, nome, cognome, ruolo, attivo from public.utenti where id = ${id} and ruolo in ('admin', 'collaboratore')`
    if (!c) notFound()
    return (
      <>
        <Intestazione
          titolo={`Dashboard di ${nomeCompleto(c)}`}
          descrizione={c.attivo ? undefined : 'Utente disattivato'}
          azioni={<Button asChild variant="outline"><Link href="/dashboard"><ArrowLeft /> Torna alla tua dashboard</Link></Button>}
        />
        <Alert className="mb-6">
          <Eye aria-hidden />
          <p>Stai vedendo la dashboard come la vede {c.nome}, in sola lettura. Per modificare, apri il cliente o il compito.</p>
        </Alert>
        {await VistaCollaboratore({ tx, utenteId: c.id, studio, sola_lettura: true })}
        {c.attivo && (
          <Card className="mt-6">
            <CardHeader>
              <div>
                <CardTitle>Assegna clienti a {nomeCompleto(c)}</CardTitle>
                <CardDescription>Diventa il referente dei clienti scelti; lo storico delle assegnazioni resta nella scheda del cliente.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <AssegnaClienti
                collaboratore={c.id}
                nome={c.nome}
                clienti={(await elencoClienti(tx, {}))
                  .filter((k) => k.referente_id !== c.id)
                  .map((k) => ({ id: k.id, nome: k.nome_visualizzazione, referente: k.referente }))}
              />
            </CardContent>
          </Card>
        )}
      </>
    )
  })
}
