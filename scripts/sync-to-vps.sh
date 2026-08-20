#!/usr/bin/env bash
# Envia o código IR para a VPS SEM secrets (.env fica no servidor).
#
# Uso:
#   IR_VPS_HOST=root@SEU_IP IR_VPS_DRY_RUN=1 bash scripts/sync-to-vps.sh   # simula
#   IR_VPS_HOST=root@SEU_IP bash scripts/sync-to-vps.sh                    # envia
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${IR_VPS_HOST:-}"
DEST="${IR_VPS_DEST:-/opt/ir-consultoria}"
DRY_RUN="${IR_VPS_DRY_RUN:-0}"

if [[ -z "$HOST" ]]; then
  echo "Defina IR_VPS_HOST=root@IP_DA_VPS"
  echo "Ex.: IR_VPS_HOST=root@187.x.x.x bash scripts/sync-to-vps.sh"
  exit 1
fi

# `rsync --delete` apaga o que não existe na origem. Um destino errado
# (ex.: /opt/conversa-hub) destruiria a Lis, então o caminho é conferido antes.
case "$DEST" in
  */ir-consultoria) ;;
  *)
    echo "Destino recusado: $DEST"
    echo "Deve terminar em /ir-consultoria (proteção contra apagar outro projeto)."
    exit 1
    ;;
esac

if [[ "$DEST" == *conversa-hub* || "$DEST" == "/" || "$DEST" == "/opt" ]]; then
  echo "Destino recusado: $DEST"
  exit 1
fi

RSYNC_FLAGS=(-avz --delete)
[[ "$DRY_RUN" != "0" ]] && RSYNC_FLAGS+=(--dry-run)

echo "Sync $ROOT → $HOST:$DEST"
[[ "$DRY_RUN" != "0" ]] && echo "(dry-run: nada será escrito)"
echo

rsync "${RSYNC_FLAGS[@]}" \
  --include '.env.example' \
  --exclude '.env*' \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude logs \
  --exclude '*.log' \
  --exclude .DS_Store \
  "$ROOT/" "$HOST:$DEST/"

if [[ "$DRY_RUN" != "0" ]]; then
  echo
  echo "Dry-run concluído. Repita sem IR_VPS_DRY_RUN para enviar de verdade."
  exit 0
fi

cat <<EOF

OK. Na VPS (nada disso toca a Lis):
  cd $DEST
  npm install                      # tsx é dependência de runtime (api:start usa tsx)
  npm run panel:build              # painel em https://ir.meuanalistacrm.app
  # criar/editar .env (NÃO copiar da Lis) — chmod 600 .env
  pm2 restart ir-consultoria-api --update-env
  pm2 save
  curl -sS http://127.0.0.1:3010/api/health

Confirmar que a Lis segue de pé:
  curl -sS http://127.0.0.1:9000/api/health
  pm2 describe conversa-hub-api | grep -E 'status|uptime'
EOF
