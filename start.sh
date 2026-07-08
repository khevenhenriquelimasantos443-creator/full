#!/usr/bin/env bash
#
# Coleta Full — inicia TUDO em modo demonstração com um comando só.
#
#   ./start.sh
#
# O que ele faz, automaticamente:
#   1. Instala as dependências (backend e app), se faltarem.
#   2. Cria as chaves locais (.dev.vars) com DEMO_MODE ligado.
#   3. Cria o banco local e carrega o schema.
#   4. Sobe o backend (Cloudflare Worker) em http://localhost:8787.
#   5. Abre o app no navegador, já apontando para o backend local.
#
# Para parar tudo: Ctrl+C.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/apps/backend"
MOBILE="$ROOT/apps/mobile"
API_URL="http://localhost:8787"

info() { printf "\033[1;36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$1"; }

# --- 0. Pré-requisitos ------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale o Node 18+ em https://nodejs.org e rode de novo."
  exit 1
fi

# --- 1. Dependências --------------------------------------------------------
if [ ! -d "$ROOT/node_modules" ]; then
  info "Instalando dependências (pode demorar na primeira vez)…"
  (cd "$ROOT" && npm install)
fi
ok "Dependências prontas."

# --- 2. Chaves locais (.dev.vars) ------------------------------------------
if [ ! -f "$BACKEND/.dev.vars" ]; then
  info "Gerando chaves locais e ligando o modo demonstração…"
  ENC_KEY="$(openssl rand -base64 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  cat > "$BACKEND/.dev.vars" <<EOF
ML_CLIENT_ID="demo"
ML_CLIENT_SECRET="demo"
ML_REDIRECT_URI="$API_URL/auth/callback"
TOKEN_ENC_KEY="$ENC_KEY"
SESSION_JWT_SECRET="$JWT_SECRET"
DEMO_MODE="true"
EOF
fi
ok "Configuração local pronta (modo demonstração ligado)."

# --- 3. Banco local + schema ------------------------------------------------
info "Preparando o banco local…"
(cd "$BACKEND" && npx wrangler d1 execute coleta_full --local --file=./src/db/schema.sql >/dev/null 2>&1) \
  && ok "Banco local pronto." \
  || echo "  (schema já aplicado ou aviso ignorável)"

# --- 4. Backend em segundo plano -------------------------------------------
info "Subindo o backend em $API_URL …"
(cd "$BACKEND" && npx wrangler dev --port 8787 >/tmp/coleta-full-backend.log 2>&1) &
BACKEND_PID=$!

cleanup() {
  echo ""
  info "Encerrando…"
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Espera o /health responder (até ~40s).
for i in $(seq 1 40); do
  if curl -sf "$API_URL/health" >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" -eq 40 ]; then
    echo "O backend demorou a subir. Veja o log em /tmp/coleta-full-backend.log"
    exit 1
  fi
done
ok "Backend no ar."

# --- 5. App no navegador ----------------------------------------------------
info "Abrindo o app no navegador…"
echo ""
echo "  → Quando abrir, clique em \"Entrar em modo demonstração\"."
echo "  → Backend: $API_URL   |   Log: /tmp/coleta-full-backend.log"
echo ""
cd "$MOBILE"
EXPO_PUBLIC_API_BASE_URL="$API_URL" npx expo start --web
