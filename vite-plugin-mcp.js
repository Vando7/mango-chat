// Vite plugin that bridges the browser to local MCP servers.
//
// On dev-server start it reads mcp.json from the project root, spawns each
// declared server as a stdio child, runs the JSON-RPC handshake
// (initialize → notifications/initialized → tools/list), then exposes four
// HTTP endpoints to the frontend:
//
//   GET  /mcp/tools  → { tools: [...flat OpenAI function-tool], servers: [...] }
//   POST /mcp/call   → { name: 'mcp__<srv>__<tool>', arguments } → result
//   GET  /mcp/config → { content: '<file text>', exists: bool, path }
//   POST /mcp/config → { content: '<new text>' } → validates, writes,
//                      kills children, respawns from the new config
//
// Tools are flattened across servers and renamed to `mcp__<server>__<tool>`
// so the LLM gets a flat namespace and the frontend can route calls back
// from a tool name alone.
//
// If mcp.json is missing or empty the plugin no-ops cleanly: GET endpoints
// return empty lists and POST /mcp/call returns 503 so the rest of the app
// keeps working.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
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

// Read mcp.json (or return an empty config if missing/unreadable). Used both
// at boot and when serving GET /mcp/config.
function readConfig(configPath) {
  try {
    const raw = readFileSync(configPath, 'utf8')
    return { ok: true, raw, parsed: JSON.parse(raw) }
  } catch (e) {
    return { ok: false, raw: '', error: e, parsed: { mcpServers: {} } }
  }
}

export function mcpPlugin(options = {}) {
  const configFile = options.configFile || 'mcp.json'
  // Captured in closures shared between the boot path and the config-reload
  // path — they mutate `state` instead of being recreated, so middleware
  // closures see the latest set of handles after a hot-reload.
  const state = { handles: [], initPromise: Promise.resolve() }

  return {
    name: 'mango-chat:mcp-bridge',
    apply: 'serve',

    configureServer(server) {
      const root = server.config.root
      const configPath = resolve(root, configFile)

      // Spin up servers from the on-disk config. Returns the new initPromise
      // (resolves when every server has finished its handshake or failed).
      const startFromConfig = (parsedConfig) => {
        const entries = Object.entries(parsedConfig?.mcpServers || {})
        if (entries.length === 0) {
          state.handles = []
          state.initPromise = Promise.resolve()
          return state.initPromise
        }
        const handles = []
        for (const [name, spec] of entries) {
          try {
            handles.push(makeServerHandle(name, spec, root))
          } catch (e) {
            console.warn(`[mcp] ${name}: failed to spawn — ${e.message}`)
          }
        }
        state.handles = handles
        state.initPromise = Promise.all(handles.map(initServer))
        return state.initPromise
      }

      // Tear down all current children. Idempotent.
      const stopAll = () => {
        for (const h of state.handles) {
          try { h.child.kill('SIGTERM') } catch { /* ignore */ }
        }
        state.handles = []
      }

      const initial = readConfig(configPath)
      if (!initial.ok) {
        const reason = initial.error?.code === 'ENOENT' ? 'missing' : 'unreadable'
        console.log(`[mcp] no servers configured (${configPath} ${reason})`)
      }
      startFromConfig(initial.parsed)

      // Cover every shutdown path: graceful HTTP close, terminal signals,
      // and the catch-all `exit` (npm sometimes forwards only SIGHUP, which
      // wouldn't otherwise trigger our handlers).
      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        stopAll()
      }
      server.httpServer?.on('close', cleanup)
      process.once('exit', cleanup)
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.once(sig, () => { cleanup(); process.exit(0) })
      }

      // GET /mcp/tools → flat OpenAI tools list
      server.middlewares.use('/mcp/tools', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        try { await state.initPromise } catch { /* errors are surfaced per-handle */ }
        const tools = state.handles.flatMap((h) => h.ready ? h.tools.map((t) => t.openai) : [])
        const status = state.handles.map((h) => ({
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
        const handle = state.handles.find((h) => h.name === serverName)
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

      // GET /mcp/config → current mcp.json text + metadata
      server.middlewares.use('/mcp/config', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const exists = existsSync(configPath)
        let content = ''
        if (exists) {
          try { content = readFileSync(configPath, 'utf8') } catch { content = '' }
        }
        sendJson(res, 200, { exists, content, path: configPath })
      })

      // POST /mcp/config → validate JSON, atomic write, respawn servers,
      // wait for handshake, return the updated server status.
      server.middlewares.use('/mcp/config', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body
        try { body = await readBody(req) } catch (e) {
          return sendJson(res, 400, { error: 'bad JSON body: ' + e.message })
        }
        const content = body?.content
        if (typeof content !== 'string') {
          return sendJson(res, 400, { error: 'missing string field "content"' })
        }
        let parsed
        try { parsed = JSON.parse(content) } catch (e) {
          return sendJson(res, 400, { error: 'invalid JSON: ' + e.message })
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return sendJson(res, 400, { error: 'top-level value must be an object' })
        }
        if (parsed.mcpServers !== undefined && (typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers) || parsed.mcpServers === null)) {
          return sendJson(res, 400, { error: '"mcpServers" must be an object' })
        }

        // Atomic write — temp file then rename — so a partial write can't
        // leave an unparseable file behind.
        const tmpPath = configPath + '.tmp'
        try {
          // Pretty-print so the on-disk file stays human-readable. Keep the
          // user's content as the source of truth, but reformat to the
          // canonical 2-space indent.
          const canonical = JSON.stringify(parsed, null, 2) + '\n'
          writeFileSync(tmpPath, canonical, 'utf8')
          renameSync(tmpPath, configPath)
        } catch (e) {
          return sendJson(res, 500, { error: 'failed to write config: ' + e.message })
        }

        // Tear down current servers and respawn from the new config.
        console.log('[mcp] config updated — restarting servers')
        stopAll()
        startFromConfig(parsed)
        try { await state.initPromise } catch { /* per-handle errors surfaced below */ }

        const status = state.handles.map((h) => ({
          name: h.name,
          ready: h.ready,
          tools: h.tools.length,
          error: h.error || null,
        }))
        const tools = state.handles.flatMap((h) => h.ready ? h.tools.map((t) => t.openai) : [])
        sendJson(res, 200, { ok: true, tools, servers: status })
      })
    },
  }
}
