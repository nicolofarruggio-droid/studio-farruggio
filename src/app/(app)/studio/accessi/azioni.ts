'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { messaggioErrore, type EsitoAzione } from '@/lib/errori'

const schema = z.object({
  utente: z.uuid({ message: 'Scegli chi riceve l\'accesso' }),
  proprietario: z.uuid({ message: 'Scegli di quale collega è lo spazio' }),
  livello: z.enum(['lettura', 'completa'], { message: 'Scegli cosa può fare' }),
})

/** "A può accedere allo spazio di B" (sezione 3). Se l'accesso esiste già, ne cambia il livello. */
export async function concediAccesso(_: unknown, fd: FormData): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  const d = schema.safeParse(Object.fromEntries(fd))
  if (!d.success) {
    const campi: Record<string, string> = {}
    for (const i of d.error.issues) campi[String(i.path[0])] ??= i.message
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }
  if (d.data.utente === d.data.proprietario) {
    return { ok: false, errore: 'Scegli due persone diverse.', campi: { proprietario: 'Deve essere un\'altra persona' } }
  }
  try {
    const nomi = await conUtente(persona, async (tx) => {
      await tx`select public.concedi_accesso_collega(${d.data.utente}, ${d.data.proprietario}, ${d.data.livello})`
      return tx<{ id: string; nome: string }[]>`
        select id, trim(nome || ' ' || cognome) as nome from public.utenti where id in (${d.data.utente}, ${d.data.proprietario})`
    })
    const nome = (id: string) => nomi.find((n) => n.id === id)?.nome ?? ''
    revalidatePath('/studio/accessi')
    return {
      ok: true,
      messaggio: `Fatto: ${nome(d.data.utente)} ${d.data.livello === 'completa' ? 'può vedere e lavorare' : 'può vedere (senza modificare)'} nello spazio di ${nome(d.data.proprietario)}.`,
    }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}

export async function togliAccesso(id: string): Promise<EsitoAzione> {
  const { persona } = await richiediAdmin()
  if (!z.uuid().safeParse(id).success) return { ok: false, errore: 'Accesso non trovato.' }
  try {
    await conUtente(persona, (tx) => tx`select public.revoca_accesso_collega(${id})`)
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
  revalidatePath('/studio/accessi')
  return { ok: true, messaggio: 'Accesso tolto: vale da subito.' }
}
