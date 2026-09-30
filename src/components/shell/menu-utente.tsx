'use client'
import Link from 'next/link'
import { LogOut, UserCog } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { iniziali } from '@/lib/utils'

export function MenuUtente({ nome, cognome, email, ruolo }: { nome: string; cognome: string; email: string; ruolo: string }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={`Menu dell'utente ${nome} ${cognome}`}>
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {iniziali(nome, cognome)}
          </span>
          <span className="hidden text-left sm:grid">
            <span className="text-sm leading-tight font-medium">{nome} {cognome}</span>
            <span className="text-xs leading-tight text-muted-foreground">{ruolo === 'admin' ? 'Admin' : 'Collaboratore'}</span>
          </span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{email}</MenuLabel>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/profilo"><UserCog /> Il mio profilo</Link>
        </MenuItem>
        <MenuSeparator />
        <form action="/auth/esci" method="post">
          <MenuItem asChild>
            <button type="submit" className="w-full"><LogOut /> Esci</button>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  )
}
