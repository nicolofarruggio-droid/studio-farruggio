// Importazione delle assegnazioni cliente-collaboratore da file (sezione 6). Funzioni pure.
import { campoDaIntestazione } from './intestazioni'
import { chiavePartitaIva, chiaveTesto } from './normalizza'
import { chiaveRagione, type ClienteEsistente } from './righe'

export type ColonneAssegnazioni = { cliente: number | null; partitaIva: number | null; collaboratore: number | null }

/** Colonne del cliente (ragione sociale, nome o partita IVA) e del collaboratore, dai nomi dell'intestazione. */
export function riconosciColonneAssegnazioni(intestazione: string[]): ColonneAssegnazioni {
  const campi = intestazione.map((h) => campoDaIntestazione(h))
  const trova = (...c: string[]) => {
    for (const x of c) {
      const i = campi.indexOf(x as never)
      if (i >= 0) return i
    }
    return null
  }
  return {
    cliente: trova('nome_azienda', 'titolari', 'titolari_cognome_nome'),
    partitaIva: trova('partita_iva'),
    collaboratore: trova('collaboratore'),
  }
}

export type IndiceClienti = {
  partitaIva: Map<string, ClienteEsistente[]>
  nome: Map<string, ClienteEsistente[]>
  ragione: Map<string, ClienteEsistente[]>
}

function aggiungi(m: Map<string, ClienteEsistente[]>, k: string | null, c: ClienteEsistente) {
  if (!k) return
  const l = m.get(k)
  if (!l) m.set(k, [c])
  else if (!l.includes(c)) l.push(c)
}

export function indiceClienti(clienti: ClienteEsistente[]): IndiceClienti {
  const i: IndiceClienti = { partitaIva: new Map(), nome: new Map(), ragione: new Map() }
  for (const c of clienti) {
    aggiungi(i.partitaIva, chiavePartitaIva(c.partita_iva), c)
    aggiungi(i.nome, chiaveTesto(c.nome_visualizzazione), c)
    aggiungi(i.ragione, chiaveRagione(c.ragione_sociale), c)
  }
  return i
}

/**
 * Clienti dello studio che corrispondono alla riga: prima per partita IVA, poi per nome di visualizzazione,
 * poi per ragione sociale (senza forma societaria). Più di un risultato = da scegliere a mano.
 */
export function candidatiCliente(testo: string | null | undefined, partitaIva: string | null | undefined, indice: IndiceClienti): ClienteEsistente[] {
  const p = chiavePartitaIva(partitaIva) ?? chiavePartitaIva(testo)
  if (p && indice.partitaIva.has(p)) return indice.partitaIva.get(p)!
  const t = (testo ?? '').trim()
  if (!t) return []
  const perNome = indice.nome.get(chiaveTesto(t))
  if (perNome?.length) return perNome
  return indice.ragione.get(chiaveRagione(t)) ?? []
}
