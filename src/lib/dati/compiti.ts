import 'server-only'
import type { Tx } from '@/lib/db'

export type StatoCompito = 'assegnato' | 'in_lavorazione' | 'pronto_revisione' | 'completato' | 'annullato'
export type Priorita = 'normale' | 'alta' | 'urgente'

export type RigaCompito = {
  id: string
  titolo: string
  stato: StatoCompito
  priorita: Priorita
  scadenza: Date | null
  scadenza_con_orario: boolean
  cliente_id: string | null
  cliente: string | null
  creato_da: string | null
  creato_da_nome: string | null
  creato_da_agente: boolean
  assegnatari: { id: string; nome: string }[]
  documenti: number
  completato_il: Date | null
  creato_il: Date
}

export type FiltriCompiti = {
  q?: string
  collaboratore?: string
  cliente?: string
  stato?: string // uno stato, oppure "aperti" (default), "chiusi", "tutti"
  priorita?: string
  scadenza?: '' | 'scaduti' | 'oggi' | 'settimana' | 'senza'
  creatiDa?: string
  assegnatiA?: string
}

export async function elencoCompiti(tx: Tx, f: FiltriCompiti = {}, limite = 500): Promise<RigaCompito[]> {
  const q = f.q?.trim() ? `%${f.q.trim().toLowerCase()}%` : null
  const stato = f.stato || 'aperti'
  return tx.unsafe<RigaCompito[]>(
    `
    select k.id, k.titolo, k.stato, k.priorita, k.scadenza, k.scadenza_con_orario, k.cliente_id,
      c.nome_visualizzazione as cliente, k.creato_da, trim(cr.nome || ' ' || cr.cognome) as creato_da_nome,
      coalesce(cr.ruolo = 'agente', false) as creato_da_agente,
      coalesce((select json_agg(json_build_object('id', u.id, 'nome', trim(u.nome || ' ' || u.cognome)) order by u.cognome)
                from public.compiti_assegnatari a join public.utenti u on u.id = a.utente_id where a.compito_id = k.id), '[]') as assegnatari,
      (select count(*)::int from public.compiti_documenti d where d.compito_id = k.id) as documenti,
      k.completato_il, k.creato_il
    from public.compiti k
    left join public.clienti c on c.id = k.cliente_id
    left join public.utenti cr on cr.id = k.creato_da
    where (case $1::text
             when 'aperti' then k.stato in ('assegnato', 'in_lavorazione', 'pronto_revisione')
             when 'chiusi' then k.stato in ('completato', 'annullato')
             when 'tutti' then true
             else k.stato = $1 end)
      and ($2::text is null or lower(k.titolo) like $2 or lower(k.descrizione) like $2 or lower(coalesce(c.nome_visualizzazione, '')) like $2)
      and ($3::uuid is null or exists (select 1 from public.compiti_assegnatari a where a.compito_id = k.id and a.utente_id = $3))
      and ($4::text is null or ($4 = 'nessuno' and k.cliente_id is null) or k.cliente_id::text = $4)
      and ($5::text is null or k.priorita = $5)
      and (case $6::text
             when 'scaduti' then k.scadenza < now()
             when 'oggi' then (k.scadenza at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date
             when 'settimana' then k.scadenza >= now() and k.scadenza < now() + interval '7 days'
             when 'senza' then k.scadenza is null
             else true end)
      and ($7::uuid is null or k.creato_da = $7)
      and ($8::uuid is null or exists (select 1 from public.compiti_assegnatari a where a.compito_id = k.id and a.utente_id = $8))
    order by k.scadenza asc nulls last,
      case k.priorita when 'urgente' then 0 when 'alta' then 1 else 2 end, k.creato_il desc
    limit ${Number(limite)}
    `,
    [stato, q, f.collaboratore || null, f.cliente || null, f.priorita || null, f.scadenza || null, f.creatiDa || null, f.assegnatiA || null],
  )
}

export const ETICHETTE_STATO: Record<StatoCompito, string> = {
  assegnato: 'Assegnato',
  in_lavorazione: 'In lavorazione',
  pronto_revisione: 'Pronto per revisione',
  completato: 'Completato',
  annullato: 'Annullato',
}

export const ETICHETTE_PRIORITA: Record<Priorita, string> = { normale: 'Normale', alta: 'Alta', urgente: 'Urgente' }
