#!/usr/bin/env node
// Test image upload: node scripts/test-image.js [model] [message] [path-to-image]

import fs from 'fs'
const url = process.env.LLM_URL || 'http://172.27.112.1:1234/v1/chat/completions'
const model = process.argv[2] || 'Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL'
const message = process.argv[3] || 'What do you see in this image?'
const imagePath = process.argv[4]

if (!imagePath) {
  console.log('Usage: node scripts/test-image.js [model] [message] [image-path]')
  console.log('Example: node scripts/test-image.js qwen3:latest "Describe this" ./test.png')
  process.exit(1)
}

async function test() {
  const base64 = fs.readFileSync(imagePath).toString('base64')
  const imageUri = `data:image/png;base64,${base64}`

  console.log(`\n📷 Image test → model: ${model}`)
  console.log(`   message: "${message}"`)
  console.log(`   image: ${imagePath}\n`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: [
          { type: 'text', text: message },
          { type: 'image_url', image_url: { url: imageUri } },
        ]},
      ],
    }),
  })

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`)
    const text = await res.text()
    console.error(text)
    process.exit(1)
  }

  const data = await res.json()
  const reply = data.choices?.[0]?.message?.content || 'No response'
  console.log(`💬 ${reply}`)
}

test().catch(err => { console.error('❌', err.message); process.exit(1) })
