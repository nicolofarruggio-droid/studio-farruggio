// Documenti dei compiti (sezione 8): tipi e dimensioni ammessi, nome del file, percorso,
// link temporanei firmati dello spazio file locale e scrittura dei file su disco.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

vi.mock('server-only', () => ({}))

import {
  ACCEPT, TIPI_AMMESSI, contentDisposition, estensione, limiteByte, percorsoDocumento, pulisciNomeFile, tipoAnteprima, tipoPerAnteprima, validaFile,
} from '@/lib/documenti/regole'
import { linkCaricamentoLocale, linkScaricamentoLocale, verificaLinkLocale } from '@/lib/documenti/link-locali'
import { ErroreFileLocale, infoFileLocale, leggiFileLocale, percorsoSuDisco, scriviFileLocale } from '@/lib/documenti/locale'

const MB = 1024 * 1024
const MAX = 25 * MB
const SEGRETO = 'segreto-di-prova-lungo-abbastanza'

describe('limite di dimensione', () => {
  it('predefinito 25 MB, configurabile con DOCUMENTI_MAX_MB', () => {
    expect(limiteByte(undefined)).toBe(25 * MB)
    expect(limiteByte('')).toBe(25 * MB)
    expect(limiteByte('abc')).toBe(25 * MB)
    expect(limiteByte('-3')).toBe(25 * MB)
    expect(limiteByte('2')).toBe(2 * MB)
    expect(limiteByte('0.5')).toBe(MB / 2)
  })
})

