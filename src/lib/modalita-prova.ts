// Modalità di prova (AI_SIMULATA, GMAIL_SIMULATO): solo sviluppo e test automatici, mai in produzione.
// Con `next start` (NODE_ENV=production) servono anche CONSENTI_MODALITA_PROVA=1, come nei test end-to-end;
// su Vercel in produzione restano spente in ogni caso.
export function modalitaProvaConsentita(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  return process.env.NODE_ENV !== 'production' || process.env.CONSENTI_MODALITA_PROVA === '1'
}
