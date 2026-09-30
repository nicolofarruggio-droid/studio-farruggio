import { describe, expect, it } from 'vitest'
import { nomeUnico, nomeVisualizzazione, ragioneBreve } from '@/lib/clienti/nome'

describe('nome di visualizzazione del cliente', () => {
  it('ragione sociale e titolare', () => {
    expect(nomeVisualizzazione('Auto Shop S.r.l.', { nome: 'Enzo', cognome: "D'Agosta" })).toBe("Auto Shop — Enzo D'Agosta")
    expect(nomeVisualizzazione('Rossi Costruzioni S.p.A.', { nome: 'Mario', cognome: 'Rossi' })).toBe('Rossi Costruzioni — Mario Rossi')
    expect(nomeVisualizzazione('Bar Centrale di Neri Paolo', { nome: 'Paolo', cognome: 'Neri' })).toBe('Bar Centrale di Neri Paolo — Paolo Neri')
    expect(nomeVisualizzazione('Tech Solutions srls', null)).toBe('Tech Solutions')
    expect(ragioneBreve('S.r.l.')).toBe('S.r.l.')
  })
  it('unico nello studio', () => {
    const usati = new Set(['auto shop — enzo d\'agosta'])
    expect(nomeUnico("Auto Shop — Enzo D'Agosta", usati)).toBe("Auto Shop — Enzo D'Agosta (2)")
    expect(nomeUnico("Auto Shop — Enzo D'Agosta", usati)).toBe("Auto Shop — Enzo D'Agosta (3)")
  })
})
