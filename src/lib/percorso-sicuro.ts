// Redirect dopo l'accesso: solo percorsi interni del sito (niente redirect verso altri domini).
const BASE = 'http://sito.invalid'

/**
 * Accetta solo percorsi interni. Il controllo è fatto come lo farebbe il browser (URL risolta rispetto
 * a un'origine fittizia), dopo aver scartato caratteri di controllo e barre rovesciate che i browser
 * ignorano o convertono (es. "/\t/altro.sito" diventa "//altro.sito").
 */
export function percorsoSicuro(next: string | null | undefined, predefinito = '/dashboard'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2000) return predefinito
  if (/[\u0000- \u007f-\u009f\\]/.test(next)) return predefinito
  if (next.startsWith('//')) return predefinito
  try {
    const u = new URL(next, BASE)
    if (u.origin !== BASE) return predefinito
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return predefinito
  }
}
