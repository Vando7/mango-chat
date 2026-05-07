// Tiny client for the dev-server MCP bridge (vite-plugin-mcp.js).
// Both endpoints are same-origin under Vite — no CORS dance needed.
// Failures degrade silently to "no tools available" so the chat still
// works when the bridge is offline.

const TOOLS_URL = '/mcp/tools'
const CALL_URL = '/mcp/call'
const CONFIG_URL = '/mcp/config'

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

// Returns the current on-disk mcp.json text (or '' if missing) plus the
// resolved absolute path the bridge will write to.
export async function fetchMcpConfig() {
  const res = await fetch(CONFIG_URL)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}

// Writes a new mcp.json and triggers an in-process restart of the MCP
// servers. Resolves with `{ ok, tools, servers }` describing the new state.
// Rejects on validation errors (invalid JSON, bad shape) or write failures.
export async function saveMcpConfig(content) {
  const res = await fetch(CONFIG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
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
