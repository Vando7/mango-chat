#!/usr/bin/env bash
set -e

SERVER_URL="${1:-http://172.27.112.1:1234}"
echo "=== Testing API at $SERVER_URL ==="

echo ""
echo "→ GET /v1/models"
curl -s "$SERVER_URL/v1/models" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'))
const list = data.models || data.data || []
if (list.length === 0) console.log('  (no models)')
list.forEach(m => console.log('  ' + (m.id || m.name || m)))
" 2>/dev/null || echo "  (models endpoint failed)"

echo ""
echo "→ POST /v1/chat/completions (test message)"
RESPONSE=$(curl -s "$SERVER_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant. Keep responses short."},
      {"role": "user", "content": "Say hello in 5 words"}
    ],
    "stream": false
  }')
echo "$RESPONSE" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'))
const content = data.choices?.[0]?.message?.content || '(no response)'
console.log('  ' + content.slice(0, 200))
" 2>/dev/null || echo "  (chat endpoint failed)"

echo ""
echo "Done."
