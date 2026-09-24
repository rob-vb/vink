#!/usr/bin/env bash
# Deploys Convex (production: spotted-parakeet-30) and reloads the Next.js app
# under pm2. The Next build reads the production Convex URLs from
# .env.production.local.
set -euo pipefail
cd "$(dirname "$0")/.."

npx convex deploy -y
npx next build
pm2 startOrReload ecosystem.config.cjs
pm2 save
