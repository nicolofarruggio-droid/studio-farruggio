import { specificaOpenApi } from '@/lib/api/openapi'

/** Specifica OpenAPI 3.1 dell'API (pubblica: non contiene dati dello studio). */
export function GET() {
  return Response.json(specificaOpenApi, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
