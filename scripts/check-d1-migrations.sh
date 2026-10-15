#!/usr/bin/env bash
# Ensures every Prisma migration has an identical copy in ./migrations (applied to D1 by wrangler).
set -euo pipefail
i=0; fail=0
for dir in $(ls -d prisma/migrations/*/ | sort); do
  i=$((i+1)); name=$(basename "$dir" | sed 's/^[0-9]*_//')
  target=$(printf "migrations/%04d_%s.sql" "$i" "$name")
  if ! cmp -s "$dir/migration.sql" "$target"; then echo "Missing or out-of-date D1 migration: $target"; fail=1; fi
done
exit $fail
