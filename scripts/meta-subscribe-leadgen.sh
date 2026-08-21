#!/usr/bin/env bash
# Inscreve a Página no app para webhook leadgen (substitui a UI "Assinar páginas").
# Uso na VPS (NÃO cole o token no chat):
#   export PAGE_TOKEN='cole_o_page_access_token_aqui'
#   printf '%s' 'cole_o_page_access_token_aqui' > /tmp/page_token.txt
#   PAGE_TOKEN_FILE=/tmp/page_token.txt bash scripts/meta-subscribe-leadgen.sh
#   bash scripts/meta-subscribe-leadgen.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PAGE_ID="${IR_META_PAGE_ID:-323083024974374}"
FORM_ID="${IR_META_FORM_IDS%%,*}"
GRAPH_VERSION="${IR_META_GRAPH_VERSION:-v20.0}"
GRAPH_VERSION="${GRAPH_VERSION#v}"
GRAPH_VERSION="v${GRAPH_VERSION}"

TOKEN="${PAGE_TOKEN:-${IR_META_PAGE_TOKEN:-}}"
TOKEN_FILE="${PAGE_TOKEN_FILE:-/tmp/page_token.txt}"
if [[ -z "$TOKEN" && -f "$TOKEN_FILE" ]]; then
  TOKEN="$(<"$TOKEN_FILE")"
fi
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]' | sed -E "s/^['\"]//; s/['\"]$//")"
if [[ -z "$TOKEN" ]]; then
  echo "Defina PAGE_TOKEN ou salve o Page Access Token em ${TOKEN_FILE} nesta sessão SSH."
  echo "No Graph Explorer: GET me/accounts → access_token da Página ${PAGE_ID}"
  echo "Depois: PAGE_TOKEN_FILE=${TOKEN_FILE} bash scripts/meta-subscribe-leadgen.sh"
  exit 1
fi

BASE="https://graph.facebook.com/${GRAPH_VERSION}"

echo "== Página =="
curl -sS "${BASE}/${PAGE_ID}?fields=name,id&access_token=${TOKEN}"
echo
echo

echo "== Inscrever leadgen =="
curl -sS -X POST "${BASE}/${PAGE_ID}/subscribed_apps" \
  -d "subscribed_fields=leadgen" \
  -d "access_token=${TOKEN}"
echo
echo

echo "== Apps inscritos =="
curl -sS "${BASE}/${PAGE_ID}/subscribed_apps?access_token=${TOKEN}"
echo
echo

if [[ -n "${FORM_ID:-}" ]]; then
  echo "== Últimos leads do form ${FORM_ID} (ids apenas) =="
  curl -sS "${BASE}/${FORM_ID}/leads?fields=id,created_time&limit=5&access_token=${TOKEN}"
  echo
fi

echo
echo "OK. Preencha o formulário de novo com: pm2 logs ir-consultoria-api --lines 0"
