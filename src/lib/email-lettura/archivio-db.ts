import 'server-only'
import { comeSistema, conUtente } from '@/lib/db'
import { normalizzaOggetto } from './messaggi'
import type { Archivio, Precedente } from './motore'

// Archivio del controllo email nel database. Gira con comeSistema() perché è un processo del server
// (sezione 16.3, CLAUDE.md regola 3): nessun input dell'utente arriva qui senza controlli. Fa eccezione la
// scelta dei clienti, che rispetta ciò che vede il proprietario della casella.
// Per le email ignorate si salvano SOLO l'identificativo Gmail e il Message-ID.

export const archivioDb: Archivio = {
  async registraNuove(c, gmailIds, cursore) {
    return comeSistema((sql) =>
      sql.begin(async (tx) => {
        let n = 0
        if (gmailIds.length) {
          const r = await tx`
            insert into public.email_elaborate (studio_id, casella_id, gmail_id, esito)
            select ${c.studioId}, ${c.id}, x, 'in_attesa' from unnest(${gmailIds}::text[]) as x
            on conflict (casella_id, gmail_id) do nothing
            returning 1`
          n = r.length
        }
        // il cursore si sposta nella stessa transazione: nessun messaggio si perde tra un controllo e l'altro
        if (cursore) await tx`update public.caselle_email set cursore = ${cursore} where id = ${c.id}`
        return n
      }),
    )
  },

  async daElaborare(casellaId, limite) {
    const r = await comeSistema((sql) => sql<{ gmail_id: string }[]>`
      select gmail_id from public.email_elaborate
      where casella_id = ${casellaId} and esito in ('in_attesa', 'da_rielaborare') and tentativi < 5
      order by elaborata_il, gmail_id
      limit ${limite}`)
    return r.map((x) => x.gmail_id)
  },

  async clientiPerIndirizzi(c, indirizzi) {
    // Con i permessi del proprietario della casella: le sue email vanno solo su clienti che lui vede.
    // Così nessuno può "catturare" le email di un collega aggiungendo un indirizzo a un proprio cliente.
    const r = await conUtente({ id: c.utenteId, email: '' }, (tx) => tx<{ indirizzo: string; clienti: string[] }[]>`
      select e.indirizzo, array_agg(distinct e.cliente_id::text) as clienti
      from public.clienti_email e
      join public.clienti c on c.id = e.cliente_id and c.studio_id = e.studio_id
      where e.studio_id = ${c.studioId} and c.eliminato_il is null and e.indirizzo = any(${indirizzi}::text[])
      group by e.indirizzo`)
    return new Map(r.map((x) => [x.indirizzo, x.clienti]))
  },

  async segnaIgnorata(casellaId, gmailId, messageId) {
    await comeSistema((sql) => sql`
      update public.email_elaborate
         set esito = 'ignorata', message_id = ${messageId}, clienti = '{}', elaborata_il = now()
       where casella_id = ${casellaId} and gmail_id = ${gmailId}`)
  },

  async segnaAssociata(casellaId, gmailId, messageId, clienti) {
    await comeSistema((sql) => sql`
      update public.email_elaborate
         set esito = 'associata', message_id = ${messageId}, clienti = ${clienti}::uuid[], elaborata_il = now()
       where casella_id = ${casellaId} and gmail_id = ${gmailId}`)
  },

  async segnaNonRiuscita(casellaId, gmailIds) {
    if (!gmailIds.length) return
    await comeSistema((sql) => sql`
      update public.email_elaborate set tentativi = least(tentativi + 1, 100)
       where casella_id = ${casellaId} and gmail_id = any(${gmailIds}::text[])`)
  },

  async giaRiassunta(studioId, messageId, clienti) {
    const [r] = await comeSistema((sql) => sql<{ n: number }[]>`
      select count(distinct cliente_id)::int as n from public.comunicazioni
      where studio_id = ${studioId} and message_id = ${messageId} and cliente_id = any(${clienti}::uuid[])`)
    return r.n >= clienti.length
  },

  async precedenti({ studioId, casellaId, clienti, conversazione, oggettoNormalizzato, escludi }) {
    // stesso thread di Gmail in questa casella; in alternativa stesso oggetto normalizzato per lo stesso cliente
    const r = await comeSistema((sql) => sql<{
      id: string; data: Date; testo: string; message_id: string | null; conversazione: string | null; casella_id: string | null; oggetto: string | null
    }[]>`
      select id, data, testo, message_id, conversazione, casella_id::text as casella_id, oggetto
      from public.comunicazioni
      where studio_id = ${studioId} and cliente_id = any(${clienti}::uuid[])
        and fonte in ('email_automatica', 'email_incollata')
        and ((casella_id = ${casellaId} and conversazione = ${conversazione})
             or (oggetto is not null and data > now() - interval '1 year'))
      order by data desc
      limit 300`)
    const visti = new Set<string>(escludi)
    const esito: Precedente[] = []
    for (const x of r) {
      const stessoThread = x.casella_id === casellaId && x.conversazione === conversazione
      const stessoOggetto = Boolean(oggettoNormalizzato) && normalizzaOggetto(x.oggetto) === oggettoNormalizzato
      if (!stessoThread && !stessoOggetto) continue
      const chiave = x.message_id ?? x.id // la stessa email scritta per più clienti conta una volta
      if (visti.has(chiave)) continue
      visti.add(chiave)
      esito.push({ data: new Date(x.data), riassunto: x.testo })
    }
    return esito.reverse()
  },

  async salvaRiassunto(righe, casellaId, gmailId, messageId, clienti) {
    return comeSistema((sql) =>
      sql.begin(async (tx) => {
        let n = 0
        for (const r of righe) {
          // niente doppioni: la stessa email (Message-ID) ricevuta da più collaboratori resta una sola voce
          const x = await tx`
            insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id, casella_id,
              mittente, oggetto, allegati, conversazione, numero_messaggio, message_id)
            values (${r.studioId}, ${r.clienteId}, ${r.data}, 'email', ${r.testo}, 'email_automatica', ${r.autoreId},
              ${r.casellaId}, ${r.mittente}, ${r.oggetto}, ${r.allegati}::text[], ${r.conversazione}, ${r.numeroMessaggio},
              ${r.messageId})
            on conflict (studio_id, cliente_id, message_id) where message_id is not null do nothing
            returning 1`
          n += x.length
        }
        await tx`
          update public.email_elaborate
             set esito = 'associata', message_id = ${messageId}, clienti = ${clienti}::uuid[], elaborata_il = now()
           where casella_id = ${casellaId} and gmail_id = ${gmailId}`
        return n
      }),
    )
  },
}
