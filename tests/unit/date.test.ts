import { describe, expect, it } from 'vitest'
import { descriviAggiornamento, fineMeseISO, menoMesiISO, oggiISO, scadenzaDaInput, statoIndicatore, inputDaScadenza } from '@/lib/date'

describe('date', () => {
  it('fine mese e sottrazione di mesi', () => {
    expect(fineMeseISO(2026, 2)).toBe('2026-02-28')
    expect(fineMeseISO(2024, 2)).toBe('2024-02-29')
    expect(menoMesiISO('2026-09-30', 2)).toBe('2026-07-30')
    expect(menoMesiISO('2026-03-31', 1)).toBe('2026-02-28')
    expect(menoMesiISO('2026-01-15', 2)).toBe('2025-11-15')
  })

  it('stato degli indicatori con soglia di 2 mesi (sezione 7)', () => {
    const oggi = '2026-09-30'
    expect(statoIndicatore({ aggiornato_fino_al: '2026-07-31', non_applicabile: false }, 2, oggi)).toBe('aggiornato')
    expect(statoIndicatore({ aggiornato_fino_al: '2026-06-30', non_applicabile: false }, 2, oggi)).toBe('in_ritardo')
    expect(statoIndicatore({ aggiornato_fino_al: null, non_applicabile: false }, 2, oggi)).toBe('da_impostare')
    expect(statoIndicatore(null, 2, oggi)).toBe('da_impostare')
    expect(statoIndicatore({ aggiornato_fino_al: '2020-01-31', non_applicabile: true }, 2, oggi)).toBe('non_applicabile')
    // a ottobre serve agosto
    expect(statoIndicatore({ aggiornato_fino_al: '2026-07-31', non_applicabile: false }, 2, '2026-10-01')).toBe('in_ritardo')
  })

  it('testo leggibile', () => {
    expect(descriviAggiornamento('2026-08-31')).toBe('agosto 2026')
    expect(descriviAggiornamento('2026-08-15')).toBe('15/08/2026')
  })

  it('le scadenze sono nel fuso di Roma, anche con ora legale', () => {
    expect(scadenzaDaInput('2026-07-10', '17:30').toISOString()).toBe('2026-07-10T15:30:00.000Z')
    expect(scadenzaDaInput('2026-12-10', '17:30').toISOString()).toBe('2026-12-10T16:30:00.000Z')
    expect(scadenzaDaInput('2026-12-10').toISOString()).toBe('2026-12-10T22:59:59.000Z')
    expect(inputDaScadenza('2026-07-10T15:30:00.000Z')).toEqual({ data: '2026-07-10', ora: '17:30' })
    expect(oggiISO(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01')
  })
})
