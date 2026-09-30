import 'server-only'
import type { Tx } from '@/lib/db'

export type Notifica = {
  id: string
  tipo: 'assegnato' | 'pronto' | 'documenti' | 'rimandato' | 'casella' | 'agente' | 'proposta'
  compito_id: string | null
  testo: string
  motivo: string | null
  letta: boolean
  creata_il: Date
}

export async function ultimeNotifiche(tx: Tx): Promise<{ elenco: Notifica[]; nonLette: number }> {
  const elenco = await tx<Notifica[]>`
    select id, tipo, compito_id, testo, motivo, letta, creata_il from public.notifiche
    order by creata_il desc limit 30`
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.notifiche where not letta`
  return { elenco, nonLette: n }
}
