import { chromium } from '@playwright/test'
const dir = process.env.DIR
const [email, ...pagine] = process.argv.slice(2)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await page.goto('http://localhost:3000/accedi')
await page.getByLabel('Email').fill(email)
await page.getByLabel('Password', { exact: true }).fill('Prova-BigBrother-2026')
await page.getByRole('button', { name: 'Accedi', exact: true }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/accedi'), { timeout: 30000 }).catch(() => {})
console.log('dopo login:', page.url())
for (const p of pagine) {
  await page.goto('http://localhost:3000' + p)
  await page.waitForLoadState('networkidle')
  const nome = p.replace(/[^a-z0-9]/gi, '_') || 'home'
  await page.screenshot({ path: `${dir}/${email.split('@')[0]}${nome}.png`, fullPage: true })
  console.log('ok', p, page.url())
}
await browser.close()
