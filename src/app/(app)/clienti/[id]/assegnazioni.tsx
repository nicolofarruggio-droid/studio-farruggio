'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Star, UserMinus, UserPlus } from 'lucide-react'
import { cambiaReferente, impostaCollaboratoreAggiuntivo } from '../azioni'
import { Select, Label } from '@/components/ui/campi'
import { Button } from '@/components/ui/button'
import type { SchedaCliente } from '@/lib/dati/scheda-cliente'
import type { Collega } from '@/lib/dati/clienti'

/** Collaboratori assegnati: referente principale e collaboratori aggiuntivi (modello molti-a-molti, sezione 6). */
export function Assegnazioni({ cliente, assegnati, colleghi, admin }: { cliente: string; assegnati: SchedaCliente['assegnati']; colleghi: Collega[]; admin: boolean }) {
  const referente = assegnati.find((a) => a.referente)
  const altri = assegnati.filter((a) => !a.referente)
  const [scelto, setScelto] = useState(referente?.utente_id ?? '')
  const [aggiunto, setAggiunto] = useState('')
  const [inCorso, avvia] = useTransition()
  const esegui = (p: Promise<{ ok: boolean; messaggio?: string; errore?: string }>) =>
    avvia(async () => {
      const r = await p
      if (r.ok) toast.success(r.messaggio)
      else toast.error(r.errore)
    })

  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-1">
        <p className="text-muted-foreground">Referente principale</p>
        <p className="flex items-center gap-1.5 font-medium">
          {referente ? <><Star className="size-4 text-avviso" aria-hidden /> {referente.nome}</> : 'Nessun collaboratore assegnato'}
        </p>
      </div>
      {altri.length > 0 && (
        <div className="grid gap-1">
          <p className="text-muted-foreground">Altri collaboratori</p>
          <ul className="grid gap-1">
            {altri.map((a) => (
              <li key={a.utente_id} className="flex items-center justify-between gap-2">
                {a.nome}
                {admin && (
                  <Button variant="ghost" size="sm" disabled={inCorso} onClick={() => esegui(impostaCollaboratoreAggiuntivo(cliente, a.utente_id, false))} aria-label={`Togli ${a.nome}`}>
                    <UserMinus /> Togli
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {admin && (
        <div className="grid gap-3 border-t pt-3">
          <div className="grid gap-1.5">
            <Label htmlFor="referente">Cambia referente</Label>
            <div className="flex gap-2">
              <Select id="referente" value={scelto} onChange={(e) => setScelto(e.target.value)}>
                <option value="">Nessuno</option>
                {colleghi.map((c) => <option key={c.id} value={c.id}>{c.nome} {c.cognome}</option>)}
              </Select>
              <Button variant="secondary" disabled={inCorso || scelto === (referente?.utente_id ?? '')} onClick={() => esegui(cambiaReferente(cliente, scelto || null))}>
                Salva
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aggiuntivo">Aggiungi un collaboratore</Label>
            <div className="flex gap-2">
              <Select id="aggiuntivo" value={aggiunto} onChange={(e) => setAggiunto(e.target.value)}>
                <option value="">Scegli…</option>
                {colleghi.filter((c) => !assegnati.some((a) => a.utente_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.nome} {c.cognome}</option>)}
              </Select>
              <Button variant="secondary" disabled={inCorso || !aggiunto} onClick={() => { esegui(impostaCollaboratoreAggiuntivo(cliente, aggiunto, true)); setAggiunto('') }}>
                <UserPlus /> Aggiungi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
