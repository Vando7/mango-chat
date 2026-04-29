let API_BASE = 'http://localhost:13305'

export const setApiBase = (url) => {
  API_BASE = url.endsWith('/') ? url.slice(0, -1) : url
}

export const getApiBase = () => API_BASE

const request = async (path, body) => {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res
}

export const fetchModels = async () => {
  const res = await fetch(`${getApiBase()}/v1/models`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  // Handle both OpenAI format ({models:[]}) and this API format ({data:[]})
  const list = data.models || data.data || data || []
  return list.map((m) => m.id || m.name || m)
}

export async function* chat(history, selectedModel) {
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

  const res = await request('/v1/chat/completions', { model: selectedModel, messages, stream: true })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let reasoningText = ''

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

        // Collect reasoning_content separately (not shown in UI)
        if (delta.reasoning_content) {
          reasoningText += delta.reasoning_content
          continue
        }

        // Collect actual content
        if (delta.content) {
          fullText += delta.content
          yield { text: fullText, reasoning: reasoningText }
        }
      } catch {}
    }
  }
}