describe('tipi di file ammessi', () => {
  it('accetta PDF, Word, Excel, immagini, CSV, testo e ZIP, registrando il tipo dell\'estensione', () => {
    const casi: [string, string, string][] = [
      ['contratto.pdf', 'application/pdf', 'application/pdf'],
      ['bozza.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['vecchio.doc', 'application/msword', 'application/msword'],
      ['bilancio.xlsx', '', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['foto.JPG', 'image/jpeg', 'image/jpeg'],
      ['scansione.png', 'image/png', 'image/png'],
      ['movimenti.csv', 'application/vnd.ms-excel', 'text/csv'], // Windows dichiara così i CSV
      ['note.txt', 'text/plain', 'text/plain'],
      ['archivio.zip', 'application/x-zip-compressed', 'application/zip'],
      ['fattura.xml', 'text/xml', 'application/xml'],
      ['fattura.xml.p7m', 'application/octet-stream', 'application/pkcs7-mime'],
    ]
    for (const [nome, tipo, atteso] of casi) {
      const v = validaFile({ nome, tipo, dimensione: 1000 }, MAX)
      expect(v, nome).toMatchObject({ ok: true, tipo: atteso })
    }
  })

  it('rifiuta programmi, pagine web, SVG e file senza estensione', () => {
    for (const nome of ['setup.exe', 'pagina.html', 'logo.svg', 'script.js', 'macro.bat', 'LEGGIMI', '.env']) {
      const v = validaFile({ nome, tipo: '', dimensione: 10 }, MAX)
      expect(v.ok, nome).toBe(false)
    }
    expect(validaFile({ nome: 'setup.exe', tipo: '', dimensione: 10 }, MAX)).toMatchObject({ ok: false, errore: expect.stringMatching(/non è ammesso/) })
    expect(validaFile({ nome: 'LEGGIMI', tipo: '', dimensione: 10 }, MAX)).toMatchObject({ ok: false, errore: expect.stringMatching(/manca l'estensione/) })
  })

  it("rifiuta un tipo MIME che non corrisponde all'estensione", () => {
    expect(validaFile({ nome: 'finto.pdf', tipo: 'text/html', dimensione: 10 }, MAX)).toMatchObject({ ok: false, errore: expect.stringMatching(/non corrisponde/) })
    expect(validaFile({ nome: 'foto.png', tipo: 'image/svg+xml', dimensione: 10 }, MAX).ok).toBe(false)
    // tipo generico o assente: decide l'estensione
    expect(validaFile({ nome: 'x.pdf', tipo: 'application/octet-stream', dimensione: 10 }, MAX).ok).toBe(true)
    expect(validaFile({ nome: 'x.pdf', tipo: 'application/pdf; charset=binary', dimensione: 10 }, MAX).ok).toBe(true)
  })

  it('controlla la dimensione: niente file vuoti, niente oltre il limite', () => {
    expect(validaFile({ nome: 'x.pdf', tipo: 'application/pdf', dimensione: 0 }, MAX)).toMatchObject({ ok: false, errore: expect.stringMatching(/vuoto/) })
    expect(validaFile({ nome: 'x.pdf', tipo: 'application/pdf', dimensione: MAX }, MAX).ok).toBe(true)
    expect(validaFile({ nome: 'x.pdf', tipo: 'application/pdf', dimensione: MAX + 1 }, MAX)).toMatchObject({ ok: false, errore: expect.stringMatching(/troppo grande: il limite è 25 MB/) })
    expect(validaFile({ nome: 'x.pdf', tipo: 'application/pdf', dimensione: Number.NaN }, MAX).ok).toBe(false)
  })

  it('anteprima nel browser solo per PDF, immagini, testo e CSV', () => {
    expect(tipoAnteprima('application/pdf')).toBe('pdf')
    expect(tipoAnteprima('image/jpeg')).toBe('immagine')
    expect(tipoAnteprima('text/csv')).toBe('testo')
    expect(tipoAnteprima('text/plain')).toBe('testo')
    expect(tipoAnteprima('application/zip')).toBeNull()
    expect(tipoAnteprima(WORD)).toBeNull()
    expect(tipoAnteprima('image/tiff')).toBeNull()
    // testo e CSV si mostrano come testo semplice, così il browser non li scarica
    expect(tipoPerAnteprima('text/csv')).toBe('text/plain; charset=utf-8')
    expect(tipoPerAnteprima('application/pdf')).toBe('application/pdf')
  })

  it('il campo file propone solo le estensioni ammesse', () => {
    expect(ACCEPT).toContain('.pdf')
    expect(ACCEPT).toContain('.xlsx')
    expect(ACCEPT).not.toContain('.exe')
    expect(ACCEPT).not.toContain('.svg')
  })
})

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('nome del file', () => {
  it('toglie i percorsi', () => {
    expect(pulisciNomeFile('../../etc/passwd.txt')).toBe('passwd.txt')
    expect(pulisciNomeFile('C:\\Users\\mario\\Documenti\\Fattura 12.pdf')).toBe('Fattura 12.pdf')
    expect(pulisciNomeFile('/tmp/../contratto.pdf')).toBe('contratto.pdf')
  })

  it('toglie caratteri di controllo, riservati e invisibili (anche quelli che invertono il testo)', () => {
    expect(pulisciNomeFile('fat\u0000tura\n.pdf')).toBe('fattura.pdf')
    expect(pulisciNomeFile('a<b>c:d"e|f?g*h.pdf')).toBe('abcdefgh.pdf')
    const ingannevole = pulisciNomeFile('fattura\u202efdp.exe')
    expect(ingannevole).toBe('fatturafdp.exe')
    expect(validaFile({ nome: 'fattura\u202efdp.exe', tipo: '', dimensione: 1 }, MAX).ok).toBe(false)
  })

  it('niente nomi nascosti, vuoti o con punti e spazi in fondo', () => {
    expect(pulisciNomeFile('..')).toBe('documento')
    expect(pulisciNomeFile('   ')).toBe('documento')
    expect(pulisciNomeFile('.nascosto.pdf')).toBe('nascosto.pdf')
    expect(pulisciNomeFile('relazione.pdf. . ')).toBe('relazione.pdf')
    expect(pulisciNomeFile('  due   spazi.pdf ')).toBe('due spazi.pdf')
  })

  it('mantiene accenti e simboli comuni, accorcia i nomi lunghi tenendo l\'estensione', () => {
    expect(pulisciNomeFile('Società Rossi & C. – bilancio 2025 (bozza).xlsx')).toBe('Società Rossi & C. – bilancio 2025 (bozza).xlsx')
    const lungo = pulisciNomeFile(`${'a'.repeat(400)}.pdf`)
    expect(lungo.length).toBeLessThanOrEqual(200)
    expect(estensione(lungo)).toBe('pdf')
  })

  it('estensione in minuscolo', () => {
    expect(estensione('Foto.JPEG')).toBe('jpeg')
    expect(estensione('senza')).toBe('')
    expect(estensione('.bashrc')).toBe('')
    expect(estensione('punto.')).toBe('')
  })

  it('intestazione per il download con nome sicuro e variante UTF-8', () => {
    const h = contentDisposition('attachment', 'Città "nuova";.pdf')
    // le virgolette spariscono già dal nome; il punto e virgola resta solo nella variante codificata
    expect(h).toBe(`attachment; filename="Citta nuova_.pdf"; filename*=UTF-8''Citt%C3%A0%20nuova%3B.pdf`)
    expect(contentDisposition('attachment', "l'atto (1).pdf")).toBe(`attachment; filename="l'atto (1).pdf"; filename*=UTF-8''l%27atto%20%281%29.pdf`)
    expect(contentDisposition('inline', 'a.pdf')).toMatch(/^inline;/)
  })
})

describe('percorso nello spazio file', () => {
  it('studio_id/compiti/compito_id/file_id, solo identificativi', () => {
    const [s, c, f] = [randomUUID(), randomUUID(), randomUUID()]
    expect(percorsoDocumento(s, c, f)).toBe(`${s}/compiti/${c}/${f}`)
    expect(() => percorsoDocumento(s, c, '../altro')).toThrow()
    expect(() => percorsoDocumento('..', c, f)).toThrow()
  })
})

describe('link temporanei dello spazio file locale', () => {
  const percorso = `${randomUUID()}/compiti/${randomUUID()}/${randomUUID()}`
  const adesso = Date.UTC(2026, 8, 30, 10, 0, 0)
  const opz = { adesso, segreto: SEGRETO }
  const q = (link: string) => new URL(link, 'http://localhost').searchParams

  it('un link di caricamento valido si verifica, con percorso e limite', () => {
    const link = linkCaricamentoLocale(percorso, 5 * MB, 600, opz)
    expect(link.startsWith('/api/file-locali?')).toBe(true)
    expect(verificaLinkLocale(q(link), 'carica', opz)).toEqual({ ok: true, azione: 'carica', percorso, maxByte: 5 * MB })
  })

  it('un link modificato non vale: altro percorso, limite più alto, altra azione, altro segreto', () => {
    const p = q(linkCaricamentoLocale(percorso, 5 * MB, 600, opz))
    const altroPercorso = new URLSearchParams(p)
    altroPercorso.set('p', `${randomUUID()}/compiti/${randomUUID()}/${randomUUID()}`)
    expect(verificaLinkLocale(altroPercorso, 'carica', opz)).toMatchObject({ ok: false, stato: 403 })
    const piuGrande = new URLSearchParams(p)
    piuGrande.set('m', String(500 * MB))
    expect(verificaLinkLocale(piuGrande, 'carica', opz)).toMatchObject({ ok: false, stato: 403 })
    const piuLungo = new URLSearchParams(p)
    piuLungo.set('s', String(Number(p.get('s')) + 3600))
    expect(verificaLinkLocale(piuLungo, 'carica', opz)).toMatchObject({ ok: false, stato: 403 })
    expect(verificaLinkLocale(p, 'scarica', opz)).toMatchObject({ ok: false, stato: 400 })
    expect(verificaLinkLocale(p, 'carica', { adesso, segreto: 'un-altro-segreto-di-prova' })).toMatchObject({ ok: false, stato: 403 })
  })

  it('il link scade dopo pochi minuti', () => {
    const p = q(linkScaricamentoLocale(percorso, { modo: 'scarica', nome: 'a.pdf', tipo: 'application/pdf' }, 300, opz))
    expect(verificaLinkLocale(p, 'scarica', { ...opz, adesso: adesso + 299_000 })).toMatchObject({ ok: true, modo: 'scarica', nome: 'a.pdf' })
    expect(verificaLinkLocale(p, 'scarica', { ...opz, adesso: adesso + 301_000 })).toMatchObject({ ok: false, stato: 410 })
  })

  it('nel link di download non si cambiano nome, tipo o modo (anteprima o scarica)', () => {
    const p = q(linkScaricamentoLocale(percorso, { modo: 'scarica', nome: 'a.pdf', tipo: 'application/pdf' }, 300, opz))
    for (const [k, v] of [['n', 'b.pdf'], ['t', 'text/html'], ['o', 'apri']]) {
      const x = new URLSearchParams(p)
      x.set(k, v)
      expect(verificaLinkLocale(x, 'scarica', opz), k).toMatchObject({ ok: false, stato: 403 })
    }
  })

  it('i percorsi non validi sono rifiutati', () => {
    expect(() => linkCaricamentoLocale('../../etc/passwd', 1, 60, opz)).toThrow()
    const p = q(linkCaricamentoLocale(percorso, MB, 600, opz))
    p.set('p', '../../etc/passwd')
    expect(verificaLinkLocale(p, 'carica', opz)).toMatchObject({ ok: false, stato: 400 })
  })

  it('senza segreto configurato non si creano link', () => {
    const prima = process.env.FILE_LOCALI_SEGRETO
    delete process.env.FILE_LOCALI_SEGRETO
    try {
      expect(() => linkCaricamentoLocale(percorso, MB, 60)).toThrow(/FILE_LOCALI_SEGRETO/)
    } finally {
      if (prima !== undefined) process.env.FILE_LOCALI_SEGRETO = prima
    }
  })
})

describe('spazio file locale su disco', () => {
  let base: string
  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'bbs-file-'))
  })
  afterAll(async () => {
    await rm(base, { recursive: true, force: true })
  })
  const corpo = (testo: string) => new Response(testo).body

  it('scrive, legge la dimensione reale e non sovrascrive mai', async () => {
    const p = `${randomUUID()}/compiti/${randomUUID()}/${randomUUID()}`
    await expect(scriviFileLocale(base, p, corpo('ciao mondo'), MB)).resolves.toEqual({ dimensione: 10 })
    expect(await infoFileLocale(base, p)).toEqual({ dimensione: 10 })
    expect(await readFile(percorsoSuDisco(base, p), 'utf8')).toBe('ciao mondo')
    await expect(scriviFileLocale(base, p, corpo('altro'), MB)).rejects.toMatchObject({ stato: 409 })
    expect(await readFile(percorsoSuDisco(base, p), 'utf8')).toBe('ciao mondo')
    const letto = await leggiFileLocale(base, p)
    expect(letto?.dimensione).toBe(10)
    expect(await new Response(letto!.corpo).text()).toBe('ciao mondo')
  })

  it('si ferma oltre il limite e non lascia file a metà', async () => {
    const p = `${randomUUID()}/compiti/${randomUUID()}/${randomUUID()}`
    const errore = await scriviFileLocale(base, p, corpo('x'.repeat(2000)), 1000).catch((e) => e)
    expect(errore).toBeInstanceOf(ErroreFileLocale)
    expect(errore.stato).toBe(413)
    expect(await infoFileLocale(base, p)).toBeNull()
  })

  it('non esce dalla cartella dei file', () => {
    expect(() => percorsoSuDisco(base, '../fuori')).toThrow()
    expect(() => percorsoSuDisco(base, `${randomUUID()}/compiti/../../x`)).toThrow()
  })
})

describe('tipi ammessi anche nel database', () => {
  it('la migrazione accetta esattamente i tipi registrati da regole.ts', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('supabase/migrations/20260930007000_solo_dal_server.sql', 'utf8')
    const blocco = sql.slice(sql.indexOf('if new.tipo not in ('), sql.indexOf(') then', sql.indexOf('if new.tipo not in (')))
    const nelDb = [...blocco.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    const nelCodice = [...new Set(Object.values(TIPI_AMMESSI).map((t) => t.mime))].sort()
    expect(nelDb).toEqual(nelCodice)
  })
})
