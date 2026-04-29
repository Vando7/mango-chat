#!/usr/bin/env bash
set -e

SERVER_URL="${1:-http://localhost:13305}"
echo "🔍 Checking $SERVER_URL..."

if ! curl -s --connect-timeout 5 "$SERVER_URL/v1/models" >/dev/null 2>&1; then
  echo "❌ Server not reachable at $SERVER_URL"
  echo "   Make sure your LLM server (e.g. Ollama, vLLM) is running"
  exit 1
fi

echo "✅ Server is reachable"
echo ""
echo "📋 Available models:"
curl -s "$SERVER_URL/v1/models" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'))
const list = data.models || data.data || []
list.forEach(m => console.log('  ' + (m.id || m.name || m)))
" 2>/dev/null || echo "  (couldn't parse models)"

echo ""
echo "✅ Ready to use"
