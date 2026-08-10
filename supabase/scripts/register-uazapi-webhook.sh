#!/usr/bin/env bash
# Optional: register webhook on UAZAPI after deploying whatsapp-webhook
# Usage:
#   export UAZAPI_BASE_URL=https://xxx.uazapi.com
#   export UAZAPI_INSTANCE_TOKEN=...
#   export WEBHOOK_URL='https://PROJECT.supabase.co/functions/v1/whatsapp-webhook?secret=SEU_SECRET'
#   bash supabase/scripts/register-uazapi-webhook.sh

set -euo pipefail

if [[ -z "${UAZAPI_BASE_URL:-}" || -z "${UAZAPI_INSTANCE_TOKEN:-}" || -z "${WEBHOOK_URL:-}" ]]; then
  echo "Set UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN and WEBHOOK_URL"
  exit 1
fi

BASE="${UAZAPI_BASE_URL%/}"

curl -sS -X POST "${BASE}/webhook/set" \
  -H "token: ${UAZAPI_INSTANCE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"enabled\": true,
    \"url\": \"${WEBHOOK_URL}\",
    \"events\": [\"messages\"],
    \"excludeMessages\": [\"wasSentByApi\", \"isGroupYes\"]
  }"

echo
echo "Webhook registered."
