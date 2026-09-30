#!/usr/bin/env bash
# Scrive un .env.local per lo stack locale (CI e sviluppo senza Docker). Nessun segreto reale.
cd "$(dirname "$0")/../.."
CHIAVI=$(node scripts/locale/chiavi.mjs)
cat <<FINE
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(echo "$CHIAVI" | grep ANON | cut -d= -f2)
SUPABASE_SERVICE_ROLE_KEY=$(echo "$CHIAVI" | grep SERVICE | cut -d= -f2)
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bigbrother
STORAGE_DRIVER=locale
FILE_LOCALI_SEGRETO=segreto-file-locali-solo-sviluppo
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
EMAIL_MITTENTE="BigBrotherStudio <noreply@bigbrotherstudio.local>"
AI_SIMULATA=1
GMAIL_SIMULATO=1
CONSENTI_MODALITA_PROVA=1
EMAIL_TOKEN_CHIAVE=$(openssl rand -base64 32)
CRON_SECRET=segreto-cron-locale
FINE
