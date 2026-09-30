import { expect, test } from '@playwright/test'
import { accedi, ADMIN, ADMIN_B, GIULIA, linkDaEmail, PASSWORD, unico } from './aiuti'

test('chi non ha fatto accesso viene mandato al login', async ({ page }) => {
  await page.goto('/clienti')
  await expect(page).toHaveURL(/\/accedi\?next=%2Fclienti/)
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible()
})

test('password sbagliata: messaggio esplicito', async ({ page }) => {
  await page.goto('/accedi')
  await page.getByLabel('Email').fill(ADMIN)
  await page.getByLabel('Password', { exact: true }).fill('sbagliata-123456')
  await page.getByRole('button', { name: 'Accedi', exact: true }).click()
  await expect(page.getByText('Email o password non corretti.')).toBeVisible()
})

test("l'admin vede la dashboard con collaboratori e ritardi", async ({ page }) => {
  await accedi(page, ADMIN)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Collaboratori' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Entra nella vista di Giulia Verdi' })).toBeVisible()
})

test('un collaboratore vede solo i propri clienti e non apre quelli degli altri nemmeno con il link', async ({ page, request }) => {
  await accedi(page, ADMIN)
  await page.goto('/clienti?q=Trasporti')
  const link = page.getByRole('link', { name: 'Trasporti Veloci S.r.l.' })
  const href = await link.getAttribute('href')
  expect(href).toBeTruthy()
  await page.context().clearCookies()

  await accedi(page, GIULIA)
  await page.goto('/clienti')
  await expect(page.getByRole('heading', { name: 'I miei clienti' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trasporti Veloci S.r.l.' })).toHaveCount(0)
  const risposta = await page.goto(href!)
  expect(risposta?.status()).toBe(404)
  void request
})

test('un altro studio non vede nulla del primo', async ({ page }) => {
  await accedi(page, ADMIN_B)
  await page.goto('/clienti?q=Auto%20Shop')
  await expect(page.getByText('Nessun cliente trovato.')).toBeVisible()
})

test('registrazione di un nuovo studio con conferma dell\'email', async ({ page }) => {
  const email = `titolare.${unico()}@e2e-esempio.it`
  await page.goto('/registrati')
  await page.getByLabel('Nome dello studio').fill('Studio Prova E2E')
  await page.getByLabel('Nome', { exact: true }).fill('Anna')
  await page.getByLabel('Cognome').fill('Prova')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password personale').fill(PASSWORD)
  await page.getByLabel('Ripeti la password').fill(PASSWORD)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Registra lo studio' }).click()
  await expect(page.getByText('Controlla la tua casella email')).toBeVisible()

  const link = await linkDaEmail(email, '/auth/conferma')
  await page.goto(link)
  await expect(page).toHaveURL(/\/email\/collega/)
  await page.getByRole('button', { name: /Più tardi|Continua/ }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('Studio Prova E2E').first()).toBeVisible()
})
