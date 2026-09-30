import { Ban, Check } from 'lucide-react'

// Cosa può e cosa non potrà mai fare l'AI con la casella (sezione 16.2): testi fissi della specifica.
export const PUO_SOLO = [
  'vedere chi ha scritto, per riconoscere il cliente;',
  'leggere le email che arrivano dai clienti dello studio;',
  'scriverne un riassunto nella scheda del cliente.',
]

export const NON_POTRA_MAI = [
  'inviare email, rispondere o inoltrare;',
  'creare bozze;',
  'modificare, archiviare, spostare o etichettare email;',
  'segnare le email come lette;',
  'eliminare email.',
]

export function ElenchiPermessi({ compatto = false }: { compatto?: boolean }) {
  return (
    <div className={compatto ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4 md:grid-cols-2'}>
      <section aria-labelledby="puo-solo" className="rounded-lg border border-successo/30 bg-successo-sfondo/60 p-4">
        <h3 id="puo-solo" className="mb-2 flex items-center gap-2 font-semibold">
          <Check className="size-5 text-successo" aria-hidden /> L&apos;AI può solo:
        </h3>
        <ul className="grid gap-1.5 text-sm">
          {PUO_SOLO.map((t) => (
            <li key={t} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-successo" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="non-potra-mai" className="rounded-lg border border-pericolo/30 bg-pericolo-sfondo/60 p-4">
        <h3 id="non-potra-mai" className="mb-2 flex items-center gap-2 font-semibold">
          <Ban className="size-5 text-pericolo" aria-hidden /> L&apos;AI non potrà mai:
        </h3>
        <ul className="grid gap-1.5 text-sm">
          {NON_POTRA_MAI.map((t) => (
            <li key={t} className="flex gap-2">
              <Ban className="mt-0.5 size-4 shrink-0 text-pericolo" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
