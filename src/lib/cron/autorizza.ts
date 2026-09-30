import 'server-only'
import { timingSafeEqual } from 'node:crypto'

/** I processi pianificati (Vercel Cron) mandano "Authorization: Bearer <CRON_SECRET>". */
export function cronAutorizzato(request: Request): boolean {
  const segreto = process.env.CRON_SECRET
  if (!segreto) return false
  const atteso = Buffer.from(`Bearer ${segreto}`)
  const dato = Buffer.from(request.headers.get('authorization') ?? '')
  return atteso.length === dato.length && timingSafeEqual(atteso, dato)
}
