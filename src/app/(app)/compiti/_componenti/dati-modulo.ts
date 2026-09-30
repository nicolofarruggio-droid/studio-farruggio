import 'server-only'
import type { Tx } from '@/lib/db'
import type { Contesto } from '@/lib/auth/sessione'
import { clientiSelezionabili, personeAssegnabili } from '@/lib/dati/scheda-compito'
import type { OpzioneCliente } from './combobox-cliente'
import type { PersonaAssegnabile } from './modulo-compito'

const perRicerca = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Clienti e persone per il modulo compito, già pronti per i componenti. */
export async function datiModulo(
  tx: Tx, c: Contesto, attuale: { cliente: string | null; assegnatari: { id: string; nome: string; ruolo: string }[] } | null,
) {
  const [clienti, persone] = await Promise.all([clientiSelezionabili(tx, attuale?.cliente ?? null), personeAssegnabili(tx)])
  const opzioni: OpzioneCliente[] = clienti.map((k) => ({
    id: k.id,
    nome: k.nome,
    // nel dettaglio solo ciò che il nome non dice già: altri titolari e referente
    dettaglio: [
      !k.nome.startsWith(k.ragione_sociale) ? k.ragione_sociale : null,
      k.titolari.split(', ').filter((t) => t && !k.nome.includes(t)).join(', ') || null,
      k.referente ? `referente: ${k.referente}` : 'senza referente',
    ].filter(Boolean).join(' · '),
    ricerca: perRicerca(`${k.nome} ${k.ragione_sociale} ${k.titolari}`),
    referente_id: k.referente_id,
  }))
  const elenco: PersonaAssegnabile[] = persone.map((p) => ({ id: p.id, nome: p.nome, ruolo: p.ruolo, io: p.id === c.utente.id }))
  // chi è già assegnato resta visibile nel menu anche se ora non si potrebbe scegliere
  for (const a of attuale?.assegnatari ?? []) {
    if (!elenco.some((p) => p.id === a.id)) elenco.push({ id: a.id, nome: a.nome, ruolo: a.ruolo, io: a.id === c.utente.id, nonAssegnabile: true })
  }
  const soloPerSe = c.utente.ruolo !== 'admin' && c.studio.creazione_compiti === 'per_se'
  return { clienti: opzioni, persone: elenco, soloPerSe }
}
