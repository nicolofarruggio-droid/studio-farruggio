'use client'
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import {
  avviaDuePassaggi, cambiaPassword, confermaDuePassaggi, rimuoviDuePassaggi, salvaDatiPersonali, salvaPreferenze,
  type NuovoFattore,
} from './azioni'
import type { EsitoAzione } from '@/lib/errori'
import { CHIAVI_PREFERENZE, TESTI_PREFERENZE, type Preferenze } from '@/lib/studio/preferenze'
import { Campo, Checkbox, Input } from '@/components/ui/campi'
import { PulsanteInvio } from '@/components/ui/pulsante-invio'
import { MessaggioEsito } from '@/components/ui/messaggio'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DialogoConferma } from '@/components/studio/dialogo-conferma'

export function ModuloDati({ nome, cognome, email }: { nome: string; cognome: string; email: string }) {
  const [valori, setValori] = useState({ nome, cognome })
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(salvaDatiPersonali, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Campo id="p-nome" etichetta="Nome" errore={campi?.nome}>
          <Input name="nome" autoComplete="given-name" required value={valori.nome} onChange={(e) => setValori((v) => ({ ...v, nome: e.target.value }))} />
        </Campo>
        <Campo id="p-cognome" etichetta="Cognome" errore={campi?.cognome}>
          <Input name="cognome" autoComplete="family-name" value={valori.cognome} onChange={(e) => setValori((v) => ({ ...v, cognome: e.target.value }))} />
        </Campo>
      </div>
      <Campo id="p-email" etichetta="Email con cui entri" aiuto="Per cambiarla chiedi a un admin dello studio.">
        <Input value={email} readOnly disabled />
      </Campo>
      <div>
        <PulsanteInvio testoAttesa="Salvataggio…">Salva</PulsanteInvio>
      </div>
    </form>
  )
}

export function ModuloPassword() {
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(cambiaPassword, null)
  const campi = esito && !esito.ok ? esito.campi : undefined
  return (
    <form action={azione} className="grid gap-4" noValidate>
      <MessaggioEsito esito={esito} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Campo id="p-password" etichetta="Nuova password" aiuto="Almeno 10 caratteri." errore={campi?.password}>
          <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Campo>
        <Campo id="p-conferma" etichetta="Ripeti la nuova password" errore={campi?.conferma}>
          <Input name="conferma" type="password" autoComplete="new-password" required />
        </Campo>
      </div>
      <div>
        <PulsanteInvio testoAttesa="Salvataggio…"><KeyRound aria-hidden /> Cambia password</PulsanteInvio>
      </div>
    </form>
  )
}

