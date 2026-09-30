import { richiediUtente } from '@/lib/auth/sessione'
import { conUtente } from '@/lib/db'
import { ultimeNotifiche } from '@/lib/notifiche'
import { Logo } from '@/components/logo'
import { Navigazione, type GruppoMenu } from '@/components/shell/navigazione'
import { MenuMobile } from '@/components/shell/menu-mobile'
import { MenuUtente } from '@/components/shell/menu-utente'
import { Campanella } from '@/components/shell/campanella'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { persona, utente, studio } = await richiediUtente()
  const notifiche = await conUtente(persona, ultimeNotifiche)
  const admin = utente.ruolo === 'admin'
  const tuttoLoStudio = admin || studio.visibilita !== 'solo_propri'

  const gruppi: GruppoMenu[] = [
    {
      voci: [
        { href: '/dashboard', etichetta: admin ? 'Dashboard' : 'La mia dashboard', icona: 'dashboard' },
        { href: '/clienti', etichetta: tuttoLoStudio ? 'Clienti' : 'I miei clienti', icona: 'clienti' },
        { href: '/compiti', etichetta: tuttoLoStudio ? 'Compiti' : 'I miei compiti', icona: 'compiti' },
        { href: '/email', etichetta: 'La mia email', icona: 'email' },
      ],
    },
  ]
  if (admin) {
    gruppi.push({
      titolo: 'Studio',
      voci: [
        { href: '/studio/utenti', etichetta: 'Utenti e inviti', icona: 'utenti' },
        { href: '/studio/accessi', etichetta: 'Accessi tra colleghi', icona: 'accessi' },
        { href: '/clienti/importa', etichetta: 'Importazione', icona: 'importa' },
        { href: '/studio/impostazioni', etichetta: 'Impostazioni', icona: 'impostazioni' },
        { href: '/studio/agenti', etichetta: 'Agenti AI e API', icona: 'agenti' },
        { href: '/studio/registro', etichetta: 'Registro attività', icona: 'registro' },
        { href: '/studio/consumi', etichetta: 'Consumi AI', icona: 'consumi' },
        { href: '/studio/cestino', etichetta: 'Cestino', icona: 'cestino' },
      ],
    })
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#contenuto" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Vai al contenuto
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-sidebar p-4 lg:flex">
        <div className="px-2 text-white">
          <Logo chiaro />
          <p className="mt-1 truncate text-xs text-sidebar-muted" title={studio.nome}>{studio.nome}</p>
        </div>
        <Navigazione gruppi={gruppi} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-6">
          <MenuMobile gruppi={gruppi} studio={studio.nome} />
          <p className="truncate text-sm font-medium text-muted-foreground lg:hidden">{studio.nome}</p>
          <div className="ml-auto flex items-center gap-1">
            <Campanella iniziali={notifiche} />
            <MenuUtente nome={utente.nome} cognome={utente.cognome} email={utente.email} ruolo={utente.ruolo} />
          </div>
        </header>
        <main id="contenuto" className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
