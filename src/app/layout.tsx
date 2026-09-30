import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: { default: 'BigBrotherStudio', template: '%s · BigBrotherStudio' },
  description: 'Gestionale per studi di consulenza: clienti, aggiornamenti contabili, compiti e comunicazioni.',
  applicationName: 'BigBrotherStudio',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#1e2440', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  )
}
