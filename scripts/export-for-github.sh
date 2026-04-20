#!/usr/bin/env bash
# Builds ./to-upload — a clean tree to zip or push to GitHub (no node_modules, .next, .env, local DB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf to-upload
mkdir -p to-upload
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude 'build' \
  --exclude 'coverage' \
  --exclude 'to-upload' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.development.local' \
  --exclude '.env.production.local' \
  --exclude '.env.test.local' \
  --exclude '.vercel' \
  --exclude 'uploads' \
  --exclude 'prisma/dev.db' \
  --exclude 'prisma/dev.db-journal' \
  --exclude '.DS_Store' \
  --exclude '*.tsbuildinfo' \
  --exclude 'next-env.d.ts' \
  --exclude 'npm-debug.log*' \
  --exclude 'yarn-debug.log*' \
  --exclude 'yarn-error.log*' \
  --exclude '.pnpm-debug.log*' \
  --exclude '*.pem' \
  ./ to-upload/
echo "Done: $ROOT/to-upload — zip this folder or git init inside it. Do not commit real .env files."
