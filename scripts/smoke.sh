#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${IR_SMOKE_BASE_URL:-http://127.0.0.1:3010}"
PANEL_TOKEN="${IR_PANEL_TOKEN:-}"

echo "== IR Consultoria smoke =="
echo "Base: $BASE_URL"

echo -n "GET /api/health ... "
HEALTH=$(curl -sf "$BASE_URL/api/health")
echo "OK"
echo "$HEALTH" | head -c 200
echo

if [[ -n "$PANEL_TOKEN" ]]; then
  echo -n "GET /api/ir/panel/status ... "
  curl -sf -H "x-ir-panel-token: $PANEL_TOKEN" "$BASE_URL/api/ir/panel/status" | head -c 200
  echo
  echo "panel status OK"
else
  echo "SKIP panel (set IR_PANEL_TOKEN to test /api/ir/panel/*)"
fi

echo "Smoke complete."
