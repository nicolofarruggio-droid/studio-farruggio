import { NextResponse, type NextRequest } from 'next/server'
import * as XLSX from '@e965/xlsx'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { datiEsportazione } from '@/lib/dati/studio'
import { formattaDataOra, oggiISO } from '@/lib/date'

// Esportazione completa dei dati dello studio (sezione 11): un file Excel con un foglio per tabella
// principale. Solo admin (gli agenti non possono mai esportare l'intero archivio, sezione 13.3).
// Legge con i permessi dell'admin (RLS), quindi mai dati di altri studi; niente token né segreti.
// POST (dal pulsante della pagina Impostazioni): un link GET potrebbe partire da solo con il prefetch.

const MAX_CELLA = 32000 // Excel accetta al massimo 32.767 caratteri per cella

function cella(v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return formattaDataOra(v)
  if (typeof v === 'boolean') return v ? 'sì' : 'no'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string' && v.length > MAX_CELLA) return v.slice(0, MAX_CELLA) + ' […]'
  return v
}

const intestazione = (k: string) => {
  const t = k.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export async function POST(request: NextRequest) {
  const origine = request.headers.get('origin')
  if (origine && origine !== request.nextUrl.origin) {
    return NextResponse.json({ errore: 'Richiesta non valida' }, { status: 403 })
  }
  const { persona, studio } = await richiediAdmin()
  const fogli = await conUtente(persona, async (tx) => {
    const f = await datiEsportazione(tx)
    const righe = Object.fromEntries(f.map((x) => [x.nome, x.righe.length]))
    await tx`select public.registra_attivita('esportazione_dati', 'studio', ${studio.id}, ${tx.json({ righe })})`
    return f
  })

  const libro = XLSX.utils.book_new()
  for (const f of fogli) {
    const righe = f.righe.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [intestazione(k), cella(v)])))
    const foglio = righe.length ? XLSX.utils.json_to_sheet(righe) : XLSX.utils.aoa_to_sheet([['Nessun dato']])
    XLSX.utils.book_append_sheet(libro, foglio, f.nome.slice(0, 31))
  }
  const file = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
  const nome = `dati-${studio.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'studio'}-${oggiISO()}.xlsx`
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
