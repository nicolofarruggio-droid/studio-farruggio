import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Codice casuale per link (inviti, token API). */
export const codiceCasuale = (byte = 24) => randomBytes(byte).toString('base64url')

function chiave(nome: string): Buffer {
  const v = process.env[nome]
  if (!v) throw new Error(`${nome} non configurata`)
  const b = Buffer.from(v, 'base64')
  if (b.length !== 32) throw new Error(`${nome} deve essere di 32 byte in base64`)
  return b
}

/** Cifratura AES-256-GCM per i token delle caselle email (sezione 16.2). */
export function cifra(testo: string, nomeChiave = 'EMAIL_TOKEN_CHIAVE'): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chiave(nomeChiave), iv)
  const dati = Buffer.concat([c.update(testo, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dati.toString('base64')].join('.')
}

export function decifra(cifrato: string, nomeChiave = 'EMAIL_TOKEN_CHIAVE'): string {
  const [v, iv, tag, dati] = cifrato.split('.')
  if (v !== 'v1') throw new Error('Formato cifrato sconosciuto')
  const d = createDecipheriv('aes-256-gcm', chiave(nomeChiave), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dati, 'base64')), d.final()]).toString('utf8')
}

/** Firma HMAC (link temporanei dei file in locale, stato OAuth). */
export function firma(testo: string, segreto: string): string {
  return createHmac('sha256', segreto).update(testo).digest('base64url')
}

export function verificaFirma(testo: string, firmaData: string, segreto: string): boolean {
  const attesa = Buffer.from(firma(testo, segreto))
  const data = Buffer.from(firmaData)
  return attesa.length === data.length && timingSafeEqual(attesa, data)
}
