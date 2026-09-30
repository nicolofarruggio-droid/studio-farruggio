'use client'
import { useState } from 'react'
import { Menu as IconaMenu } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { Navigazione, type GruppoMenu } from './navigazione'

export function MenuMobile({ gruppi, studio }: { gruppi: GruppoMenu[]; studio: string }) {
  const [aperto, setAperto] = useState(false)
  return (
    <D.Root open={aperto} onOpenChange={setAperto}>
      <D.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Apri il menu">
          <IconaMenu className="size-5" />
        </Button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
        <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 overflow-y-auto bg-sidebar p-4 lg:hidden">
          <D.Title className="sr-only">Menu</D.Title>
          <div className="px-2 text-white">
            <Logo chiaro />
            <p className="mt-1 truncate text-xs text-sidebar-muted">{studio}</p>
          </div>
          <Navigazione gruppi={gruppi} onNaviga={() => setAperto(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
