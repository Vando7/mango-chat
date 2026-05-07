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

export async function* chat(history, selectedModel, signal) {
  const messages = history.map((msg) => {
    if (msg.image) {
      return {
        role: msg.role,
        content: [
          ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
          { type: 'image_url', image_url: { url: msg.image } },
        ].filter(Boolean),
      }
    }
    return { role: msg.role, content: msg.content }
  })

  const res = await request('/v1/chat/completions', { model: selectedModel, messages, stream: true }, signal)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let reasoningText = ''

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
          const delta = parsed.choices?.[0]?.delta
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

          // Skip yielding on metadata-only deltas (role announcements, empty
          // diffs) — every yield triggers a React rerender on the caller.
          if (grew) yield { text: fullText, reasoning: reasoningText }
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
}
