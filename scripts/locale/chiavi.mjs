// Genera le chiavi anon e service_role (JWT HS256) per lo stack locale, firmate con JWT_SECRET.
import { createHmac } from 'node:crypto'

const segreto = process.env.JWT_SECRET ?? 'segreto-jwt-locale-di-sviluppo-lungo-almeno-32-caratteri'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const firma = (payload) => {
  const testa = b64({ alg: 'HS256', typ: 'JWT' })
  const corpo = b64(payload)
  const s = createHmac('sha256', segreto).update(`${testa}.${corpo}`).digest('base64url')
  return `${testa}.${corpo}.${s}`
}
const exp = 2000000000
console.log(`ANON_KEY=${firma({ iss: 'supabase-locale', role: 'anon', exp })}`)
console.log(`SERVICE_ROLE_KEY=${firma({ iss: 'supabase-locale', role: 'service_role', exp })}`)
