#!/usr/bin/env bash
# Avvia lo stack locale "tipo Supabase" senza Docker: Postgres (già installato), GoTrue (auth),
# Mailpit (email di prova, http://127.0.0.1:8025) e un gateway su http://127.0.0.1:54321.
# Con Docker disponibile è più semplice `npx supabase start` (vedi README).
#
# Variabili utili: PG_ADMIN_URL, DB_NOME, GOTRUE_BIN, MAILPIT_BIN. Opzione --reset: ricrea il database.
set -euo pipefail
cd "$(dirname "$0")/../.."

DATI=.dati-locali
mkdir -p "$DATI/log"
PG_ADMIN_URL=${PG_ADMIN_URL:-postgres://postgres:postgres@127.0.0.1:5432/postgres}
DB_NOME=${DB_NOME:-bigbrother}
DB_URL="${PG_ADMIN_URL%/*}/$DB_NOME"
GOTRUE_BIN=${GOTRUE_BIN:-$(command -v gotrue || echo /opt/locale/auth)}
MAILPIT_BIN=${MAILPIT_BIN:-$(command -v mailpit || echo /opt/locale/mailpit)}
JWT_SECRET=${JWT_SECRET:-segreto-jwt-locale-di-sviluppo-lungo-almeno-32-caratteri}
SITE_URL=${SITE_URL:-http://localhost:3000}

ferma() { [ -f "$DATI/$1.pid" ] && kill "$(cat "$DATI/$1.pid")" 2>/dev/null || true; rm -f "$DATI/$1.pid"; }
for s in gotrue mailpit gateway; do ferma $s; done

if [ "${1:-}" = "--reset" ]; then
  psql "$PG_ADMIN_URL" -qc "drop database if exists $DB_NOME with (force)"
fi
psql "$PG_ADMIN_URL" -tAc "select 1 from pg_database where datname = '$DB_NOME'" | grep -q 1 \
  || psql "$PG_ADMIN_URL" -qc "create database $DB_NOME"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f scripts/locale/ruoli.sql

nohup "$MAILPIT_BIN" --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 > "$DATI/log/mailpit.log" 2>&1 &
echo $! > "$DATI/mailpit.pid"

nohup node scripts/locale/gateway.mjs > "$DATI/log/gateway.log" 2>&1 &
echo $! > "$DATI/gateway.pid"

GOOGLE_ATTIVO=false
[ -n "${GOOGLE_CLIENT_ID:-}" ] && GOOGLE_ATTIVO=true

env -i PATH="$PATH" \
  GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
  API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="$DB_URL?search_path=auth" GOTRUE_DB_NAMESPACE=auth \
  GOTRUE_SITE_URL="$SITE_URL" GOTRUE_URI_ALLOW_LIST="$SITE_URL/**,http://127.0.0.1:3000/**" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false \
  GOTRUE_PASSWORD_MIN_LENGTH=10 GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 GOTRUE_RATE_LIMIT_VERIFY=10000 \
  GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_SIGN_UP=10000 GOTRUE_RATE_LIMIT_OTP=10000 \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=1025 GOTRUE_SMTP_USER=x GOTRUE_SMTP_PASS=x \
  GOTRUE_SMTP_ADMIN_EMAIL=noreply@bigbrotherstudio.local GOTRUE_SMTP_SENDER_NAME=BigBrotherStudio \
  GOTRUE_MAILER_SUBJECTS_CONFIRMATION="Conferma il tuo indirizzo email" \
  GOTRUE_MAILER_SUBJECTS_RECOVERY="Scegli una nuova password" \
  GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:54321/modelli/conferma.html \
  GOTRUE_MAILER_TEMPLATES_RECOVERY=http://127.0.0.1:54321/modelli/recupero.html \
  GOTRUE_EXTERNAL_GOOGLE_ENABLED=$GOOGLE_ATTIVO \
  GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" GOTRUE_EXTERNAL_GOOGLE_SECRET="${GOOGLE_CLIENT_SECRET:-}" \
  GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=http://127.0.0.1:54321/auth/v1/callback \
  GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true \
  GOTRUE_LOG_LEVEL=warn \
  nohup "$GOTRUE_BIN" > "$DATI/log/gotrue.log" 2>&1 &
echo $! > "$DATI/gotrue.pid"

printf 'Attendo GoTrue'
for _ in $(seq 1 60); do
  if curl -fs http://127.0.0.1:54321/auth/v1/health > /dev/null; then break; fi
  printf '.'; sleep 1
done
echo
curl -fs http://127.0.0.1:54321/auth/v1/health > /dev/null || { echo "GoTrue non parte: vedi $DATI/log/gotrue.log"; tail -20 "$DATI/log/gotrue.log"; exit 1; }

DATABASE_URL="$DB_URL" npx tsx scripts/migra.ts
echo "Stack locale pronto: Supabase http://127.0.0.1:54321 · Mailpit http://127.0.0.1:8025 · database $DB_URL"
