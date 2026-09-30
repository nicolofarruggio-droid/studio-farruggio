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

// Revisione di sicurezza: se il link non è partito per email (l'admin l'ha copiato), chi lo apre non sceglie
// subito una password ma conferma l'indirizzo; solo dopo l'account esiste, l'invito è accettato e si sceglie la password.
test('invito con link copiato: prima la conferma dell\'indirizzo, poi la password', async ({ page }) => {
  test.setTimeout(120_000)
  const email = `copiato.${unico()}@e2e-esempio.it`
  const codice = `e2e-${unico()}-codice-invito-copiato`
  const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/bigbrother', { max: 1, onnotice: () => {} })
  await sql`
    insert into public.inviti (studio_id, email, nome, cognome, ruolo, codice_hash, scade_il)
    select studio_id, ${email}, 'Sara', 'Copiata', 'collaboratore', encode(sha256(convert_to(${codice}, 'UTF8')), 'hex'), now() + interval '7 days'
    from public.utenti where email = ${ADMIN}`

  // qualcuno (per esempio chi ha visto il link) registra prima un account con quell'indirizzo e una sua password
  const ALTRA_PASSWORD = 'Password-di-altri-2026'
  await page.goto('/registrati')
  await page.getByLabel('Nome dello studio').fill('Studio Finto')
  await page.getByLabel('Nome', { exact: true }).fill('Sara')
  await page.getByLabel('Cognome').fill('Copiata')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password personale').fill(ALTRA_PASSWORD)
  await page.getByLabel('Ripeti la password').fill(ALTRA_PASSWORD)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Registra lo studio' }).click()
  await expect(page.getByText('Controlla la tua casella email')).toBeVisible()
  await fetch(`${process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`, { method: 'DELETE' })

  await page.goto(`/invito/${codice}`)
  await expect(page.getByText('Benvenuto, Sara')).toBeVisible()
  await expect(page.getByLabel('Scegli la tua password')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mandami il link di conferma' }).click()
  await expect(page.getByText(`Ti abbiamo mandato un'email a ${email}`)).toBeVisible()
  // nessun utente del gestionale finché l'indirizzo non è confermato
  expect(await sql`select 1 from public.utenti where email = ${email}`).toHaveLength(0)

  await page.goto(await linkDaEmail(email, '/auth/conferma'))
  await expect(page).toHaveURL(/\/reimposta-password/)
  await page.getByLabel('Nuova password').fill(PASSWORD)
  await page.getByLabel('Ripeti la password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Salva la password' }).click()
  await expect(page).toHaveURL(/\/email\/collega/)
  const [u] = await sql<{ ruolo: string }[]>`select ruolo from public.utenti where email = ${email}`
  expect(u.ruolo).toBe('collaboratore')

  // la password scelta funziona, quella dell'account registrato prima no (e nessuno "Studio Finto")
  await page.context().clearCookies()
  await page.goto('/accedi')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(ALTRA_PASSWORD)
  await page.getByRole('button', { name: 'Accedi', exact: true }).click()
  await expect(page.getByText('Email o password non corretti')).toBeVisible()
  expect(await sql`select 1 from public.studi where nome = 'Studio Finto'`).toHaveLength(0)
  await accedi(page, email)
  await expect(page).toHaveURL(/\/email\/collega|\/dashboard/)

  await sql`update public.utenti set attivo = false, disattivato_il = now() where email = ${email}`
  await sql.end()
})
