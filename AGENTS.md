# Agent Guidelines — chat-app

## Rules
- **Always keep this file up to date.** Every time you modify code, configs, or architecture, update the relevant section below. Outdated docs cause mistakes.
- Follow the file structure described below. New files go in `src/` under `api/` or `components/`.
- Use JSX consistently. No new `.ts` files unless explicitly requested.
- Run `npx vite build` to verify before confirming changes work.
- The Vite dev server proxies `/v1/**` to the LLM backend — don't add CORS handling in the frontend.
- **Never push to git on your own accord.** Always ask the user first before running `git push`. You may commit changes without asking, but pushing requires explicit approval.

## Architecture

- **`src/App.jsx`** — Main app component, manages all state and orchestration
- **`src/api/client.js`** — API client (`fetchModels`, `chat` async generator, `setApiBase`)
- **`src/components/MessageList.jsx`** — Message rendering, auto-scroll (forwardRef), animated reasoning verb (mexican wave + dot cycle), hidden after streaming ends
- **`src/components/ChatInput.jsx`** — Textarea with auto-expand, image upload, send button
- **`src/components/Sidebar.jsx`** — Left sidebar with chat history list, search, new chat button, collapsible (toggle via ◀ handle)
- **`src/components/SettingsPanel.jsx`** — Server URL input, model selector, connection status
- **`src/api/db.js`** — SQLite database layer using sql.js (browser-based SQLite), IndexedDB persistence, idempotent saveMessages (DELETE-then-INSERT)
- **`vite.config.js`** — Vite dev server with `/v1` proxy to `localhost:13305`
- **`tailwind.config.js`** — Tailwind CSS config
- **`dev.sh`** — Dev runner script (installs deps if missing, runs `npm run dev`)
- **`scripts/`** — CLI test scripts: `check.sh`, `test-api.sh`, `test-stream.js`, `test-image.js`

## Tech Stack

- React 19 + Vite 8
- Tailwind CSS 3
- OpenAI-compatible LLM backend (Ollama, llama.cpp/lemond, vLLM, etc.)
- Vite dev proxy for CORS-free API calls

## State Management

- All state lives in `App.jsx` — server URL, connection status, model list, messages, input, image URL, loading/error/streaming flags
- Messages are `{ role, content, image?, streaming?, reasoning? }`
- Streaming flag toggled on before the generator starts, off after completion or error
- Error messages appear as red text in SettingsPanel

## Common Patterns

- **Persistence**: `saveMessages(chatId, msgs)` deletes existing msgs then inserts fresh set — idempotent, no duplicates. Called in `finally` block of `handleSend` to cover normal completion, errors, and aborts.
- **Streaming**: `for await (const chunk of chat(history, model))` — accumulates text and reasoning separately
- **Image upload**: FileReader reads as data URL (`data:image/...;base64,...`), sent as `image_url` object in API
- **API format flexibility**: `fetchModels()` handles both `{models:[]}` and `{data:[]}` response formats
- **Reasoning content**: collected from `delta.reasoning_content`, stored separately, shown in collapsible `<details>` block

## Testing

```bash
cd chat-app

# Check if server is reachable + list models
bash scripts/check.sh

# Test streaming with a message
node scripts/test-stream.js "user.Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL" "Explain quantum entanglement in 3 sentences"

# Test non-streaming chat
bash scripts/test-api.sh

# Test image upload
node scripts/test-image.js "user.Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL" "Describe this" ./test.png

# Or use npm scripts
npm run check
npm run test:stream
npm run test:api
```

## Recent Changes

- Animated reasoning verbs — each letter bounces in a staggered "mexican wave" pattern, dots cycle through `.`, `..`, `...`. Verb disappears entirely once streaming ends.
- Fixed message persistence — now persists all messages (user + assistant) on every send, covering: normal completion, errors, and stop/abort. Uses idempotent `saveMessages()` (DELETE-then-INSERT) to prevent duplicates.
- Fixed sidebar loading stuck — added try/catch/finally around `initDatabase()` so loading state always clears.
- WASM fetch has 10s timeout to prevent infinite loading on network failure.

---

## Recent Changes

- React 19 (updated from React 18)
- Split App.jsx into 3 component files + 1 API module (reduced App.jsx from ~300 lines)
- Made `chat()` a proper async generator to fix `yield` syntax error
- Added `setApiBase()` so the API client respects the user's configured server URL
- Fixed double-fetch bug in SettingsPanel
- Added `reasoning_content` handling — API returns reasoning before content, now collected separately
- Added `data` format support in `fetchModels()` for APIs that use `{data:[]}` instead of `{models:[]}`
- Added CLI test scripts: `check.sh`, `test-stream.js`, `test-image.js`, `test-api.sh`
- Added collapsible reasoning display in UI (💭 Reasoning section)
- Added markdown rendering for assistant messages using `react-markdown` + `remark-gfm` (supports GFM: code blocks, tables, lists, bold/italic, etc.)
- Added dark-themed markdown CSS (code blocks with bg, tables with borders, blockquotes with accent border)
- Fixed: API returns `data` not `models` at top level
- Replaced generic Vite template README with project-specific documentation
- Added `dev.sh` convenience script with auto-install
- Custom scrollbar styling for message list

## Log Locations

- **Vite dev server**: stdout only (startup info). To capture, run: `npm run dev > /tmp/vite-logs.log 2>&1 &`
- **LLM backend (lemond)**: `/run/user/1000/lemonade/lemonade-server.log` — request logs, token counts, timing, performance metrics
