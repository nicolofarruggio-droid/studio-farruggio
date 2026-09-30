import { describe, expect, it } from 'vitest'
import { percorsoSicuro } from '@/lib/percorso-sicuro'

describe('percorsoSicuro', () => {
  it('accetta i percorsi interni', () => {
    expect(percorsoSicuro('/clienti?filtro=ritardo')).toBe('/clienti?filtro=ritardo')
    expect(percorsoSicuro('/invito/abc_DEF-123')).toBe('/invito/abc_DEF-123')
    expect(percorsoSicuro('/compiti/1#commenti')).toBe('/compiti/1#commenti')
  })

  it('rifiuta tutto ciò che può portare fuori dal sito', () => {
    for (const p of [
      null, undefined, '', 'https://altro.sito', '//altro.sito', '/\\altro.sito', '/\t/altro.sito', '/\n/altro.sito',
      '/\r/altro.sito', ' /x', 'javascript:alert(1)', '\\\\altro.sito',
    ]) {
      const r = percorsoSicuro(p as string)
      expect(r, String(p)).toBe('/dashboard')
    }
  })

  it('usa il predefinito indicato', () => {
    expect(percorsoSicuro('//x', '')).toBe('')
  })
})
