// Lettura dei file dei clienti (.xlsx, .xls, .csv, .ods) nel browser con SheetJS (@e965/xlsx).
// Le date di Excel si leggono come date vere (cellDates) e diventano "AAAA-MM-GG": così giorno e mese
// non si confondono. Se il formato della cella mostra solo mese e anno ("ago 2026") la data diventa
// "AAAA-MM" e poi l'ultimo giorno del mese. I CSV si leggono come testo, senza interpretare le date.
import type { CellObject, WorkBook } from '@e965/xlsx'
import { COLONNE_MASSIME } from './costanti'
import { dataDaExcel } from './normalizza'
import type { RigaFile } from './righe'

export const ESTENSIONI = ['.xlsx', '.xls', '.csv', '.ods'] as const
export const DIMENSIONE_MASSIMA = 15 * 1024 * 1024
export const RIGHE_MASSIME = 5000

export type Cartella = { nomeFile: string; fogli: string[]; libro: WorkBook }
export type FoglioLetto = { nome: string; righe: RigaFile[]; colonne: number }

export class ErroreFile extends Error {}

const xlsx = () => import('@e965/xlsx')

function estensione(nome: string): string {
  const i = nome.lastIndexOf('.')
  return i >= 0 ? nome.slice(i).toLowerCase() : ''
}

/** Testo di un CSV: UTF-8 (con o senza BOM), altrimenti Windows-1252 (Excel italiano). */
export function decodificaTesto(dati: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(dati).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(dati)
  }
}

export async function leggiCartella(dati: ArrayBuffer, nomeFile: string): Promise<Cartella> {
  const est = estensione(nomeFile)
  if (!(ESTENSIONI as readonly string[]).includes(est)) throw new ErroreFile('Formato non supportato: carica un file .xlsx, .xls, .csv o .ods.')
  if (dati.byteLength > DIMENSIONE_MASSIMA) throw new ErroreFile('Il file è troppo grande (massimo 15 MB).')
  const XLSX = await xlsx()
  let libro: WorkBook
  try {
    libro =
      est === '.csv'
        ? XLSX.read(decodificaTesto(dati), { type: 'string', raw: true, dense: false })
        : XLSX.read(new Uint8Array(dati), { type: 'array', cellDates: true, cellNF: true, cellHTML: false, cellFormula: false })
  } catch {
    throw new ErroreFile('Non riesco a leggere il file: controlla che non sia protetto da password o danneggiato.')
  }
  const fogli = libro.SheetNames.filter((n) => libro.Sheets[n]?.['!ref'])
  if (!fogli.length) throw new ErroreFile('Il file non contiene fogli con dati.')
  return { nomeFile, fogli, libro }
}

/** Il formato numerico mostra solo mese e anno (niente giorno): "mmm yyyy", "mm/yyyy", "[$-410]mmmm yy". */
export function formatoSoloMese(z: string | number | undefined): boolean {
  if (typeof z !== 'string') return false
  // nei file i codici di formato sono sempre quelli inglesi (d, m, y), anche con Excel in italiano
  const f = z.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').toLowerCase()
  return /m/.test(f) && /y/.test(f) && !/d/.test(f)
}

const formatoNumero = new Intl.NumberFormat('it-IT', { useGrouping: false, maximumFractionDigits: 10 })

/** Valore di una cella in testo. I numeri usano la virgola dei decimali, senza separatore delle migliaia. */
export function testoCella(c: CellObject | undefined): string {
  if (!c || c.v == null) return ''
  switch (c.t) {
    case 'd': {
      const d = c.v instanceof Date ? c.v : new Date(String(c.v))
      return dataDaExcel(d, formatoSoloMese(c.z)) ?? (c.w ?? '').trim()
    }
    case 'n':
      return typeof c.v === 'number' && Number.isFinite(c.v) ? formatoNumero.format(c.v) : ''
    case 'b':
      return c.v ? 'sì' : 'no'
    case 'e':
    case 'z':
      return ''
    default:
      return String(c.v).replace(/\r\n?/g, '\n').trim()
  }
}

/** Righe non vuote del foglio, con il numero di riga come in Excel. */
export async function leggiFoglio(cartella: Cartella, nome: string): Promise<FoglioLetto> {
  const XLSX = await xlsx()
  const foglio = cartella.libro.Sheets[nome]
  if (!foglio?.['!ref']) return { nome, righe: [], colonne: 0 }
  const area = XLSX.utils.decode_range(foglio['!ref'])
  const ultimaColonna = Math.min(area.e.c, area.s.c + COLONNE_MASSIME - 1)
  const righe: RigaFile[] = []
  let colonne = 0
  for (let r = area.s.r; r <= area.e.r; r++) {
    const celle: string[] = []
    for (let c = area.s.c; c <= ultimaColonna; c++) celle.push(testoCella(foglio[XLSX.utils.encode_cell({ r, c })] as CellObject | undefined))
    while (celle.length && !celle[celle.length - 1]) celle.pop()
    if (!celle.length) continue
    colonne = Math.max(colonne, celle.length)
    righe.push({ numero: r + 1, celle })
    if (righe.length > RIGHE_MASSIME) throw new ErroreFile(`Il foglio ha più di ${RIGHE_MASSIME} righe: dividilo in più file.`)
  }
  return { nome, righe: righe.map((x) => ({ ...x, celle: completa(x.celle, colonne) })), colonne }
}

function completa(celle: string[], n: number): string[] {
  return celle.length >= n ? celle : [...celle, ...Array<string>(n - celle.length).fill('')]
}
