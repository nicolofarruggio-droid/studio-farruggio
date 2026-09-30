'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediUtente } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'
import { isoValida } from '@/lib/date'

const schema = z.object({
  cliente: z.string().uuid(),
  tipo: z.enum(['iva', 'prima_nota']),
  data: z.string().nullable(),
  nonApplicabile: z.boolean(),
})

/** Aggiorna IVA o prima nota di un cliente: l'azione più frequente, pochi clic (sezione 9). */
export async function aggiornaIndicatore(input: z.infer<typeof schema>): Promise<EsitoAzione> {
  const d = schema.safeParse(input)
  if (!d.success || (!d.data.nonApplicabile && d.data.data !== null && !isoValida(d.data.data)))
    return { ok: false, errore: 'Data non valida.' }
  const { persona } = await richiediUtente()
  try {
    await conUtente(persona, (tx) =>
      tx`select public.imposta_indicatore(${d.data.cliente}, ${d.data.tipo}, ${d.data.nonApplicabile ? null : d.data.data}::date, ${d.data.nonApplicabile})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Aggiornamento salvato.' }
}
