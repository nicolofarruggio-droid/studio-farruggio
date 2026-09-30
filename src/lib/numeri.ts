/**
 * Legge un importo scritto all'italiana o no: "1.250.000 €", "1.250.000,00", "1250000.5", "1 250 000".
 * Restituisce null se non è un numero valido.
 */
export function leggiImporto(testo: string): number | null {
  let s = testo.replace(/[€\s]|EUR/gi, '').replace(/'/g, '')
  if (!s) return null
  const virgola = s.includes(',')
  const punti = (s.match(/\./g) ?? []).length
  if (virgola && punti) s = s.replace(/\./g, '').replace(',', '.')
  else if (virgola) s = s.replace(',', '.')
  else if (punti > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
