// Tiny client for the dev-server MCP bridge (vite-plugin-mcp.js).
// Both endpoints are same-origin under Vite — no CORS dance needed.
// Failures degrade silently to "no tools available" so the chat still
// works when the bridge is offline.

const TOOLS_URL = '/mcp/tools'
const CALL_URL = '/mcp/call'

export async function fetchMcpTools() {
  try {
    const res = await fetch(TOOLS_URL)
    if (!res.ok) return { tools: [], servers: [] }
    const data = await res.json()
    return {
      tools: Array.isArray(data.tools) ? data.tools : [],
      servers: Array.isArray(data.servers) ? data.servers : [],
    }
  } catch {
    return { tools: [], servers: [] }
  }
}

export async function callMcpTool(name, args, signal) {
  const res = await fetch(CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: args || {} }),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { content: `HTTP ${res.status}: ${text || res.statusText}`, isError: true }
  }
  const data = await res.json()
  return {
    content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? ''),
    isError: !!data.isError,
  }
}
