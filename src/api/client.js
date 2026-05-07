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
  let fullText = ''
  let reasoningText = ''
  const toolCalls = [] // sparse-by-index, indexed by delta.tool_calls[].index
  let finishReason = null

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
              const existing = toolCalls[idx] || { id: '', type: 'function', function: { name: '', arguments: '' } }
              if (tc.id) existing.id = tc.id
              if (tc.type) existing.type = tc.type
              if (tc.function) {
                if (tc.function.name) existing.function.name = tc.function.name
                if (tc.function.arguments) existing.function.arguments += tc.function.arguments
              }
              toolCalls[idx] = existing
              grew = true
            }
          }

          // Skip yielding on metadata-only deltas (role announcements, empty
          // diffs) — every yield triggers a React rerender on the caller.
          if (grew) yield { text: fullText, reasoning: reasoningText, toolCalls, finishReason }
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
  return { text: fullText, reasoning: reasoningText, toolCalls, finishReason }
}
