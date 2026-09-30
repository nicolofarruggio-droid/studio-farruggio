import { Download, Info } from 'lucide-react'
import { conUtente } from '@/lib/db'
import { richiediAdmin } from '@/lib/auth/sessione'
import { datiStudio } from '@/lib/dati/studio'
import { formattaDataOra } from '@/lib/date'
import { Intestazione } from '@/components/intestazione'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import {
  InterruttoreLetturaEmail, ModuloAnagrafica, ModuloCreazioneCompiti, ModuloSoglie, ModuloVisibilita,
} from './moduli'

export const metadata = { title: 'Impostazioni dello studio' }

export default async function PaginaImpostazioni() {
  const { persona } = await richiediAdmin()
  const s = await conUtente(persona, datiStudio)
  return (
    <>
      <Intestazione
        titolo="Impostazioni dello studio"
        descrizione={`Solo gli admin le vedono e le cambiano. Ogni cambio finisce nel registro attività. Ultima modifica: ${formattaDataOra(s.aggiornato_il)}.`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Anagrafica dello studio</CardTitle>
              <CardDescription>Nome e dati dello studio.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ModuloAnagrafica
              dati={{
                nome: s.nome, ragione_sociale: s.ragione_sociale, partita_iva: s.partita_iva, codice_fiscale: s.codice_fiscale,
                indirizzo: s.indirizzo, telefono: s.telefono, email: s.email, pec: s.pec,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Visibilità tra collaboratori</CardTitle>
              <CardDescription>Cosa vede e su cosa lavora ogni collaboratore. Gli admin vedono sempre tutto.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ModuloVisibilita attuale={s.visibilita} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Chi può creare compiti</CardTitle>
              <CardDescription>La regola vale anche per le API e per gli agenti: è nel database.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ModuloCreazioneCompiti attuale={s.creazione_compiti} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Soglie di ritardo</CardTitle>
              <CardDescription>Dopo quanti mesi un cliente risulta &quot;in ritardo&quot; con IVA e prima nota.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><ModuloSoglie iva={s.soglia_ritardo_iva_mesi} primaNota={s.soglia_ritardo_prima_nota_mesi} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Lettura automatica delle email</CardTitle>
              <CardDescription>Controllo in sola lettura delle caselle collegate e riassunto delle email dei clienti. Spenta di default.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><InterruttoreLetturaEmail attiva={s.lettura_email_attiva} /></CardContent>
        </Card>

        <Card className="lg:col-span-2" aria-labelledby="titolo-dati">
          <CardHeader>
            <div>
              <CardTitle id="titolo-dati">Dati dello studio</CardTitle>
              <CardDescription>Esportazione completa e richiesta di cancellazione (privacy, sezione 11).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <p className="text-sm">
                Scarica un file Excel con un foglio per ogni archivio: clienti, titolari, email dei clienti, indicatori e storico,
                compiti, commenti, elenco dei documenti, comunicazioni e utenti. Non contiene password, token né i file dei
                documenti. L&apos;esportazione viene registrata nel registro attività.
              </p>
              <form action="/studio/impostazioni/esporta" method="post">
                <Button type="submit" variant="outline"><Download aria-hidden /> Esporta tutti i dati (Excel)</Button>
              </form>
            </div>
            <Alert variant="info">
              <Info aria-hidden />
              <p>
                {/* DECISIONE APERTA: indirizzo e procedura per la cancellazione dei dati di uno studio (sezione 11). */}
                Per chiedere la cancellazione dei dati dello studio contatta{' '}
                <strong>[indirizzo di assistenza della piattaforma — da definire]</strong>. Prima di chiederla, scarica
                l&apos;esportazione completa.
              </p>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
