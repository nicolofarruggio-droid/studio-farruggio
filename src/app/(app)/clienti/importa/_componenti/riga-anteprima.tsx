'use client'
import { memo } from 'react'
import { Ban, CheckCircle2, CircleAlert, PenLine, TriangleAlert, XCircle } from 'lucide-react'
import { estraiEmail, titolariDaTesto, titolariInTesto, unisciEmail } from '@/lib/importazione/normalizza'
import type { EsameRiga, Persona, RigaImport } from '@/lib/importazione/righe'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Select } from '@/components/ui/campi'
import { CampoData, CampoNumero, CampoTesto } from './campi-riga'

export type RigaAnteprima = RigaImport & { esclusa: boolean; esclusioneManuale: boolean }
export type Modifica = (riga: number, modifica: Partial<RigaAnteprima>) => void

export function statoRiga(r: RigaAnteprima, e: EsameRiga): 'esclusa' | 'errore' | 'avviso' | 'pronta' {
  if (r.esclusa) return 'esclusa'
  if (e.errori) return 'errore'
  if (e.avvisi || e.daCompletare.length) return 'avviso'
  return 'pronta'
}

function Stato({ r, e }: { r: RigaAnteprima; e: EsameRiga }) {
  switch (statoRiga(r, e)) {
    case 'esclusa':
      return <Badge variant="neutro"><Ban aria-hidden /> Esclusa</Badge>
    case 'errore':
      return <Badge variant="pericolo"><XCircle aria-hidden /> Non importabile</Badge>
    case 'avviso':
      return <Badge variant="avviso"><TriangleAlert aria-hidden /> Da controllare</Badge>
    default:
      return <Badge variant="successo"><CheckCircle2 aria-hidden /> Pronta</Badge>
  }
}

function emailInTesto(r: RigaImport): string {
  return [...r.email.map((e) => e.indirizzo), ...r.email_non_valide].join('; ')
}

