import Link from 'next/link'
import { Logo } from '@/components/logo'

export default function LayoutPubblico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-accent/60 to-background">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" className="inline-block rounded-md">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:pt-10">{children}</main>
      <footer className="flex flex-wrap justify-center gap-4 px-4 py-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:underline">Informativa privacy</Link>
        <Link href="/termini" className="hover:underline">Termini di servizio</Link>
      </footer>
    </div>
  )
}
