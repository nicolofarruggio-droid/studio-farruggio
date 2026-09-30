import type { MetadataRoute } from 'next'

// Predisposizione per l'installazione come app (PWA): non ancora richiesta (sezione 2).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BigBrotherStudio',
    short_name: 'BigBrother',
    description: 'Gestionale per studi di consulenza',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f7f8fb',
    theme_color: '#1e2440',
    lang: 'it',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
