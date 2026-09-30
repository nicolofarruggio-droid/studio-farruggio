import { rotta } from '@/lib/api/rotta'
import { ErroreApi } from '@/lib/api/errori'
import { eseguiScrittura } from '@/lib/api/scritture'
import { corpoIndicatore, idDaPercorso, TIPI_INDICATORE, validaCorpo, type TipoIndicatore } from '@/lib/api/schemi'

/** Imposta l'indicatore IVA o prima nota di un cliente (data di fine periodo, oppure "non applicabile"). */
export const PUT = rotta(async ({ richiesta, chiamante, parametri }) => {
  const cliente = idDaPercorso(parametri.id)
  const tipo = String(parametri.tipo)
  if (!TIPI_INDICATORE.includes(tipo as TipoIndicatore)) {
    throw new ErroreApi(404, 'non_trovato', `Indicatore "${tipo}" inesistente: usa "iva" oppure "prima_nota".`)
  }
  const corpo = await validaCorpo(corpoIndicatore, richiesta)
  return eseguiScrittura(chiamante, 'aggiorna_indicatore', { ...corpo, cliente_id: cliente, tipo })
})
