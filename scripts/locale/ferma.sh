#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
for s in gotrue mailpit gateway; do
  [ -f ".dati-locali/$s.pid" ] && kill "$(cat ".dati-locali/$s.pid")" 2>/dev/null
  rm -f ".dati-locali/$s.pid"
done
echo "Stack locale fermato (Postgres resta acceso)"
