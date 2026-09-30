import 'server-only'

/**
 * Cancella dallo spazio file i documenti dei compiti di un cliente eliminato definitivamente.
 * TODO(integrazione): collegare al modulo dei documenti (src/lib/documenti).
 */
export async function eliminaFileDocumenti(percorsi: string[]): Promise<void> {
  if (percorsi.length === 0) return
}
