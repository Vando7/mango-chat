// Vite plugin that bridges the browser to local MCP servers.
//
// On dev-server start it reads mcp.json from the project root, spawns each
// declared server as a stdio child, runs the JSON-RPC handshake
// (initialize → notifications/initialized → tools/list), then exposes two
// HTTP endpoints to the frontend:
//
//   GET  /mcp/tools  → { tools: [{ type:'function', function:{name,...} }, ...] }
//   POST /mcp/call   → body { name: 'mcp__<server>__<tool>', arguments: {...} }
//                       → { content: '<joined text>', isError: bool, raw }
//
// Tools are flattened across servers and renamed to `mcp__<server>__<tool>`
// so the LLM gets a flat namespace and the frontend can route calls back
// from a tool name alone.
//
// If mcp.json is missing or empty the plugin no-ops cleanly: both endpoints
// reply with an empty list / 503 so the rest of the app keeps working.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROTOCOL_VERSION = '2024-11-05'
const REQUEST_TIMEOUT_MS = 15000
const TOOL_PREFIX = 'mcp__'

// One handle per declared server.
function makeServerHandle(name, spec, cwd) {
  const child = spawn(spec.command, spec.args || [], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(spec.env || {}) },
  })

  const handle = {
    name,
    child,
    pending: new Map(),
    nextId: 1,
    tools: [],
    ready: false,
    error: null,
    buffer: '',
  }

  child.on('error', (err) => {
    handle.error = err.message
    for (const { reject } of handle.pending.values()) reject(err)
    handle.pending.clear()
  })
  child.on('exit', (code, signal) => {
    if (!handle.error && (code !== 0 && code !== null)) {
      handle.error = `child exited (code=${code}, signal=${signal})`
    }
    const exitErr = new Error(handle.error || 'child exited')
    for (const { reject } of handle.pending.values()) reject(exitErr)
    handle.pending.clear()
    handle.ready = false
  })
  child.stderr.on('data', (chunk) => {
    // Surface server stderr to the Vite console — these are usually
    // FastMCP request logs, useful when debugging tool calls.
    const text = chunk.toString().trimEnd()
    if (text) console.log(`[mcp:${name}] ${text}`)
  })
  child.stdout.on('data', (chunk) => {
    handle.buffer += chunk.toString()
    let nl
    while ((nl = handle.buffer.indexOf('\n')) !== -1) {
      const line = handle.buffer.slice(0, nl).trim()
      handle.buffer = handle.buffer.slice(nl + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.id != null && handle.pending.has(msg.id)) {
        const entry = handle.pending.get(msg.id)
        handle.pending.delete(msg.id)
        entry.resolve(msg)
      }
    }
  })

  handle.send = (method, params) => {
    if (handle.error) return Promise.reject(new Error(handle.error))
    const id = handle.nextId++
    const req = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolveResp, rejectResp) => {
      const timer = setTimeout(() => {
        handle.pending.delete(id)
        rejectResp(new Error(`MCP ${name}: timeout on ${method}`))
      }, REQUEST_TIMEOUT_MS)
      handle.pending.set(id, {
        resolve: (m) => { clearTimeout(timer); resolveResp(m) },
        reject: (e) => { clearTimeout(timer); rejectResp(e) },
      })
      try {
        handle.child.stdin.write(JSON.stringify(req) + '\n')
      } catch (e) {
        clearTimeout(timer)
        handle.pending.delete(id)
        rejectResp(e)
      }
    })
  }

  handle.notify = (method, params) => {
    const req = { jsonrpc: '2.0', method, params }
    try { handle.child.stdin.write(JSON.stringify(req) + '\n') } catch { /* ignore */ }
  }

  return handle
}

async function initServer(handle) {
  try {
    const init = await handle.send('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mango-chat', version: '0.0.0' },
    })
    if (init.error) throw new Error(JSON.stringify(init.error))
    handle.notify('notifications/initialized')

    const listed = await handle.send('tools/list', {})
    if (listed.error) throw new Error(JSON.stringify(listed.error))
    handle.tools = (listed.result?.tools || []).map((t) => ({
      raw: t,
      qualified: `${TOOL_PREFIX}${handle.name}__${t.name}`,
      openai: {
        type: 'function',
        function: {
          name: `${TOOL_PREFIX}${handle.name}__${t.name}`,
          description: t.description || '',
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      },
    }))
    handle.ready = true
    console.log(`[mcp] ${handle.name}: ready (${handle.tools.length} tool${handle.tools.length === 1 ? '' : 's'})`)
  } catch (err) {
    handle.error = err.message
    handle.ready = false
    console.warn(`[mcp] ${handle.name}: init failed — ${err.message}`)
  }
}

