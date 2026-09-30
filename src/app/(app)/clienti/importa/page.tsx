import Link from 'next/link'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { aiDisponibile, aiSimulata } from '@/lib/ai/claude'
import { colleghi } from '@/lib/dati/clienti'
import { cn } from '@/lib/utils'
import { Intestazione } from '@/components/intestazione'
import { ImportaClienti } from './_componenti/importa-clienti'
import { ImportaAssegnazioni } from './_componenti/importa-assegnazioni'

export const metadata = { title: 'Importazione' }

type ClienteStudio = {
  id: string
  ragione_sociale: string
  nome_visualizzazione: string
  partita_iva: string | null
  referente_id: string | null
}

/** Importazione da Excel o CSV di clienti e assegnazioni cliente-collaboratore (sezione 6). Solo admin. */
export default async function PaginaImporta({ searchParams }: PageProps<'/clienti/importa'>) {
  const { persona } = await richiediAdmin()
  const { tipo } = await searchParams
  const assegnazioni = tipo === 'assegnazioni'
  const { persone, clienti } = await conUtente(persona, async (tx) => ({
    persone: await colleghi(tx),
    clienti: await tx<ClienteStudio[]>`
      select c.id, c.ragione_sociale, c.nome_visualizzazione, c.partita_iva, a.utente_id as referente_id
      from public.clienti c
      left join public.assegnazioni a on a.cliente_id = c.id and a.al is null and a.referente_principale
      order by lower(c.nome_visualizzazione)`,
  }))
  const schede = [
    { href: '/clienti/importa', etichetta: 'Clienti', attiva: !assegnazioni },
    { href: '/clienti/importa?tipo=assegnazioni', etichetta: 'Assegnazioni cliente-collaboratore', attiva: assegnazioni },
  ]
  return (
    <>
      <Intestazione
        titolo="Importazione"
        descrizione={
          assegnazioni
            ? 'Assegna i clienti ai collaboratori da un file Excel o CSV con il cliente e il collaboratore.'
            : 'Carica l’elenco dei clienti da un file Excel o CSV, controlla l’anteprima e conferma.'
        }
      />
      <nav aria-label="Cosa importare" className="mb-6 flex flex-wrap gap-1 border-b">
        {schede.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={s.attiva ? 'page' : undefined}
            className={cn(
              '-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium',
              s.attiva ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {s.etichetta}
          </Link>
        ))}
      </nav>
      {assegnazioni ? (
        <ImportaAssegnazioni
          clienti={clienti}
          persone={persone.filter((p) => p.attivo).map(({ id, nome, cognome }) => ({ id, nome, cognome }))}
        />
      ) : (
        <ImportaClienti
          esistenti={clienti.map(({ id, ragione_sociale, nome_visualizzazione, partita_iva }) => ({ id, ragione_sociale, nome_visualizzazione, partita_iva }))}
          persone={persone.filter((p) => p.attivo).map(({ id, nome, cognome }) => ({ id, nome, cognome }))}
          ai={{ disponibile: aiDisponibile(), simulata: aiSimulata() }}
        />
      )}
    </>
  )
}
