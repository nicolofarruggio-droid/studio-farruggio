import { expect, test } from '@playwright/test'
import { accedi, ADMIN, GIULIA, unico } from './aiuti'

test('il collaboratore aggiorna la prima nota dalla lista in pochi clic e lo storico lo registra', async ({ page }) => {
  await accedi(page, GIULIA)
  await page.goto('/clienti?q=Gelateria')
  await page.getByRole('button', { name: 'Aggiorna Prima nota di Gelateria Dolce Vita' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Aggiornata / }).first().click()
  await expect(page.getByText(/Prima nota di Gelateria Dolce Vita: aggiornata/)).toBeVisible()
  await page.getByRole('link', { name: 'Gelateria Dolce Vita' }).click()
  await page.getByText(/Storico delle modifiche/).click()
  await expect(page.getByRole('cell', { name: 'Giulia Verdi' }).first()).toBeVisible()
})

test("l'admin crea un cliente, aggiunge un indirizzo email e una comunicazione a mano", async ({ page }) => {
  const nome = `Cliente Prova ${unico()}`
  await accedi(page, ADMIN)
  await page.goto('/clienti/nuovo')
  await page.getByLabel('Ragione sociale').fill(`${nome} S.r.l.`)
  await page.getByLabel('Nome (titolare principale)').fill('Mario')
  await page.getByLabel('Cognome').first().fill('Bianchi')
  await page.getByLabel('Collaboratore referente').selectOption({ label: 'Giulia Verdi' })
  await page.getByRole('button', { name: 'Crea il cliente' }).click()
  await expect(page.getByRole('heading', { name: `${nome} — Mario Bianchi` })).toBeVisible()
  await expect(page.getByText(/senza, le sue email non possono essere collegate/)).toBeVisible()

  await page.getByLabel('Aggiungi un indirizzo').fill(`amministrazione@${unico()}-esempio.it`)
  await page.getByRole('button', { name: 'Aggiungi indirizzo' }).click()
  await expect(page.getByText(/Indirizzo aggiunto/)).toBeVisible()

  await page.getByLabel('Canale').selectOption('telefono')
  await page.getByLabel('Descrizione').fill('Ha chiamato per il modello F24 di ottobre.')
  await page.getByRole('button', { name: 'Aggiungi allo storico' }).click()
  await expect(page.getByText('Ha chiamato per il modello F24 di ottobre.')).toBeVisible()
  await expect(page.getByText('Scritto da Nicolò Farruggio')).toBeVisible()

  // eliminazione con conferma: il pulsante attivo è Annulla
  await page.goto(`/clienti?q=${encodeURIComponent(nome)}`)
  await page.getByRole('checkbox', { name: `Seleziona ${nome} S.r.l.` }).check()
  await page.getByRole('button', { name: 'Elimina' }).click()
  await expect(page.getByRole('heading', { name: 'Sei sicuro di voler eliminare questo cliente?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Annulla' })).toBeFocused()
  await page.getByRole('button', { name: 'ELIMINA' }).click()
  await expect(page.getByText(/resta nel cestino/)).toBeVisible()
  await page.goto('/studio/cestino')
  await expect(page.getByRole('cell', { name: `${nome} — Mario Bianchi` })).toBeVisible()
})

test('elenco clienti: ordinamento per fatturato con i valori mancanti in fondo @telefono', async ({ page }) => {
  await accedi(page, ADMIN)
  await page.goto('/clienti?ordina=fatturato&verso=desc')
  const prima = page.locator('tbody tr').first()
  await expect(prima).toContainText('Rossi Costruzioni')
  const ultima = page.locator('tbody tr').last()
  await expect(ultima.locator('td').nth(7)).toHaveText('—')
})
