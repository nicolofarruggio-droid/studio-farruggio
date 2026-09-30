import 'server-only'
import { eliminaOggetti } from '@/lib/documenti'

/** Cancella dallo spazio file i documenti dei compiti di un cliente eliminato definitivamente. */
export async function eliminaFileDocumenti(percorsi: string[]): Promise<void> {
  if (percorsi.length === 0) return
  try {
    await eliminaOggetti(percorsi)
  } catch (e) {
    // il cliente è già cancellato dal database: i file rimasti non sono più raggiungibili da nessuno
    console.error('Documenti non cancellati dallo spazio file', percorsi.length, e)
  }
}
