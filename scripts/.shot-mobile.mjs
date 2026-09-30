import { chromium, devices } from '@playwright/test'
const dir = process.env.DIR
const [email, ...pagine] = process.argv.slice(2)
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'it-IT' })
const page = await ctx.newPage()
await page.goto('http://localhost:3000/accedi')
await page.getByLabel('Email').fill(email)
await page.getByLabel('Password', { exact: true }).fill('Prova-BigBrother-2026')
await page.getByRole('button', { name: 'Accedi', exact: true }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/accedi'))
for (const p of pagine) {
  await page.goto('http://localhost:3000' + p)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${dir}/m-${email.split('@')[0]}${p.replace(/[^a-z0-9]/gi, '_')}.png`, fullPage: false })
}
await browser.close()
