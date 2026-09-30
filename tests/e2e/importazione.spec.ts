import { expect, test } from '@playwright/test'
import path from 'node:path'
import postgres from 'postgres'
import { accedi, ADMIN } from './aiuti'

// Criterio di accettazione (sezione 15): importazione da un Excel senza formato standard, con analisi AI
// (simulata in test), anteprima con errori e doppioni segnalati, conferma e clienti creati.
test('importazione clienti da Excel con analisi AI e anteprima', async ({ page }) => {
  test.setTimeout(180_000)
  const inizio = new Date()
  await accedi(page, ADMIN)
  await page.goto('/clienti/importa')
  await page.getByLabel('File dei clienti').setInputFiles(path.resolve('tests/fixtures/clienti-esempio.xlsx'))
  await page.getByRole('button', { name: /Analizza con l.AI/ }).click()
  await expect(page.getByText(/30 di 30 righe analizzate|Analisi completata/).first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/Ragione sociale mancante|ragione sociale mancante/).first()).toBeVisible()
  const importa = page.getByRole('button', { name: /^Importa \d+ client/ })
  await importa.click()
  await expect(page.getByText(/Importati \d+ clienti/)).toBeVisible({ timeout: 60_000 })

  // pulizia: i clienti creati da questa prova vanno nel cestino (il database di sviluppo resta com'era)
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/bigbrother', { max: 1, onnotice: () => {} })
  const creati = await sql`delete from public.clienti c using public.utenti u
    where u.id = c.creato_da and u.email = ${ADMIN} and c.creato_il >= ${inizio} returning c.id`
  expect(creati.length).toBeGreaterThan(10)
  await sql.end()
})
