import 'server-only'
import type { Tx } from '@/lib/db'
import { descriviProposte, type DescrizioneProposta, type Proposta } from '@/lib/api/proposte'

// Letture della pagina "Agenti AI e API" (solo admin: le regole RLS mostrano token, proposte e
// registro solo agli admin dello studio).

export type Agente = {
  id: string
  nome: string
  descrizione: string | null
  attivo: boolean
  permessi_agente: Record<string, unknown>
  creato_il: Date
  ultimo_uso: Date | null
}

export type TokenAgente = {
  id: string
  agente_id: string
  nome: string
  prefisso: string
  scade_il: Date
  revocato_il: Date | null
  ultimo_uso_il: Date | null
  creato_il: Date
}

export async function agentiDelloStudio(tx: Tx): Promise<{ agenti: Agente[]; token: TokenAgente[] }> {
  const [agenti, token] = await Promise.all([
    tx<Agente[]>`
      select u.id, u.nome, u.descrizione, u.attivo, u.permessi_agente, u.creato_il,
        (select max(t.ultimo_uso_il) from public.agenti_token t where t.agente_id = u.id) as ultimo_uso
      from public.utenti u where u.ruolo = 'agente' order by u.creato_il`,
    tx<TokenAgente[]>`
      select id, agente_id, nome, prefisso, scade_il, revocato_il, ultimo_uso_il, creato_il
      from public.agenti_token order by creato_il desc`,
  ])
  return { agenti, token }
}

export type PropostaConDescrizione = Proposta & {
  agente: string
  decisa_da_nome: string | null
  descrizione: DescrizioneProposta
}

export async function proposte(tx: Tx): Promise<{ inAttesa: PropostaConDescrizione[]; decise: PropostaConDescrizione[] }> {
  const righe = await tx<(Proposta & { agente: string; decisa_da_nome: string | null })[]>`
    (select p.id, p.agente_id, p.azione, p.dati, p.stato, p.creata_il, p.decisa_da, p.decisa_il, p.esito,
       trim(a.nome || ' ' || a.cognome) as agente, trim(d.nome || ' ' || d.cognome) as decisa_da_nome
     from public.proposte_agente p
     join public.utenti a on a.id = p.agente_id
     left join public.utenti d on d.id = p.decisa_da
     where p.stato = 'in_attesa' order by p.creata_il limit 200)
    union all
    (select p.id, p.agente_id, p.azione, p.dati, p.stato, p.creata_il, p.decisa_da, p.decisa_il, p.esito,
       trim(a.nome || ' ' || a.cognome) as agente, trim(d.nome || ' ' || d.cognome) as decisa_da_nome
     from public.proposte_agente p
     join public.utenti a on a.id = p.agente_id
     left join public.utenti d on d.id = p.decisa_da
     where p.stato <> 'in_attesa' order by p.decisa_il desc nulls last limit 10)`
  const descrizioni = await descriviProposte(tx, righe)
  const conDescrizione = righe.map((r) => ({ ...r, descrizione: descrizioni.get(r.id)! }))
  return {
    inAttesa: conDescrizione.filter((p) => p.stato === 'in_attesa'),
    decise: conDescrizione.filter((p) => p.stato !== 'in_attesa'),
  }
}

export type FiltriAzioni = { dal?: string; al?: string; tipo?: string; agente?: string }

export type AzioneAgente = {
  id: string
  azione: string
  entita: string | null
  entita_id: string | null
  dettagli: Record<string, unknown>
  annullabile: boolean
  annullato_il: Date | null
  annullato_da_nome: string | null
  attore_id: string | null
  agente: string | null
  creato_il: Date
}

/** Azioni svolte dagli agenti (registro attività), filtrabili per data (ora italiana), tipo e agente. */
export async function azioniDegliAgenti(tx: Tx, f: FiltriAzioni, limite = 200): Promise<AzioneAgente[]> {
  return tx<AzioneAgente[]>`
    select r.id, r.azione, r.entita, r.entita_id, r.dettagli, r.annullabile, r.annullato_il,
      trim(x.nome || ' ' || x.cognome) as annullato_da_nome, r.attore_id,
      trim(u.nome || ' ' || u.cognome) as agente, r.creato_il
    from public.registro_attivita r
    left join public.utenti u on u.id = r.attore_id
    left join public.utenti x on x.id = r.annullato_da
    where r.attore_ruolo = 'agente'
      and (${f.dal ?? null}::date is null or r.creato_il >= (${f.dal ?? null}::date)::timestamp at time zone 'Europe/Rome')
      and (${f.al ?? null}::date is null or r.creato_il < ((${f.al ?? null}::date + 1)::timestamp at time zone 'Europe/Rome'))
      and (${f.tipo ?? null}::text is null or r.azione = ${f.tipo ?? null})
      and (${f.agente ?? null}::uuid is null or r.attore_id = ${f.agente ?? null})
    order by r.creato_il desc
    limit ${limite}`
}
