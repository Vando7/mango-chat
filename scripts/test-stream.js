#!/usr/bin/env node
// Test streaming: node scripts/test-stream.js [model] [message]

const url = process.env.LLM_URL || 'http://172.27.112.1:1234/v1/chat/completions'
const model = process.argv[2] || 'Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL'
const message = process.argv[3] || 'What is 2+2?'

async function test() {
  console.log(`\n📡 Streaming test → model: ${model}`)
  console.log(`   message: "${message}"\n`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: message },
      ],
      stream: true,
    }),
  })

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`)
    const text = await res.text()
    console.error(text)
    process.exit(1)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let reasoning = ''
  let chunks = 0

  const out = process.stdout
  out.write('💬 ')
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

        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content
          continue
        }

        if (delta.content) {
          fullText += delta.content
          out.write(delta.content)
          chunks++
        }
      } catch {
        // Skip malformed SSE lines.
      }
    }
  }

  out.write('\n')
  console.log(`✅ Done — ${chunks} chunks, ${fullText.length} chars`)
  if (reasoning) {
    console.log(`\n💭 Reasoning: ${reasoning.slice(0, 100)}...`)
  }
}

test().catch(err => { console.error('❌', err.message); process.exit(1) })