/** Riga dell'anteprima: campi modificabili e segnalazioni. Leggera (memo) per restare veloce con 400 righe. */
export const RigaAnteprimaVista = memo(
  function RigaAnteprimaVista({ r, esame, persone, onModifica }: { r: RigaAnteprima; esame: EsameRiga; persone: Persona[]; onModifica: Modifica }) {
    const n = r.riga
    const collaboratoreNelFile = r.collaboratore_testo && !r.collaboratore_id ? r.collaboratore_testo : null
    const pec = r.email.filter((e) => e.tipo === 'pec')
    return (
      <tr className="border-b align-top data-[esclusa=true]:bg-muted/40 data-[esclusa=true]:text-muted-foreground" data-esclusa={r.esclusa}>
        <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-normal text-muted-foreground">
          {n}
        </th>
        <td className="px-2 py-2">
          <Checkbox
            aria-label={`Escludi la riga ${n}`}
            checked={r.esclusa}
            onChange={(ev) => onModifica(n, { esclusa: ev.target.checked, esclusioneManuale: true })}
          />
        </td>
        <td className="px-2 py-2">
          <div className="grid w-64 gap-1">
            <div>
              <Stato r={r} e={esame} />
            </div>
            {(esame.segnalazioni.length > 0 || esame.daCompletare.length > 0) && (
              <ul className="grid gap-0.5 text-xs">
                {esame.segnalazioni.map((s, i) => (
                  <li key={i} className={s.livello === 'errore' ? 'flex gap-1 text-pericolo' : 'flex gap-1 text-avviso'}>
                    {s.livello === 'errore' ? <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />}
                    <span>
                      <span className="sr-only">{s.livello === 'errore' ? 'Errore: ' : 'Avviso: '}</span>
                      {s.testo}
                    </span>
                  </li>
                ))}
                {esame.daCompletare.length > 0 && (
                  <li className="flex gap-1 text-muted-foreground">
                    <PenLine className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span>Da completare: {esame.daCompletare.join(', ')}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </td>
        <td className="px-2 py-2">
          <CampoTesto
            key={r.nome_azienda}
            aria-label={`Ragione sociale, riga ${n}`}
            aria-invalid={!r.nome_azienda.trim() || undefined}
            valore={r.nome_azienda}
            onConferma={(v) => onModifica(n, { nome_azienda: v })}
            className="w-56"
          />
        </td>
        <td className="px-2 py-2">
          <CampoTesto
            key={titolariInTesto(r.titolari)}
            aria-label={`Titolari, riga ${n} (più persone separate da punto e virgola)`}
            valore={titolariInTesto(r.titolari)}
            onConferma={(v) => onModifica(n, { titolari: titolariDaTesto(v) })}
            className="w-52"
            placeholder="Nome Cognome; …"
          />
        </td>
        <td className="px-2 py-2">
          <CampoTesto
            key={emailInTesto(r)}
            aria-label={`Email, riga ${n} (più indirizzi separati da punto e virgola)`}
            aria-invalid={r.email_non_valide.length > 0 || undefined}
            valore={emailInTesto(r)}
            onConferma={(v) => {
              const e = estraiEmail(v)
              // un indirizzo già segnato come PEC resta PEC
              const pecPrima = new Set(r.email.filter((x) => x.tipo === 'pec').map((x) => x.indirizzo))
              onModifica(n, {
                email: unisciEmail(e.valide.map((x) => (pecPrima.has(x.indirizzo) ? { ...x, tipo: 'pec' as const } : x))),
                email_non_valide: e.nonValide,
              })
            }}
            className="w-60"
            placeholder="nome@esempio.it; …"
          />
          {pec.length > 0 && <p className="mt-1 text-xs text-muted-foreground">PEC: {pec.map((e) => e.indirizzo).join(', ')}</p>}
        </td>
        <td className="px-2 py-2">
          <CampoData aria-label={`Ultimo aggiornamento prima nota, riga ${n}`} valore={r.prima_nota} onConferma={(v) => onModifica(n, { prima_nota: v })} />
        </td>
        <td className="px-2 py-2">
          <CampoData aria-label={`Ultimo aggiornamento IVA, riga ${n}`} valore={r.iva} onConferma={(v) => onModifica(n, { iva: v })} />
        </td>
        <td className="px-2 py-2">
          <CampoNumero
            key={String(r.numero_dipendenti)}
            intero
            aria-label={`Numero di dipendenti, riga ${n}`}
            valore={r.numero_dipendenti}
            onConferma={(v) => onModifica(n, { numero_dipendenti: v })}
            className="w-20"
          />
        </td>
        <td className="px-2 py-2">
          <CampoNumero
            key={String(r.fatturato)}
            aria-label={`Fatturato in euro, riga ${n}`}
            valore={r.fatturato}
            onConferma={(v) => onModifica(n, { fatturato: v })}
            className="w-32"
          />
        </td>
        <td className="px-2 py-2">
          <Select
            aria-label={`Collaboratore, riga ${n}`}
            value={r.collaboratore_id ?? ''}
            onChange={(ev) => onModifica(n, { collaboratore_id: ev.target.value || null })}
            className="h-8 w-44 px-2 text-sm"
          >
            <option value="">— nessuno —</option>
            {persone.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} {p.cognome}
              </option>
            ))}
          </Select>
          {collaboratoreNelFile && <p className="mt-1 text-xs text-muted-foreground">Nel file: {collaboratoreNelFile}</p>}
        </td>
        <td className="px-2 py-2">
          <CampoTesto key={r.partita_iva ?? ''} aria-label={`Partita IVA, riga ${n}`} valore={r.partita_iva ?? ''} onConferma={(v) => onModifica(n, { partita_iva: v.trim() || null })} className="w-32" />
        </td>
        <td className="px-2 py-2">
          <CampoTesto
            key={r.codice_fiscale ?? ''}
            aria-label={`Codice fiscale, riga ${n}`}
            valore={r.codice_fiscale ?? ''}
            onConferma={(v) => onModifica(n, { codice_fiscale: v.trim().toUpperCase() || null })}
            className="w-44"
          />
        </td>
        <td className="px-2 py-2">
          <CampoTesto key={r.telefono ?? ''} aria-label={`Telefono, riga ${n}`} valore={r.telefono ?? ''} onConferma={(v) => onModifica(n, { telefono: v.trim() || null })} className="w-32" />
        </td>
      </tr>
    )
  },
  (a, b) =>
    a.r === b.r &&
    a.persone === b.persone &&
    a.onModifica === b.onModifica &&
    a.esame.errori === b.esame.errori &&
    a.esame.avvisi === b.esame.avvisi &&
    a.esame.daCompletare.join() === b.esame.daCompletare.join() &&
    a.esame.segnalazioni.map((s) => s.testo).join('\n') === b.esame.segnalazioni.map((s) => s.testo).join('\n'),
)
