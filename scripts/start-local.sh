#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_RUNTIME="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"

export PATH="$CODEX_RUNTIME/node/bin:$CODEX_RUNTIME/bin/fallback:$PATH"

cd "$PROJECT_DIR"
brew services start postgresql@17 >/dev/null 2>&1 || true
(sleep 2 && open "http://localhost:3000") &
exec pnpm exec next dev --port 3000
