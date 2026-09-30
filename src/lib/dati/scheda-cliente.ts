import 'server-only'
import type { Tx } from '@/lib/db'
import { elencoCompiti, type RigaCompito } from './compiti'

export type SchedaCliente = {
  cliente: {
    id: string; ragione_sociale: string; nome_visualizzazione: string; telefono: string | null; codice_fiscale: string | null
    partita_iva: string | null; numero_dipendenti: number | null; fatturato: string | null; note: string | null
    stato: 'attivo' | 'archiviato'; alias: string[]; creato_il: Date
  }
  completo: boolean
  puoLavorare: boolean
  titolari: { nome: string; cognome: string; principale: boolean }[]
  email: { indirizzo: string; tipo: 'ordinaria' | 'pec'; riassunte: number; altri_clienti: { id: string; nome: string }[] }[]
  indicatori: Record<'iva' | 'prima_nota', { aggiornato_fino_al: string | null; non_applicabile: boolean; aggiornato_il: Date; da: string | null } | null>
  storico: { id: string; tipo: 'iva' | 'prima_nota'; valore_precedente: string | null; valore_nuovo: string | null; na_precedente: boolean | null; na_nuovo: boolean | null; origine: string; da: string | null; da_agente: boolean; modificato_il: Date }[]
  assegnati: { utente_id: string; nome: string; referente: boolean; dal: Date }[]
  storicoAssegnazioni: { nome: string; referente: boolean; dal: Date; al: Date | null; assegnato_da: string | null; rimosso_da: string | null }[]
  comunicazioni: {
    id: string; data: Date; canale: string; testo: string; fonte: 'manuale' | 'email_automatica' | 'email_incollata'
    autore: string | null; mittente: string | null; oggetto: string | null; allegati: string[]; numero_messaggio: number | null
  }[]
  compitiAperti: RigaCompito[]
  compitiChiusi: RigaCompito[]
  stessoTitolare: { id: string; nome_visualizzazione: string; titolare: string }[]
  caselleCollegate: number
}

export async function leggiSchedaCliente(tx: Tx, id: string): Promise<SchedaCliente | null> {
  const [cliente] = await tx<(SchedaCliente['cliente'] & { completo: boolean; puo_lavorare: boolean })[]>`
    select id, ragione_sociale, nome_visualizzazione, telefono, codice_fiscale, partita_iva, numero_dipendenti,
      fatturato::text as fatturato, note, stato, alias, creato_il,
      public.puo_vedere_cliente(id) as completo, public.puo_lavorare_cliente(id) as puo_lavorare
    from public.clienti where id = ${id}`
  if (!cliente) return null
  const { completo, puo_lavorare, ...base } = cliente
  const [titolari, compitiAperti, compitiChiusi] = await Promise.all([
    tx<SchedaCliente['titolari']>`select nome, cognome, principale from public.clienti_titolari where cliente_id = ${id} order by principale desc, ordine`,
    elencoCompiti(tx, { cliente: id, stato: 'aperti' }),
    elencoCompiti(tx, { cliente: id, stato: 'chiusi' }, 100),
  ])
  if (!completo) {
    return {
      cliente: base, completo, puoLavorare: false, titolari, email: [], indicatori: { iva: null, prima_nota: null }, storico: [],
      assegnati: [], storicoAssegnazioni: [], comunicazioni: [], compitiAperti, compitiChiusi, stessoTitolare: [], caselleCollegate: 0,
    }
  }
  const [email, indicatori, storico, assegnati, storicoAssegnazioni, comunicazioni, stessoTitolare, [{ caselle }]] = await Promise.all([
    tx<SchedaCliente['email']>`
      select e.indirizzo, e.tipo,
        (select count(*)::int from public.comunicazioni k where k.cliente_id = e.cliente_id and k.fonte = 'email_automatica'
           and lower(coalesce(k.mittente, '')) like '%' || e.indirizzo || '%') as riassunte,
        coalesce((select json_agg(json_build_object('id', c.id, 'nome', c.nome_visualizzazione))
                  from public.clienti_email x join public.clienti c on c.id = x.cliente_id
                  where x.indirizzo = e.indirizzo and x.cliente_id <> e.cliente_id), '[]') as altri_clienti
      from public.clienti_email e where e.cliente_id = ${id} order by e.tipo, e.indirizzo`,
    tx<{ tipo: 'iva' | 'prima_nota'; aggiornato_fino_al: string | null; non_applicabile: boolean; aggiornato_il: Date; da: string | null }[]>`
      select a.tipo, a.aggiornato_fino_al, a.non_applicabile, a.aggiornato_il, trim(u.nome || ' ' || u.cognome) as da
      from public.aggiornamenti_contabili a left join public.utenti u on u.id = a.aggiornato_da where a.cliente_id = ${id}`,
    tx<SchedaCliente['storico']>`
      select s.id, s.tipo, s.valore_precedente, s.valore_nuovo, s.na_precedente, s.na_nuovo, s.origine,
        trim(u.nome || ' ' || u.cognome) as da, coalesce(u.ruolo = 'agente', false) as da_agente, s.modificato_il
      from public.aggiornamenti_storico s left join public.utenti u on u.id = s.modificato_da
      where s.cliente_id = ${id} order by s.modificato_il desc limit 50`,
    tx<SchedaCliente['assegnati']>`
      select a.utente_id, trim(u.nome || ' ' || u.cognome) as nome, a.referente_principale as referente, a.dal
      from public.assegnazioni a join public.utenti u on u.id = a.utente_id
      where a.cliente_id = ${id} and a.al is null order by a.referente_principale desc, a.dal`,
    tx<SchedaCliente['storicoAssegnazioni']>`
      select trim(u.nome || ' ' || u.cognome) as nome, a.referente_principale as referente, a.dal, a.al,
        trim(d.nome || ' ' || d.cognome) as assegnato_da, trim(r.nome || ' ' || r.cognome) as rimosso_da
      from public.assegnazioni a join public.utenti u on u.id = a.utente_id left join public.utenti d on d.id = a.assegnato_da
      left join public.utenti r on r.id = a.rimosso_da
      where a.cliente_id = ${id} order by a.dal desc limit 30`,
    tx<SchedaCliente['comunicazioni']>`
      select k.id, k.data, k.canale, k.testo, k.fonte, trim(u.nome || ' ' || u.cognome) as autore, k.mittente, k.oggetto,
        k.allegati, k.numero_messaggio
      from public.comunicazioni k left join public.utenti u on u.id = k.autore_id
      where k.cliente_id = ${id} order by k.data desc, k.creato_il desc limit 300`,
    tx<SchedaCliente['stessoTitolare']>`select * from public.clienti_stesso_titolare(${id})`,
    tx<{ caselle: number }[]>`select public.caselle_collegate_studio() as caselle`,
  ])
  const ind: SchedaCliente['indicatori'] = { iva: null, prima_nota: null }
  for (const i of indicatori) ind[i.tipo] = i
  return {
    cliente: base, completo, puoLavorare: puo_lavorare, titolari, email, indicatori: ind, storico, assegnati, storicoAssegnazioni,
    comunicazioni, compitiAperti, compitiChiusi, stessoTitolare, caselleCollegate: caselle,
  }
}
