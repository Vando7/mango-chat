#!/usr/bin/env node
// Smoke test for MCP servers declared in mcp.json. Spawns each one as a
// stdio child, runs the handshake (initialize + initialized notify), lists
// tools, then invokes one tool per server. Bypasses the Vite bridge so
// failures here are local to the Python side.
//
// Usage:  node scripts/test-mcp.js
//         node scripts/test-mcp.js path/to/other-mcp.json
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = resolve(repoRoot, process.argv[2] || 'mcp.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))

const PROTOCOL_VERSION = '2024-11-05'

// Per-server canned smoke calls — { tool name → arguments }. Anything
// not listed gets skipped (we still verify tools/list).
const SAMPLE_CALLS = {
  date: { now: {} },
  sysinfo: { get_info: {} },
}

async function probeServer(name, spec) {
  const child = spawn(spec.command, spec.args || [], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(spec.env || {}) },
  })

  let stderrBuf = ''
  child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString() })

  const pending = new Map()
  let nextId = 1
  let buffer = ''

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id != null && pending.has(msg.id)) {
          const { resolve: r } = pending.get(msg.id)
          pending.delete(msg.id)
          r(msg)
        }
      } catch {
        // ignore non-JSON lines (some servers print banners)
      }
    }
  })

  const send = (method, params) => {
    const id = nextId++
    const req = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolveResp, rejectResp) => {
      pending.set(id, { resolve: resolveResp })
      const t = setTimeout(() => {
        pending.delete(id)
        rejectResp(new Error(`timeout waiting for ${method}`))
      }, 8000)
      const cleanup = (m) => { clearTimeout(t); resolveResp(m) }
      pending.set(id, { resolve: cleanup })
      child.stdin.write(JSON.stringify(req) + '\n')
    })
  }

  const notify = (method, params) => {
    const req = { jsonrpc: '2.0', method, params }
    child.stdin.write(JSON.stringify(req) + '\n')
  }

  try {
    const init = await send('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mango-chat-smoke', version: '0.0.0' },
    })
    if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`)
    notify('notifications/initialized')

    const listed = await send('tools/list', {})
    const tools = listed.result?.tools || []
    console.log(`\n[${name}] initialized — ${tools.length} tool(s):`)
    for (const t of tools) {
      console.log(`    • ${t.name}${t.description ? ' — ' + t.description.split('\n')[0] : ''}`)
    }

    const samples = SAMPLE_CALLS[name] || {}
    for (const [toolName, args] of Object.entries(samples)) {
      if (!tools.some((t) => t.name === toolName)) {
        console.log(`    (no '${toolName}' tool — skipping)`)
        continue
      }
      const called = await send('tools/call', { name: toolName, arguments: args })
      if (called.error) {
        console.log(`    ✗ ${toolName} → error: ${JSON.stringify(called.error)}`)
        continue
      }
      const content = called.result?.content || []
      const text = content.map((c) => c.text ?? JSON.stringify(c)).join('\n')
      console.log(`    ✓ ${toolName}(${JSON.stringify(args)}) →\n        ${text.replace(/\n/g, '\n        ')}`)
    }
  } finally {
    if (stderrBuf.trim()) {
      console.log(`    [stderr] ${stderrBuf.trim().split('\n').slice(0, 6).join('\n               ')}`)
    }
    child.kill('SIGTERM')
  }
}

const entries = Object.entries(config.mcpServers || {})
if (entries.length === 0) {
  console.error('No mcpServers configured in', configPath)
  process.exit(1)
}

let failed = 0
for (const [name, spec] of entries) {
  try {
    await probeServer(name, spec)
  } catch (e) {
    failed++
    console.error(`\n[${name}] FAILED: ${e.message}`)
  }
}

console.log(failed === 0 ? '\nAll servers OK.' : `\n${failed} server(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
