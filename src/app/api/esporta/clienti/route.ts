import { NextResponse, type NextRequest } from 'next/server'
import * as XLSX from '@e965/xlsx'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { elencoClienti, COLONNE_ORDINABILI, type FiltriClienti } from '@/lib/dati/clienti'
import { oggiISO, statoIndicatore, type StatoIndicatore } from '@/lib/date'

const STATI: Record<StatoIndicatore, string> = {
  aggiornato: 'In regola', in_ritardo: 'In ritardo', da_impostare: 'Da impostare', non_applicabile: 'Non applicabile',
}

// Esportazione in Excel dell'elenco clienti, con gli stessi filtri della pagina (sezione 9).
export async function GET(request: NextRequest) {
  const { persona, studio } = await richiediUtente()
  const q = request.nextUrl.searchParams
  const f: FiltriClienti = {
    q: q.get('q') ?? '',
    collaboratore: q.get('collaboratore') ?? '',
    ritardo: (q.get('ritardo') ?? '') as FiltriClienti['ritardo'],
    stato: (q.get('stato') ?? '') as FiltriClienti['stato'],
    ordina: (q.get('ordina') ?? '') in COLONNE_ORDINABILI ? q.get('ordina')! : 'ragione_sociale',
    verso: q.get('verso') === 'desc' ? 'desc' : 'asc',
  }
  const { righe, email } = await conUtente(persona, async (tx) => {
    const righe = await elencoClienti(tx, f)
    const email = await tx<{ cliente_id: string; indirizzi: string }[]>`
      select cliente_id, string_agg(indirizzo, '; ' order by indirizzo) as indirizzi
      from public.clienti_email where cliente_id = any(${righe.map((r) => r.id)}::uuid[]) group by cliente_id`
    await tx`select public.registra_attivita('esportazione_clienti', 'cliente', null, ${tx.json({ righe: righe.length, filtri: { ...f } })})`
    return { righe, email: new Map(email.map((e) => [e.cliente_id, e.indirizzi])) }
  })

  const oggi = oggiISO()
  const dati = righe.map((r) => ({
    'Ragione sociale': r.ragione_sociale,
    'Nome di visualizzazione': r.nome_visualizzazione,
    Titolare: r.titolare ?? '',
    Referente: r.referente ?? '',
    'Aggiornamento IVA': r.iva?.non_applicabile ? 'Non applicabile' : r.iva?.aggiornato_fino_al ?? '',
    'Stato IVA': STATI[statoIndicatore(r.iva, studio.soglia_ritardo_iva_mesi, oggi)],
    'Aggiornamento prima nota': r.prima_nota?.non_applicabile ? 'Non applicabile' : r.prima_nota?.aggiornato_fino_al ?? '',
    'Stato prima nota': STATI[statoIndicatore(r.prima_nota, studio.soglia_ritardo_prima_nota_mesi, oggi)],
    'N. dipendenti': r.numero_dipendenti ?? '',
    'Fatturato (€)': r.fatturato ? Number(r.fatturato) : '',
    'Partita IVA': r.partita_iva ?? '',
    Email: email.get(r.id) ?? '',
    'Compiti aperti': r.compiti_aperti,
    Stato: r.stato === 'attivo' ? 'Attivo' : 'Archiviato',
  }))
  const foglio = XLSX.utils.json_to_sheet(dati)
  foglio['!cols'] = [40, 45, 25, 22, 18, 14, 22, 16, 13, 15, 14, 40, 14, 11].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, foglio, 'Clienti')
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="clienti-${oggi}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
