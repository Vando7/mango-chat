# Chat App

A minimal React chat UI for LLM backends (Ollama, llama.cpp/lemond, vLLM, etc.) with streaming responses and image upload support.

## Features

- **Streaming responses** — real-time token-by-token display
- **Image upload** — multimodal chat with base64 image attachment
- **Reasoning content** — collapsible reasoning block (💭) when the model outputs `reasoning_content`
- **Model selector** — auto-discovers available models from the server
- **Configurable server URL** — connect to any OpenAI-compatible API endpoint

## Quick Start

```bash
# Install dependencies
npm install

# Start the dev server (Vite proxies /v1 → localhost:13305)
npm run dev

# Or use the convenience script
bash dev.sh
```

Then open `http://localhost:5173`, enter your server URL (default: `http://localhost:13305`), and click **Connect**.

## Architecture

```
src/
├── App.jsx              — Main component, state management, orchestration
├── api/
│   └── client.js        — API client: fetchModels, chat (streaming), setApiBase
└── components/
    ├── MessageList.jsx  — Message bubbles, auto-scroll, reasoning display
    ├── ChatInput.jsx    — Textarea, image upload, send button
    └── SettingsPanel.jsx — Server URL input, model selector, connection status
```

## Tech Stack

- **React 19** + Vite 8 (HMR)
- **Tailwind CSS 3**
- **OpenAI-compatible API** — works with Ollama, llama.cpp/lemond, vLLM, etc.

## API Client

The `src/api/client.js` module exports:

- `fetchModels()` — GET `/v1/models`, handles both `{models:[]}` and `{data:[]}` formats
- `chat(history, selectedModel)` — async generator that streams `/v1/chat/completions`
- `setApiBase(url)` — updates the base URL for the server

### Message Format

```js
{ role: 'user', content: 'Hello', image: 'data:image/png;base64,...' }
{ role: 'assistant', content: 'Hi there!', reasoning: '...' }
```

### Streaming

The `chat()` function returns an async generator yielding:

```js
{ text: 'accumulated...', reasoning: 'accumulated...' }
```

## Vite Dev Server

Vite proxies `/v1/**` to the LLM backend (`localhost:13305` by default) to avoid CORS issues. Configure in `vite.config.js`.

## Testing

```bash
# Check server connectivity + list models
npm run check

# Test streaming response
npm run test:stream "model-id" "Your message here"

# Test non-streaming API
npm run test:api

# Test image upload
npm run test:image "model-id" "Describe this" ./test.png

# Full check (lint + build)
npm run check
```

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start Vite dev server |
| `build` | Build for production |
| `preview` | Preview production build |
| `lint` | ESLint check |
| `check` | Run lint + build |
| `test:api` | Non-streaming chat test |
| `test:stream` | Streaming chat test |
| `test:image` | Image upload test |
