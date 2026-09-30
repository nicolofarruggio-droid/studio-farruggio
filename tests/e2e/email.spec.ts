import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { accedi, GIULIA, unico } from './aiuti'

// Criterio di accettazione (sezione 15): un'email da un indirizzo nella lista di un cliente diventa un riassunto
// nelle Comunicazioni del cliente; un'email da un indirizzo sconosciuto (anche con lo stesso dominio) non lascia tracce.
// Usa la casella di prova (GMAIL_SIMULATO=1) e l'AI simulata.
test('lettura email in sola lettura con la casella di prova', async ({ page }) => {
  test.setTimeout(180_000)
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/bigbrother', { max: 1, onnotice: () => {} })
  await sql`update public.studi set lettura_email_attiva = true where nome = 'Studio Farruggio (demo)'`
  const oggetto = `Fatture di settembre ${unico()}`
  try {
    await accedi(page, GIULIA)
    await page.goto('/email')
    const collega = page.getByRole('button', { name: 'Collega casella di prova' })
    if (await collega.isVisible().catch(() => false)) await collega.click()
    await page.getByLabel('Mittente').fill("Enzo D'Agosta <info@autoshop-esempio.it>")
    await page.getByLabel('Oggetto').fill(oggetto)
    await page.getByLabel("Testo dell'email").fill('Buongiorno, vi mando le fatture di settembre. Manca quella del gommista, arriva lunedì.')
    await page.getByRole('button', { name: /Simula/ }).click()
    await page.getByLabel('Mittente').fill('Magazzino <magazzino@autoshop-esempio.it>')
    await page.getByLabel('Oggetto').fill(`Segreto ${oggetto}`)
    await page.getByLabel("Testo dell'email").fill('Testo che non deve essere letto.')
    await page.getByRole('button', { name: /Simula/ }).click()
    await page.getByRole('button', { name: 'Controlla ora' }).click()
    await expect(page.getByText(/associat/i).first()).toBeVisible({ timeout: 60_000 })

    const [cliente] = await sql<{ id: string }[]>`select id from public.clienti where ragione_sociale = 'Auto Shop S.r.l.'`
    await page.goto(`/clienti/${cliente.id}`)
    await expect(page.getByText(oggetto).first()).toBeVisible()
    await expect(page.getByText(/Riassunto automatico dalla casella di Giulia Verdi/).first()).toBeVisible()

    // l'email sconosciuta non ha lasciato mittente, oggetto o testo nel database
    const tracce = await sql`select 1 from public.comunicazioni where oggetto like ${'Segreto%'} or testo like ${'%non deve essere letto%'}`
    expect(tracce.length).toBe(0)
  } finally {
    await sql`update public.studi set lettura_email_attiva = false where nome = 'Studio Farruggio (demo)'`
    await sql.end()
  }
})
