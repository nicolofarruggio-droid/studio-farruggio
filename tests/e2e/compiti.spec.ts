import { expect, test } from '@playwright/test'
import { accedi, ADMIN, GIULIA, unico } from './aiuti'

// Criterio di accettazione (sezione 15): l'admin assegna un compito con scadenza e documento, il collaboratore
// lo lavora, segnala "pronto per revisione", l'admin lo rimanda indietro con una spiegazione e poi lo chiude;
// i documenti restano consultabili e nessuno può eliminarli.
test('flusso completo di un compito con documenti, notifiche e rimando indietro', async ({ browser }) => {
  test.setTimeout(180_000)
  const titolo = `Contratto di affitto ${unico()}`
  const admin = await (await browser.newContext()).newPage()
  const giulia = await (await browser.newContext()).newPage()

  // 1. l'admin crea il compito per Giulia, con cliente, scadenza e un documento
  await accedi(admin, ADMIN)
  await admin.goto('/compiti/nuovo')
  await admin.getByLabel('Titolo').fill(titolo)
  await admin.getByRole('combobox', { name: 'Cliente' }).click()
  await admin.getByRole('combobox', { name: 'Cliente' }).fill('Pizzeria')
  await admin.getByRole('option', { name: /Pizzeria Da Gino/ }).click()
  await expect(admin.getByLabel('Collaboratore')).toHaveValue(/.+/)
  await admin.getByLabel('Collaboratore').selectOption({ label: 'Giulia Verdi' })
  const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  await admin.locator('#scadenza_data').fill(domani)
  await admin.locator('#scadenza_ora').fill('17:30')
  await admin.locator('#documenti').setInputFiles({ name: 'bozza-contratto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% bozza di prova\n') })
  await admin.getByRole('button', { name: 'Crea compito' }).click()
  await expect(admin.getByRole('heading', { name: titolo })).toBeVisible()
  await expect(admin.getByText('bozza-contratto.pdf').first()).toBeVisible()
  const urlCompito = admin.url()

  // 2. Giulia riceve la notifica, lavora, carica un file, commenta e segna pronto
  await accedi(giulia, GIULIA)
  await expect(giulia.getByRole('button', { name: /Notifiche: \d+ non lett/ })).toBeVisible()
  await giulia.goto(urlCompito)
  await giulia.getByRole('button', { name: 'Inizia a lavorare' }).click()
  await expect(giulia.getByText('In lavorazione').first()).toBeVisible()
  await giulia.locator('#nuovi-documenti').setInputFiles({ name: 'contratto-firmato.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% firmato\n') })
  await giulia.getByRole('button', { name: 'Carica il file' }).click()
  await expect(giulia.getByText('contratto-firmato.pdf').first()).toBeVisible()
  await giulia.getByLabel('Scrivi un commento').fill('Il contratto è pronto, l\'ho già visionato: ora va controllato.')
  await giulia.getByRole('button', { name: 'Aggiungi commento' }).click()
  await giulia.getByRole('button', { name: 'Segna pronto per revisione' }).click()
  await expect(giulia.getByText('Pronto per revisione').first()).toBeVisible()

  // 3. l'admin lo rimanda indietro con una spiegazione
  await admin.reload()
  await admin.getByRole('button', { name: 'Rimanda indietro' }).click()
  await admin.getByLabel('Perché lo rimandi indietro?').fill('Manca la firma del locatore a pagina 3.')
  await admin.getByRole('dialog').getByRole('button', { name: 'Rimanda indietro' }).click()
  await expect(admin.getByText('In lavorazione').first()).toBeVisible()

  // 4. Giulia vede la spiegazione in cima alla scheda e rimette pronto
  await giulia.reload()
  await expect(giulia.getByText('Manca la firma del locatore a pagina 3.').first()).toBeVisible()
  await giulia.getByRole('button', { name: 'Segna pronto per revisione' }).click()
  await expect(giulia.getByText('Pronto per revisione').first()).toBeVisible()

  // 5. l'admin chiude; i documenti restano consultabili e senza pulsante di eliminazione
  await admin.reload()
  await admin.getByRole('button', { name: 'Chiudi il compito' }).click()
  const conferma = admin.getByRole('dialog').getByRole('button', { name: 'Chiudi il compito' })
  if (await conferma.isVisible().catch(() => false)) await conferma.click()
  await expect(admin.getByText('Completato').first()).toBeVisible()
  await giulia.reload()
  await expect(giulia.getByText('contratto-firmato.pdf').first()).toBeVisible()
  await expect(giulia.getByText('bozza-contratto.pdf').first()).toBeVisible()
  await expect(giulia.getByRole('button', { name: /Elimina/i })).toHaveCount(0)
  const scarica = giulia.getByRole('link', { name: /Scarica.*bozza-contratto\.pdf|Scarica/ }).first()
  const [download] = await Promise.all([giulia.waitForEvent('download'), scarica.click()])
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
})
