import type { NextRequest } from 'next/server'
import * as XLSX from '@e965/xlsx'
import { conUtente } from '@/lib/db'
import { leggiSessione } from '@/lib/auth/sessione'
import { elencoCompiti, ETICHETTE_PRIORITA, ETICHETTE_STATO } from '@/lib/dati/compiti'
import { formattaData, formattaOra, oggiISO } from '@/lib/date'
import { contentDisposition } from '@/lib/documenti/regole'
import { leggiParametri, ordinaCompiti } from '../_componenti/filtri-url'

// Esportazione in Excel dell'elenco compiti con gli stessi filtri e lo stesso ordinamento della pagina
// (sezione 13.1). Le righe le filtra RLS come nella pagina.

export async function GET(request: NextRequest) {
  const sessione = await leggiSessione()
  if (!sessione?.utente?.attivo || sessione.serveSecondoPassaggio) return new Response('Accesso non consentito.', { status: 403 })
  const parametri = leggiParametri(Object.fromEntries(request.nextUrl.searchParams))
  const compiti = ordinaCompiti(
    await conUtente(sessione.persona, async (tx) => {
      const righe = await elencoCompiti(tx, parametri.filtri, 5000)
      await tx`select public.registra_attivita('esportazione_compiti', 'compito', null, ${tx.json({ righe: righe.length })})`
      return righe
    }),
    parametri.ordina, parametri.verso,
  )
  const righe = compiti.map((k) => ({
    Compito: k.titolo,
    Cliente: k.cliente ?? 'Senza cliente',
    'Assegnato a': k.assegnatari.map((a) => a.nome).join(', '),
    Scadenza: k.scadenza ? formattaData(k.scadenza) : 'Senza scadenza',
    Ora: k.scadenza && k.scadenza_con_orario ? formattaOra(k.scadenza) : '',
    Priorità: ETICHETTE_PRIORITA[k.priorita],
    Stato: ETICHETTE_STATO[k.stato],
    Documenti: k.documenti,
    'Creato da': k.creato_da_agente ? `agente · ${k.creato_da_nome ?? ''}` : k.creato_da_nome ?? '',
    'Creato il': formattaData(k.creato_il),
    'Completato il': k.completato_il ? formattaData(k.completato_il) : '',
    Collegamento: new URL(`/compiti/${k.id}`, request.url).toString(),
  }))
  const foglio = XLSX.utils.json_to_sheet(righe)
  foglio['!cols'] = [{ wch: 45 }, { wch: 30 }, { wch: 25 }, { wch: 14 }, { wch: 7 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 50 }]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, foglio, 'Compiti')
  const dati = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new Response(new Uint8Array(dati), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': contentDisposition('attachment', `compiti-${oggiISO()}.xlsx`),
      'cache-control': 'no-store',
    },
  })
}
