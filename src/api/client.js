let API_BASE = 'http://172.27.112.1:1234'

export const setApiBase = (url) => {
  API_BASE = url.endsWith('/') ? url.slice(0, -1) : url
}

export const getApiBase = () => API_BASE

const request = async (path, body, signal) => {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res
}

// Returns rich model objects when the backend supports LM Studio's
// `/api/v0/models` (with type/publisher/arch/quantization/state/context/etc.),
// else falls back to plain OpenAI `/v1/models` and returns minimal `{ id }`
// objects. Callers that only need the id should read `m.id`.
export const fetchModels = async () => {
  // Try LM Studio's richer endpoint first.
  try {
    const lmRes = await fetch(`${getApiBase()}/api/v0/models`)
    if (lmRes.ok) {
      const data = await lmRes.json()
      const list = data.data || data.models || []
      if (Array.isArray(list) && list.length > 0 && list[0]?.id) {
        return list.map((m) => ({
          id: m.id,
          type: m.type,
          publisher: m.publisher,
          arch: m.arch,
          quantization: m.quantization,
          state: m.state,
          maxContext: m.max_context_length,
          loadedContext: m.loaded_context_length,
          capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
        }))
      }
    }
  } catch {
    // Endpoint not present — fall through to the OpenAI shape below.
  }

  const res = await fetch(`${getApiBase()}/v1/models`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = data.models || data.data || data || []
  return list.map((m) => (typeof m === 'string' ? { id: m } : { id: m.id || m.name }))
}

// Map our internal message shape to OpenAI's content-array format.
// Handles three shapes:
//  - normal text (user/assistant/system)
//  - text + image attachments (vision)
//  - assistant turns with tool_calls (no images)
//  - {role:'tool', tool_call_id, content} rows (already in OpenAI shape)
function toOpenAIMessage(msg) {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.tool_call_id,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }
  }

  const out = { role: msg.role }
  const images = Array.isArray(msg.images) ? msg.images : []

  if (images.length > 0) {
    out.content = [
      ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
      ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ]
  } else {
    out.content = msg.content || ''
  }

  if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    out.tool_calls = msg.tool_calls
  }
  return out
}

// ---------------------------------------------------------------------------
// XML tool-call extraction (Nemotron / various reasoning-model dialects)
// ---------------------------------------------------------------------------
//
// Some models (notably nvidia/nemotron-3-nano) are trained to emit tool
// calls and reasoning *inline* in the regular content stream, using XML-style
// markup — e.g.:
//
//     <think>let me check…</think>
//     <tool_call>
//       <function=mcp__date__now>
//         <parameter=foo>bar</parameter>
//       </function>
//     </tool_call>
//
// instead of the OpenAI structured `delta.tool_calls[]` SSE field. LM Studio's
// llama.cpp backend doesn't have a parser configured for this dialect, so the
// raw markup hits us inside `delta.content`. We extract it client-side so the
// chat loop can act on it identically to a "native" tool call.
//
// The parser re-runs from scratch on every chunk (much simpler than a true
// streaming state machine, and cost is negligible for typical response sizes).
// While a tag is mid-flight (open but not yet closed), the unclosed segment is
// held back — the user never sees `<tool_call>` markup leak into the bubble.

// Tool-call markers we recognize. `[[CALL]]` is what we instruct the model
// to emit when "force tools" is on — Lemonade (and likely other backends
// developing native tool support) appears to intercept `<tool_call>` and
// either swallow the markup or stop generation mid-call, so we use a tag
// outside their detector. `<tool_call>` is kept as a secondary form so
// models that emit Hermes/Nemotron markup natively still work when the
// backend passes the markup through (LM Studio + llama.cpp without
// reasoning_format=auto, for instance).
const TOOL_MARKERS = [
  { open: '[[CALL]]', close: '[[/CALL]]' },
  { open: '<tool_call>', close: '</tool_call>' },
]

// Both `<` and `[` can begin a known tag — used by the partial-tag holdback
// at chunk boundaries and by the plain-text fast-forward.
const isPotentialTagChar = (c) => c === '<' || c === '['

const matchToolOpen = (text, idx) => {
  for (const m of TOOL_MARKERS) {
    if (text.startsWith(m.open, idx)) return m
  }
  return null
}

const KNOWN_TAG_STARTS = [
  '<think>', '</think>',
  ...TOOL_MARKERS.flatMap((m) => [m.open, m.close]),
]

