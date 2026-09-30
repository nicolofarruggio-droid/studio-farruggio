// Salva la specifica OpenAPI dell'API in docs/openapi.json (la stessa servita da /api/v1/openapi.json).
// Uso: npx tsx scripts/openapi.ts          → scrive il file
//      npx tsx scripts/openapi.ts --verifica → esce con errore se il file nel repository non è aggiornato
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { specificaOpenApi } from '../src/lib/api/openapi'

const file = path.resolve(import.meta.dirname, '../docs/openapi.json')
const testo = JSON.stringify(specificaOpenApi, null, 2) + '\n'

if (process.argv.includes('--verifica')) {
  let attuale = ''
  try {
    attuale = readFileSync(file, 'utf8')
  } catch {
    // file mancante: non aggiornato
  }
  if (attuale !== testo) {
    console.error('docs/openapi.json non è aggiornato: esegui "npx tsx scripts/openapi.ts"')
    process.exit(1)
  }
  console.log('docs/openapi.json è aggiornato')
} else {
  writeFileSync(file, testo)
  console.log('Scritto', path.relative(process.cwd(), file))
}