function readBody(req) {
  return new Promise((res, rej) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks).toString('utf8')
      if (!buf) return res({})
      try { res(JSON.parse(buf)) } catch (e) { rej(e) }
    })
    req.on('error', rej)
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Joins MCP `content` blocks into a single string for the LLM.
function flattenContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => {
      if (typeof c === 'string') return c
      if (c?.type === 'text') return c.text || ''
      return JSON.stringify(c)
    })
    .join('\n')
}

export function mcpPlugin(options = {}) {
  const configFile = options.configFile || 'mcp.json'
  let handles = []
  let initPromise = null

  return {
    name: 'mango-chat:mcp-bridge',
    apply: 'serve',

    configureServer(server) {
      const root = server.config.root
      const configPath = resolve(root, configFile)

      let config
      try {
        config = JSON.parse(readFileSync(configPath, 'utf8'))
      } catch (e) {
        console.log(`[mcp] no servers configured (${configPath} ${e.code === 'ENOENT' ? 'missing' : 'unreadable'})`)
        config = { mcpServers: {} }
      }

      const entries = Object.entries(config.mcpServers || {})
      if (entries.length === 0) {
        initPromise = Promise.resolve()
      } else {
        for (const [name, spec] of entries) {
          try {
            handles.push(makeServerHandle(name, spec, root))
          } catch (e) {
            console.warn(`[mcp] ${name}: failed to spawn — ${e.message}`)
          }
        }
        initPromise = Promise.all(handles.map(initServer))
      }

      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        for (const h of handles) {
          try { h.child.kill('SIGTERM') } catch { /* ignore */ }
        }
        handles = []
      }
      // Cover every shutdown path: graceful HTTP close, terminal signals,
      // and the catch-all `exit` (npm sometimes forwards only SIGHUP, which
      // wouldn't otherwise trigger our handlers).
      server.httpServer?.on('close', cleanup)
      process.once('exit', cleanup)
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.once(sig, () => { cleanup(); process.exit(0) })
      }

      // GET /mcp/tools → flat OpenAI tools list
      server.middlewares.use('/mcp/tools', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        try { await initPromise } catch { /* errors are surfaced per-handle */ }
        const tools = handles.flatMap((h) => h.ready ? h.tools.map((t) => t.openai) : [])
        const status = handles.map((h) => ({
          name: h.name,
          ready: h.ready,
          tools: h.tools.length,
          error: h.error || null,
        }))
        sendJson(res, 200, { tools, servers: status })
      })

      // POST /mcp/call → invoke a tool by qualified name
      server.middlewares.use('/mcp/call', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body
        try { body = await readBody(req) } catch (e) {
          return sendJson(res, 400, { error: 'bad JSON body: ' + e.message })
        }
        const { name, arguments: args } = body || {}
        if (typeof name !== 'string' || !name.startsWith(TOOL_PREFIX)) {
          return sendJson(res, 400, { error: `tool name must start with '${TOOL_PREFIX}'` })
        }
        const rest = name.slice(TOOL_PREFIX.length)
        const sep = rest.indexOf('__')
        if (sep === -1) return sendJson(res, 400, { error: `malformed tool name: ${name}` })
        const serverName = rest.slice(0, sep)
        const toolName = rest.slice(sep + 2)
        const handle = handles.find((h) => h.name === serverName)
        if (!handle) return sendJson(res, 404, { error: `unknown server: ${serverName}` })
        if (!handle.ready) return sendJson(res, 503, { error: `server ${serverName} not ready: ${handle.error || 'init pending'}` })

        try {
          const resp = await handle.send('tools/call', {
            name: toolName,
            arguments: args || {},
          })
          if (resp.error) {
            return sendJson(res, 200, {
              content: `Error: ${resp.error.message || JSON.stringify(resp.error)}`,
              isError: true,
              raw: resp.error,
            })
          }
          const result = resp.result || {}
          sendJson(res, 200, {
            content: flattenContent(result.content),
            isError: !!result.isError,
            raw: result,
          })
        } catch (e) {
          sendJson(res, 200, { content: `Error: ${e.message}`, isError: true })
        }
      })
    },
  }
}
