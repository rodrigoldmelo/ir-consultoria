#!/usr/bin/env bash
# Mostra o que falta no .env.local — sem imprimir secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env.local não encontrado. Rode: cp .env.example .env.local"
  exit 1
fi

# shellcheck disable=SC1090
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    export "$key=$val"
  fi
done < "$ENV_FILE"

ok() { echo "✅ $1"; }
miss() { echo "⬜ $1"; }

has() { [[ -n "${!1:-}" ]]; }

echo "== IR Consultoria — check env =="
echo "Arquivo: $ENV_FILE"
echo

echo "--- Supabase ---"
if has IR_SUPABASE_URL && has IR_SUPABASE_SERVICE_ROLE_KEY; then
  ok "Supabase (URL + service role)"
else
  miss "Supabase — IR_SUPABASE_URL + IR_SUPABASE_SERVICE_ROLE_KEY"
fi
if has IR_STORAGE_DOCUMENTS_BUCKET; then
  ok "Bucket: $IR_STORAGE_DOCUMENTS_BUCKET"
else
  miss "IR_STORAGE_DOCUMENTS_BUCKET"
fi

echo
echo "--- Meta WhatsApp (disparo ativo) ---"
for var in IR_META_WHATSAPP_TOKEN IR_META_PHONE_NUMBER_ID IR_WHATSAPP_TEMPLATE_INITIAL IR_META_VERIFY_TOKEN; do
  if has "$var"; then ok "$var"; else miss "$var"; fi
done
if has IR_META_WABA_ID; then ok "IR_META_WABA_ID"; else miss "IR_META_WABA_ID (opcional p/ envio)"; fi

echo
echo "--- Meta Lead Ads ---"
for var in IR_META_APP_ID IR_META_APP_SECRET IR_META_PAGE_ID; do
  if has "$var"; then ok "$var"; else miss "$var"; fi
done
if has IR_META_FORM_IDS; then ok "IR_META_FORM_IDS"; else miss "IR_META_FORM_IDS (opcional até form existir)"; fi
if has IR_META_PAGE_TOKEN; then ok "IR_META_PAGE_TOKEN (pull/detalhes leadgen)"; else miss "IR_META_PAGE_TOKEN (recomendado p/ pull e detalhes leadgen)"; fi

echo
echo "--- OpenAI (conversa) ---"
if has IR_OPENAI_API_KEY; then ok "IR_OPENAI_API_KEY"; else miss "IR_OPENAI_API_KEY (para orquestrador real)"; fi

echo
echo "--- Painel ---"
if has IR_PANEL_LOGIN_PASSWORD || has IR_PANEL_TOKEN; then
  ok "Login do painel (IR_PANEL_LOGIN_PASSWORD ou IR_PANEL_TOKEN)"
else
  miss "IR_PANEL_LOGIN_PASSWORD (ou IR_PANEL_TOKEN como senha)"
fi

echo
echo "--- Próximo passo sugerido ---"
if ! has IR_META_WHATSAPP_TOKEN || ! has IR_META_PHONE_NUMBER_ID || ! has IR_WHATSAPP_TEMPLATE_INITIAL; then
  echo "→ Configurar Meta: docs/META_SETUP_PASSO_A_PASSO.md"
elif ! has IR_META_VERIFY_TOKEN; then
  echo "→ Definir IR_META_VERIFY_TOKEN e configurar webhooks"
else
  echo "→ Subir VPS + DNS ir. → docs/DEPLOY_VPS_E_META.md seção 3"
fi
