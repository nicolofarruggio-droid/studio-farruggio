import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'Prova-BigBrother-2026'
export const ADMIN = 'nicolo.farruggio@studio-demo.it'
export const GIULIA = 'giulia.verdi@studio-demo.it'
export const MARCO = 'marco.russo@studio-demo.it'
export const ADMIN_B = 'paola.bianchi@bianchi-demo.it'
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'

export async function accedi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/accedi')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Accedi', exact: true }).click()
  await expect(page).not.toHaveURL(/\/accedi/)
}

export async function esci(page: Page) {
  await page.context().clearCookies()
}

/** Ultimo link ricevuto per email dall'indirizzo indicato (Mailpit). */
export async function linkDaEmail(destinatario: string, contiene: string, tentativi = 20): Promise<string> {
  for (let i = 0; i < tentativi; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${destinatario}"`)}`)
    const dati = (await r.json()) as { messages: { ID: string }[] }
    for (const m of dati.messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML: string; Text: string }
      const link = [...(msg.HTML + msg.Text).matchAll(/https?:\/\/[^\s"'<>]+/g)].map((x) => x[0].replace(/&amp;/g, '&')).find((l) => l.includes(contiene))
      if (link) return link
    }
    await new Promise((res) => setTimeout(res, 500))
  }
  throw new Error(`Nessuna email con "${contiene}" per ${destinatario}`)
}

export const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