export function ModuloPreferenze({ preferenze, emailAttive }: { preferenze: Preferenze; emailAttive: boolean }) {
  const [valori, setValori] = useState(preferenze)
  const [esito, azione] = useActionState<EsitoAzione | null, FormData>(salvaPreferenze, null)
  return (
    <form action={azione} className="grid gap-4">
      <MessaggioEsito esito={esito} />
      {!emailAttive && (
        <p className="text-sm text-muted-foreground">
          Il servizio email della piattaforma non è ancora attivo: le tue scelte valgono da quando lo sarà.
        </p>
      )}
      <fieldset className="grid gap-2">
        <legend className="sr-only">Email da ricevere</legend>
        {CHIAVI_PREFERENZE.map((k) => (
          <label key={k} className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              name={k}
              checked={valori[k]}
              onChange={(e) => setValori((v) => ({ ...v, [k]: e.target.checked }))}
              className="mt-0.5"
              aria-describedby={`pref-${k}`}
            />
            <span className="grid gap-0.5 text-sm">
              <span className="font-medium">{TESTI_PREFERENZE[k].titolo}</span>
              <span id={`pref-${k}`} className="text-muted-foreground">{TESTI_PREFERENZE[k].descrizione}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Le email contengono solo il riferimento al compito e il link per aprirlo: mai documenti o testi dei commenti. Le
        notifiche nella campanella arrivano comunque.
      </p>
      <div>
        <PulsanteInvio testoAttesa="Salvataggio…">Salva le preferenze</PulsanteInvio>
      </div>
    </form>
  )
}

type Fattore = { id: string; nome: string; creato_il: string }

export function DuePassaggi({ fattori }: { fattori: Fattore[] }) {
  const router = useRouter()
  const [nuovo, setNuovo] = useState<NuovoFattore | null>(null)
  const [codice, setCodice] = useState('')
  const [esito, setEsito] = useState<EsitoAzione<unknown> | null>(null)
  const [inCorso, avvia] = useTransition()

  function inizia() {
    setEsito(null)
    avvia(async () => {
      const r = await avviaDuePassaggi()
      if (r.ok && r.dati) setNuovo(r.dati)
      else setEsito(r)
    })
  }

  function conferma(e: React.FormEvent) {
    e.preventDefault()
    if (!nuovo) return
    avvia(async () => {
      const r = await confermaDuePassaggi(nuovo.id, codice)
      if (r.ok) {
        setNuovo(null)
        setCodice('')
        toast.success(r.messaggio ?? 'Fatto.')
        router.refresh()
      } else setEsito(r)
    })
  }

  if (fattori.length > 0) {
    return (
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-sm">
          <Badge variant="successo"><ShieldCheck aria-hidden /> Attiva</Badge>
          Dopo la password ti chiediamo il codice di 6 cifre dell&apos;app di autenticazione.
        </p>
        <ul className="grid gap-2">
          {fattori.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <span className="flex items-center gap-2 text-sm">
                <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                <span>
                  <span className="block font-medium">{f.nome}</span>
                  <span className="block text-xs text-muted-foreground">Attiva dal {f.creato_il}</span>
                </span>
              </span>
              <DialogoConferma
                etichetta="Disattiva"
                etichettaAccessibile={`Disattiva la verifica in due passaggi (${f.nome})`}
                icona={<ShieldOff aria-hidden />}
                titolo="Disattivare la verifica in due passaggi?"
                descrizione={<p>Da ora entrerai solo con la password: il tuo account sarà meno protetto. Puoi riattivarla quando vuoi.</p>}
                testoConferma="Disattiva"
                varianteConferma="destructive"
                azione={async () => {
                  const r = await rimuoviDuePassaggi(f.id)
                  if (r.ok) router.refresh()
                  return r
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!nuovo) {
    return (
      <div className="grid gap-3">
        <p className="text-sm">
          Oltre alla password ti chiediamo un codice di 6 cifre generato da un&apos;app sul telefono (per esempio Google
          Authenticator, Microsoft Authenticator o 1Password). Così nessuno entra solo conoscendo la tua password.
        </p>
        <MessaggioEsito esito={esito} />
        <div>
          <Button onClick={inizia} disabled={inCorso}>
            {inCorso ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
            Attiva la verifica in due passaggi
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <ol className="grid list-decimal gap-1 pl-5 text-sm">
        <li>Apri l&apos;app di autenticazione sul telefono e aggiungi un nuovo account.</li>
        <li>Inquadra il codice QR qui sotto (oppure scrivi a mano il codice segreto).</li>
        <li>Scrivi il codice di 6 cifre che compare nell&apos;app e premi &quot;Conferma&quot;.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR generato al momento, data URI */}
        <img src={nuovo.qr} alt="Codice QR da inquadrare con l'app di autenticazione" width={180} height={180} className="rounded-lg border bg-white p-2" />
        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-medium">Codice segreto (se non puoi inquadrare il QR)</p>
          <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all select-all" aria-label="Codice segreto">
            {nuovo.segreto.replace(/(.{4})/g, '$1 ').trim()}
          </code>
          <p className="text-xs text-muted-foreground">Account: BigBrotherStudio. Non condividere questo codice con nessuno.</p>
        </div>
      </div>
      <form onSubmit={conferma} className="grid max-w-sm gap-3">
        <MessaggioEsito esito={esito} />
        <Campo id="codice-2fa" etichetta="Codice di 6 cifre">
          <Input
            value={codice}
            onChange={(e) => setCodice(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            className="font-mono text-lg tracking-widest"
            required
          />
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={inCorso || codice.length !== 6}>
            {inCorso && <Loader2 className="animate-spin" aria-hidden />} Conferma
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setNuovo(null); setCodice(''); setEsito(null) }}>Annulla</Button>
        </div>
      </form>
    </div>
  )
}
