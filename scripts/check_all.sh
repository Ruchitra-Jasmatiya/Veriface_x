#!/usr/bin/env bash
# Runs every check that does not need a running server.
# Usage: DJANGO_DEBUG=1 bash scripts/check_all.sh
set -u
cd "$(dirname "$0")/.."
fail=0
step() { echo; echo "== $1"; }

step "Forensic engine unit tests (no Django needed)"
python tests/test_forensics.py || fail=1

step "Django system check"
python manage.py check || fail=1

step "Django API tests"
python manage.py test api --verbosity 1 || fail=1

step "Frontend syntax (esbuild if available, otherwise vite build)"
if [ -d node_modules ]; then
  npm run build || fail=1
else
  echo "node_modules missing: run 'npm install' first" ; fail=1
fi

echo
if [ $fail -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit $fail
