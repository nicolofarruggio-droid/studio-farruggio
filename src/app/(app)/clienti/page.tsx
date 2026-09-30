import Link from 'next/link'
import { Download, Plus, Upload, Search } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { colleghi, elencoClienti, COLONNE_ORDINABILI, type FiltriClienti } from '@/lib/dati/clienti'
import { Intestazione } from '@/components/intestazione'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/campi'
import { TabellaClienti } from './_componenti/tabella-clienti'

export const metadata = { title: 'Clienti' }

function leggiFiltri(q: Record<string, string | string[] | undefined>): FiltriClienti & { ordina: string; verso: 'asc' | 'desc' } {
  const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : '')
  const ordina = s('ordina') in COLONNE_ORDINABILI ? s('ordina') : 'ragione_sociale'
  return {
    q: s('q'),
    collaboratore: s('collaboratore'),
    ritardo: (['qualsiasi', 'iva', 'prima_nota'].includes(s('ritardo')) ? s('ritardo') : '') as FiltriClienti['ritardo'],
    stato: (['attivo', 'archiviato', 'tutti'].includes(s('stato')) ? s('stato') : '') as FiltriClienti['stato'],
    ordina,
    verso: s('verso') === 'desc' ? 'desc' : 'asc',
  }
}

export default async function PaginaClienti({ searchParams }: PageProps<'/clienti'>) {
  const { persona, utente, studio } = await richiediUtente()
  const f = leggiFiltri(await searchParams)
  const admin = utente.ruolo === 'admin'
  const tuttoLoStudio = admin || studio.visibilita !== 'solo_propri'
  const { righe, persone, spazi } = await conUtente(persona, async (tx) => ({
    righe: await elencoClienti(tx, f),
    persone: await colleghi(tx),
    // spazi dei colleghi a cui l'utente ha accesso (sezione 3): servono per filtrare per collaboratore
    spazi: (await tx<{ id: string }[]>`select proprietario_id as id from public.accessi_colleghi where utente_id = ${utente.id}`).map((r) => r.id),
  }))
  const personeFiltro = tuttoLoStudio ? persone : persone.filter((p) => p.id === utente.id || spazi.includes(p.id))
  const parametri = Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>
  const filtriAttivi = Boolean(f.q || f.collaboratore || f.ritardo || f.stato)
  const esporta = `/api/esporta/clienti?${new URLSearchParams(parametri).toString()}`

  return (
    <>
      <Intestazione
        titolo={tuttoLoStudio || spazi.length ? 'Clienti' : 'I miei clienti'}
        descrizione={`${righe.length} ${righe.length === 1 ? 'cliente' : 'clienti'}${filtriAttivi ? ' con i filtri scelti' : ''}. Clicca su IVA o prima nota per aggiornarle.`}
        azioni={
          <>
            <Button asChild variant="outline"><a href={esporta}><Download /> Esporta in Excel</a></Button>
            {admin && <Button asChild variant="outline"><Link href="/clienti/importa"><Upload /> Importa</Link></Button>}
            {admin && <Button asChild><Link href="/clienti/nuovo"><Plus /> Nuovo cliente</Link></Button>}
          </>
        }
      />

      <form method="get" role="search" aria-label="Filtra i clienti" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Cerca</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input id="q" name="q" defaultValue={f.q} placeholder="Ragione sociale, titolare, P.IVA, email…" className="pl-8" />
          </div>
        </div>
        {(tuttoLoStudio || spazi.length > 0) && (
          <div className="grid gap-1.5">
            <Label htmlFor="collaboratore">Collaboratore</Label>
            <Select id="collaboratore" name="collaboratore" defaultValue={f.collaboratore}>
              <option value="">Tutti</option>
              {tuttoLoStudio && <option value="nessuno">Senza collaboratore</option>}
              {personeFiltro.map((p) => <option key={p.id} value={p.id}>{p.id === utente.id ? 'I miei clienti' : `Spazio di ${p.nome} ${p.cognome}`}</option>)}
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="ritardo">Aggiornamenti</Label>
          <Select id="ritardo" name="ritardo" defaultValue={f.ritardo}>
            <option value="">Tutti</option>
            <option value="qualsiasi">In ritardo (IVA o prima nota)</option>
            <option value="iva">In ritardo con l&apos;IVA</option>
            <option value="prima_nota">In ritardo con la prima nota</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="stato">Stato</Label>
          <Select id="stato" name="stato" defaultValue={f.stato}>
            <option value="">Attivi</option>
            <option value="archiviato">Archiviati</option>
            <option value="tutti">Tutti</option>
          </Select>
        </div>
        <input type="hidden" name="ordina" value={f.ordina} />
        <input type="hidden" name="verso" value={f.verso} />
        <div className="flex items-end gap-2">
          <Button type="submit">Filtra</Button>
          {filtriAttivi && <Button asChild variant="ghost"><Link href="/clienti">Azzera</Link></Button>}
        </div>
      </form>

      <TabellaClienti
        righe={righe}
        admin={admin}
        colleghi={persone.filter((p) => p.attivo)}
        soglie={{ iva: studio.soglia_ritardo_iva_mesi, prima_nota: studio.soglia_ritardo_prima_nota_mesi }}
        ordina={f.ordina}
        verso={f.verso}
        parametri={parametri}
      />
    </>
  )
}