const couldStartKnownTag = (rest) => {
  for (const tag of KNOWN_TAG_STARTS) {
    if (tag.startsWith(rest)) return true
  }
  return false
}

// Two dialects appear inside `<tool_call>…</tool_call>`:
//   1. Hermes / Qwen3 style — a JSON object: `{"name": "...", "arguments": {...}}`
//      (Qwen also accepts `parameters` as an alias for `arguments`.)
//   2. Nemotron style — XML nesting: `<function=name><parameter=k>v</parameter></function>`
// We try JSON first when the trimmed block starts with `{`, then fall through.
const parseToolCallBlock = (block, idx) => {
  const trimmed = block.trim()
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === 'object' && typeof obj.name === 'string') {
        const rawArgs = obj.arguments ?? obj.parameters ?? {}
        const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
        return {
          id: `xml_call_${idx}`,
          type: 'function',
          function: { name: obj.name, arguments: argsStr },
        }
      }
    } catch {
      // Not valid JSON — fall through to nemotron-style parsing below.
    }
  }

  const fnMatch = block.match(/<function=([^>\s]+)\s*>([\s\S]*?)<\/function>/)
  if (!fnMatch) return null
  const name = fnMatch[1].trim()
  const inner = fnMatch[2]
  const args = {}
  const paramRe = /<parameter=([^>\s]+)\s*>([\s\S]*?)<\/parameter>/g
  let m
  while ((m = paramRe.exec(inner)) !== null) {
    const key = m[1].trim()
    const raw = m[2].trim()
    // Coerce JSON-y values (numbers, booleans, arrays, objects) so the
    // downstream tool gets typed args; fall back to raw string otherwise.
    let value = raw
    try { value = JSON.parse(raw) } catch { /* keep as string */ }
    args[key] = value
  }
  return {
    id: `xml_call_${idx}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  }
}

// Render an OpenAI function-tool array as a system-prompt addendum that
// instructs the model to emit tool calls in the `<tool_call><function=…>`
// XML dialect that `extractNemotronMarkup` understands. Used as a fallback
// for backends that don't pass the `tools` request field through to the
// model (e.g. AMD Lemonade as of 2026-05) — the request-body tools array
// gets dropped by the proxy, so the only way to get the model to emit a
// tool call is to describe the catalog inside the system prompt and rely
// on the inline-XML parser to lift the markup out of `delta.content`.
//
// Output is a plain-text block; the caller is responsible for prepending
// it to the system message of `historyToSend`.
export const buildToolCatalogPrompt = (tools) => {
  const fmtType = (schema) => {
    if (!schema) return 'any'
    const base = schema.type || 'any'
    if (base === 'array' && schema.items?.type) return `array<${schema.items.type}>`
    return base
  }

  const lines = [
    'You have access to the tools listed below. When the user asks for',
    'something a tool can answer, your ENTIRE next response must be a single',
    '[[CALL]] block — no preamble, no acknowledgment ("sure", "let me…",',
    '"I\'ll call X"), no code fences, no explanation of what you\'re about to',
    'do. The host will execute the tool and feed the result back to you on',
    'the next turn; that is when you write the user-facing answer.',
    '',
    'IMPORTANT: use the literal markers [[CALL]] and [[/CALL]] (double square',
    'brackets). Do NOT use <tool_call>…</tool_call> — that tag is intercepted',
    'by the inference server before it reaches the host, so calls written with',
    'it will be silently dropped.',
    '',
    'Examples (assume mcp__date__now exists):',
    '',
    'User: What\'s today\'s date?',
    'You: [[CALL]]{"name": "mcp__date__now", "arguments": {}}[[/CALL]]',
    '',
    'User: Search HN for "rust async".',
    'You: [[CALL]]{"name": "mcp__deep-dive__hn_search", "arguments": {"query": "rust async"}}[[/CALL]]',
    '',
    'WRONG (do not do these):',
    '  "Sure, let me check the date for you." [stops with no [[CALL]] block]',
    '  "I\'ll call get_date now." [[CALL]]…[[/CALL]]      ← preamble first',
    '  ```[[CALL]]…[[/CALL]]```                          ← code fences',
    '  <tool_call>…</tool_call>                          ← wrong tag',
    '',
    'Two argument formats are accepted; prefer Format A (JSON):',
    '',
    'Format A — JSON (Hermes / Qwen-style):',
    '[[CALL]]',
    '{"name": "TOOL_NAME", "arguments": {"ARG_NAME": "VALUE"}}',
    '[[/CALL]]',
    '',
    'Format B — XML (Nemotron-style):',
    '[[CALL]]',
    '<function=TOOL_NAME>',
    '<parameter=ARG_NAME>VALUE</parameter>',
    '</function>',
    '[[/CALL]]',
    '',
    'In Format B, VALUE is parsed as JSON when possible, else taken verbatim —',
    'for arrays, objects, numbers and booleans emit raw JSON (e.g.',
    '<parameter=urls>["https://x"]</parameter>). Do not invent tools that are',
    'not listed below. If no tool is needed, answer normally.',
    '',
    'Available tools:',
    '',
  ]

  for (const t of tools) {
    const fn = t.function
    if (!fn?.name) continue
    const oneLine = (fn.description || '').split('\n')[0].trim()
    lines.push(`- ${fn.name}${oneLine ? ` — ${oneLine}` : ''}`)
    const props = fn.parameters?.properties || {}
    const required = new Set(fn.parameters?.required || [])
    const keys = Object.keys(props)
    if (keys.length === 0) {
      lines.push('  (no arguments)')
      continue
    }
    for (const k of keys) {
      const schema = props[k]
      const tag = required.has(k)
        ? 'required'
        : schema?.default !== undefined
          ? `default ${JSON.stringify(schema.default)}`
          : 'optional'
      const desc = schema?.description ? ` — ${schema.description.split('\n')[0].trim()}` : ''
      lines.push(`  - ${k} (${fmtType(schema)}, ${tag})${desc}`)
    }
  }

  return lines.join('\n')
}

// Returns { visible, reasoning, toolCalls } extracted from raw streamed text.
// `toolCalls` matches the same shape we accumulate from OpenAI's native
// `delta.tool_calls[]` so callers can treat both paths identically.
// Exported solely so unit tests in scripts/ can exercise it; not part of the
// public client API.
export const extractNemotronMarkup = (rawText) => {
  let visible = ''
  let reasoning = ''
  const toolCalls = []
  const n = rawText.length
  let i = 0

  // Scan a chunk of text (typically the body of a <think> block) and pull
  // any tool-call markup out as real calls. Returns the residual reasoning
  // text with the markup stripped. Qwen3 in thinking mode often emits its
  // tool calls inline inside <think>, and we want them to actually fire
  // rather than disappear into the reasoning channel.
  const liftCallsFromInner = (text) => {
    let out = ''
    let j = 0
    const len = text.length
    while (j < len) {
      // Find the earliest occurrence of any known tool-open marker.
      let bestOpen = -1
      let marker = null
      for (const m of TOOL_MARKERS) {
        const idx = text.indexOf(m.open, j)
        if (idx !== -1 && (bestOpen === -1 || idx < bestOpen)) {
          bestOpen = idx
          marker = m
        }
      }
      if (bestOpen === -1) { out += text.slice(j); break }
      const close = text.indexOf(marker.close, bestOpen + marker.open.length)
      if (close === -1) {
        // Incomplete — keep the rest in reasoning so we don't lose it.
        out += text.slice(j)
        break
      }
      out += text.slice(j, bestOpen)
      const block = text.slice(bestOpen + marker.open.length, close)
      const parsed = parseToolCallBlock(block, toolCalls.length)
      if (parsed) toolCalls.push(parsed)
      else out += text.slice(bestOpen, close + marker.close.length)
      j = close + marker.close.length
    }
    return out
  }

  // Scan forward from i for the next character that could begin a known
  // tag (`<` or `[`). Lets us fast-forward over plain prose runs.
  const nextPotentialTag = (from) => {
    for (let k = from; k < n; k++) {
      if (isPotentialTagChar(rawText[k])) return k
    }
    return -1
  }

  while (i < n) {
    if (rawText.startsWith('<think>', i)) {
      const end = rawText.indexOf('</think>', i + 7)
      if (end === -1) {
        // Unclosed — accumulate as in-progress reasoning, drop the rest.
        reasoning += liftCallsFromInner(rawText.slice(i + 7))
        i = n
      } else {
        reasoning += liftCallsFromInner(rawText.slice(i + 7, end))
        i = end + '</think>'.length
      }
      continue
    }

    const tool = matchToolOpen(rawText, i)
    if (tool) {
      const end = rawText.indexOf(tool.close, i + tool.open.length)
      if (end === -1) {
        // Unclosed — hold the rest back; we'll see it on a later chunk.
        i = n
      } else {
        const block = rawText.slice(i + tool.open.length, end)
        const parsed = parseToolCallBlock(block, toolCalls.length)
        if (parsed) {
          toolCalls.push(parsed)
        } else {
          // Malformed — surface raw block to the user so they see *something*
          // rather than silently dropping it.
          visible += rawText.slice(i, end + tool.close.length)
        }
        i = end + tool.close.length
      }
      continue
    }

    if (isPotentialTagChar(rawText[i])) {
      const rest = rawText.slice(i)
      if (couldStartKnownTag(rest)) {
        // Partial tag at the buffer tail — wait for more chunks.
        i = n
      } else {
        // Plain '<' or '[' (e.g. `if x < 5`, markdown link `[text]`). Emit
        // and move on.
        visible += rawText[i]
        i += 1
      }
      continue
    }

    // Run of plain chars up to the next potential tag start (or end).
    const next = nextPotentialTag(i)
    if (next === -1) {
      visible += rawText.slice(i)
      i = n
    } else {
      visible += rawText.slice(i, next)
      i = next
    }
  }

  return { visible, reasoning, toolCalls }
}

// Streaming chat completion. Yields events shaped:
//   { text, reasoning, toolCalls, finishReason }
// `toolCalls` is an array indexed by the OpenAI `tool_calls[].index`,
// each entry shaped { id, type:'function', function:{ name, arguments:string } }
// with `arguments` accumulating partial JSON across chunks. Caller is
// responsible for JSON.parse'ing once `finishReason === 'tool_calls'`.
export async function* chat(history, selectedModel, signal, tools) {
  const messages = history.map(toOpenAIMessage)

  const body = { model: selectedModel, messages, stream: true }
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const res = await request('/v1/chat/completions', body, signal)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''                 // raw delta.content concatenation
  let reasoningText = ''            // from delta.reasoning_content (native)
  const nativeToolCalls = []        // sparse-by-index, from delta.tool_calls[]
  let finishReason = null

  // Build the public event for a yield. Native tool calls and native
  // reasoning_content take priority; if neither is being used, we fall back
  // to scanning fullText for inline XML markup (Nemotron-style).
  const buildEvent = () => {
    if (nativeToolCalls.length > 0) {
      return { text: fullText, reasoning: reasoningText, toolCalls: nativeToolCalls, finishReason }
    }
    const xml = extractNemotronMarkup(fullText)
    const visible = xml.visible
    const combinedReasoning = reasoningText + xml.reasoning
    const combinedToolCalls = xml.toolCalls
    let effectiveFinishReason = finishReason
    if (combinedToolCalls.length > 0 && finishReason && finishReason !== 'tool_calls') {
      // Override terminal finish reasons (`stop`, `length`, etc.) so the
      // multi-turn loop in App.jsx kicks in for inline-XML tool calls.
      effectiveFinishReason = 'tool_calls'
    }
    return {
      text: visible,
      reasoning: combinedReasoning,
      toolCalls: combinedToolCalls,
      finishReason: effectiveFinishReason,
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n').filter((l) => l.trim().startsWith('data:'))

      for (const line of lines) {
        const data = line.trim().slice(5).trim()
        if (data === '[DONE]' || !data) continue
        try {
          const parsed = JSON.parse(data)
          const choice = parsed.choices?.[0]
          if (!choice) continue
          if (choice.finish_reason) finishReason = choice.finish_reason
          const delta = choice.delta
          if (!delta) continue

          let grew = false
          if (delta.reasoning_content) {
            reasoningText += delta.reasoning_content
            grew = true
          }
          if (delta.content) {
            fullText += delta.content
            grew = true
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const existing = nativeToolCalls[idx] || { id: '', type: 'function', function: { name: '', arguments: '' } }
              if (tc.id) existing.id = tc.id
              if (tc.type) existing.type = tc.type
              if (tc.function) {
                if (tc.function.name) existing.function.name = tc.function.name
                if (tc.function.arguments) existing.function.arguments += tc.function.arguments
              }
              nativeToolCalls[idx] = existing
              grew = true
            }
          }

          // Skip yielding on metadata-only deltas (role announcements, empty
          // diffs) — every yield triggers a React rerender on the caller.
          if (grew) yield buildEvent()
        } catch {
          // Skip malformed SSE lines (partial JSON across chunk boundaries).
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // User stopped generation - ignore
    } else {
      throw err
    }
  }

  // Final yield with the resolved finishReason in case the closing chunk
  // didn't carry any incremental delta.
  return buildEvent()
}
