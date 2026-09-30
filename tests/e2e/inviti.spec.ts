import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { accedi, ADMIN, linkDaEmail, PASSWORD, unico } from './aiuti'

// Criterio di accettazione (sezione 15): l'admin invita scrivendo nome, cognome ed email; la persona riceve
// l'email, sceglie la sua password ed entra nel suo spazio.
test("invito di un collaboratore, scelta della password e primo accesso", async ({ page }) => {
  test.setTimeout(120_000)
  const email = `nuovo.${unico()}@e2e-esempio.it`
  await accedi(page, ADMIN)
  await page.goto('/studio/utenti')
  await page.locator('#invito-nome').fill('Laura')
  await page.locator('#invito-cognome').fill('Nuova')
  await page.locator('#invito-email').fill(email)
  await page.locator('#invito-ruolo').selectOption('collaboratore')
  await page.getByRole('button', { name: 'Invita', exact: true }).click()
  await expect(page.getByText(email).first()).toBeVisible()
  await page.context().clearCookies()

  const link = await linkDaEmail(email, '/invito/')
  await page.goto(link)
  await expect(page.getByText('Studio Farruggio (demo)').first()).toBeVisible()
  await page.getByLabel('Scegli la tua password').fill(PASSWORD)
  await page.getByLabel('Ripeti la password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Salva la password ed entra' }).click()
  await expect(page).toHaveURL(/\/email\/collega/)
  await page.getByRole('button', { name: /Più tardi|Continua/ }).click()
  await expect(page.getByRole('heading', { name: 'Ciao, Laura' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'I miei clienti' })).toBeVisible()

  // il link è già usato
  await page.context().clearCookies()
  await page.goto(link)
  await expect(page.getByText('Invito già usato')).toBeVisible()

  // pulizia: la persona di prova viene disattivata
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/bigbrother', { max: 1, onnotice: () => {} })
  await sql`update public.utenti set attivo = false, disattivato_il = now() where email = ${email}`
  await sql.end()
})
