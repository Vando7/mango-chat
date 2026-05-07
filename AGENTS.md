# Agent Guidelines — chat-app

## Rules
- **Always keep this file up to date.** Every time you modify code, configs, or architecture, update the relevant section below. Outdated docs cause mistakes.
- Follow the file structure described below. New files go in `src/` under `api/` or `components/`.
- Use JSX consistently. No new `.ts` files unless explicitly requested.
- Run `npx vite build` to verify before confirming changes work.
- The Vite dev server proxies `/v1/**` to the LLM backend — don't add CORS handling in the frontend.
- **Never push to git on your own accord.** Always ask the user first before running `git push`. You may commit changes without asking, but pushing requires explicit approval.

## Architecture

- **`src/App.jsx`** — Main app component, manages all state and orchestration. Lucide icons (`PanelLeft`/`PanelLeftClose`/`Settings`/`X`/`Sparkles`), gradient brand mark, glassy backdrop-blur header.
- **`src/api/client.js`** — API client. `fetchModels` tries LM Studio's `/api/v0/models` first (rich metadata: `type`, `publisher`, `arch`, `quantization`, `state`, `maxContext`, `loadedContext`, `capabilities`); falls back to OpenAI `/v1/models` returning `{id}` objects only. `chat` async generator, `setApiBase`. Always returns *objects*, never bare strings — callers must read `m.id` for the model name to send.
- **`src/components/MessageList.jsx`** — Message rendering, auto-scroll (forwardRef), animated reasoning verb (mexican wave + dot cycle), hidden after streaming ends. Empty state uses Lucide `MessagesSquare` with mango glow; assistant avatar uses gradient `Sparkles`. Assistant messages show the model id as a small gray label above the bubble. The bubble itself renders all `images[]` as a `flex-wrap` row of thumbnails. Per-message action row (`MessageActions` subcomponent) appears under each bubble on hover: `< n/N >` version arrows when `totalVersions > 1`, `Regenerate` button on the latest assistant message only (hidden while streaming), and a `Trash2` delete button that removes the message *and everything after it*. Uses `key={position-version}` so React reconciles cleanly when the active version of a slot changes.
- **`src/components/ChatInput.jsx`** — Pill-style composer (focus-glow + ring), Lucide icons (`Paperclip`/`ArrowUp`/`Square`/`X`), gradient send button, attach hover-rotate animation. Multi-image support: file input has `multiple`, attachments render as a thumbnail strip above the composer (each with its own remove button), and the textarea has an `onPaste` handler so `Ctrl+V` of a clipboard image (or multiple images) appends them to the queue. `imageUrls: string[]` is the canonical prop; `onPasteImages`/`onRemoveImageAt(i)` are the callbacks.
- **`src/components/Sidebar.jsx`** — Left sidebar with chat history, search-with-icon, `MessageSquarePlus` new-chat, `Trash2` delete, `ChevronLeft` collapse handle. All Lucide icons.
- **`src/components/SettingsPanel.jsx`** — Floating settings *window* anchored top-right (absolute, z-30) of the chat pane. Header with minimize/close, glassy backdrop-blur, mango-gradient header tint. Body contains: server URL row (with `Server` icon + reconnect button) and a **model card grid**. Each `ModelCard` shows type badge (LLM/VLM/EMB), loaded-state pulse dot, quantization, publisher · arch, max-context (formatted K/M), `tools` capability chip, "manual" tag for the hardcoded fallback. Embeddings are rendered as disabled. Includes a filter input over the grid. Selected card has a check badge + mango ring.
- **`src/api/db.js`** — SQLite database layer using sql.js (browser-based SQLite), IndexedDB persistence. Schema versioned via `PRAGMA user_version` with const `SCHEMA_VERSION` — when bumped, all tables are dropped and recreated on next init (no migration; chat history is disposable). Messages are stored as `(position, version, is_active)` rows so each conversation slot can have multiple regenerated drafts. Each row also stores the `model` id that produced it (rendered above assistant bubbles) and an `images` column holding a JSON-encoded array of data URLs for multi-image attachments (`encodeImages`/`decodeImages` helpers wrap the JSON dance). Helpers: `appendMessage` (new slot at next position, version 0, active), `addNewVersion` (new draft at existing slot, marked active, others deactivated), `updateMessageVersion` (write streamed content), `setActiveVersion` (flip arrows), `deleteFromPosition` (remove slot + tail), `getMessageVersions` (returns `{versions[pos][ver], active[pos]}`).
- **`vite.config.js`** — Vite dev server with `/v1` proxy to LM Studio (`http://172.27.112.1:1234`)
- **`tailwind.config.js`** — Tailwind CSS config; defines `mango.{50..900,bg,panel}` color tokens and animations (`cursor-blink`, `fade-up`, `fade-in`).
- **`public/favicon.svg`** — Mango-gradient rounded-square chat-bubble mark.
- **`dev.sh`** — Dev runner script (installs deps if missing, runs `npm run dev`)
- **`scripts/`** — CLI test scripts: `check.sh`, `test-api.sh`, `test-stream.js`, `test-image.js`

## Tech Stack

- React 19 + Vite 8
- Tailwind CSS 3 (with custom `mango` palette in `tailwind.config.js`)
- [Lucide React](https://lucide.dev) for all UI icons — sleek modern stroke icons, tree-shakable
- `react-markdown` + `remark-gfm` for assistant message rendering
- `sql.js` (SQLite WASM) + IndexedDB for chat persistence
- OpenAI-compatible LLM backend (default: LM Studio at `http://172.27.112.1:1234`; also works with Ollama, llama.cpp/lemonade, vLLM, etc.)
- Vite dev proxy for CORS-free API calls
- LM Studio's `/api/v1/models/{load,unload}` exists if model management is ever needed (currently unused — UI is read-only)

## Visual design

- **Palette**: warm "mango" — orange→amber gradients (`mango-400 → amber-500`) on a near-black `mango-bg`/`mango-panel` neutral. Tailwind tokens defined in `tailwind.config.js` under `colors.mango.*`.
- **Iconography**: 100% Lucide icons (`lucide-react`). Default `strokeWidth` 1.75 for UI chrome, 2–2.5 for emphasis (avatar, send). Standard size 18 for buttons, 12–14 for inline accents.
- **Animations** (in `src/index.css`): `brand-shimmer` (logo), `empty-pulse` (empty-state glow), `msg-fade-up` (message enter), `sb-slide` (sidebar enter), composer focus-glow, gear hover-rotate + 90°-on-active, paperclip rotate-on-hover, send button scale-on-hover/active, animated 3-dot loading. All wrapped by `prefers-reduced-motion` guard.
- **Reusable classes**: `.icon-btn` (square 9×9 hover-tinted button), `.brand-mark` (gradient pill behind logo/avatar), `.empty-glow`, `.composer`, `.icon-spin`.

## Default backend & model picker

- `App.jsx` defaults `serverUrl` to `http://172.27.112.1:1234` (LM Studio) and auto-connects on mount.
- The model grid always includes a hardcoded `Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL` entry (constants `HARDCODED_QWEN_MODEL` + `HARDCODED_QWEN_ENTRY` in `App.jsx`, with `_manual: true` flag rendered as a "manual" tag in the card).
- **Auto-follow loaded model**: the selected model mirrors whatever LM Studio currently has loaded. While `connected`, App.jsx polls `fetchModels()` every 5s (paused on `document.hidden`, resumed on visibility), updates the cards' state, and auto-switches `selectedModel` to whichever chat (`type !== 'embeddings'`) model is in `state: 'loaded'`. Switching models in LM Studio while the app is open updates the selection within ~5s without user action.
- Helpers `mergeWithHardcoded`, `pickDefaultModel`, `pickLoadedChatModel`, `sameModelList` in `App.jsx` operate on rich model *objects* (`{id, type, state, ...}`). Keep `pickLoadedChatModel` and the polling effect in sync if changing what counts as "the loaded model."

## State Management

- All state lives in `App.jsx` — server URL, connection status, model list (rich objects), `selectedModel` (string id), `convo`, input, image URL, loading/error/streaming flags, `showSettings` (default `true`), `settingsMinimized`, `sidebarOpen`, `chatRefreshKey`.
- `convo = { versions, active }`: `versions[position]` is an array of drafts at that slot, each shaped `{ role, content, images: string[], reasoning?, model?, streaming? }`; `active[position]` is the version index currently displayed. The flat list rendered to `MessageList` is derived via `useMemo` as `versions.map((vs, p) => vs[active[p]])` plus `position`/`version`/`totalVersions` metadata. Each assistant version captures `selectedModel` at the moment it was generated so the displayed model name reflects what actually ran (useful when you regen the same prompt across different models).
- Streaming flag toggled on before the generator starts, off after completion or error. While streaming, `runStream` mutates `convo.versions[position][version].content` per chunk; persistence (`updateMessageVersion`) only fires once in the `finally` block.
- Error messages appear as red text inside the floating `SettingsPanel`.
- The `connected` state gates the auto-follow polling effect — set `true` after a successful `fetchModels`, reset on failure.

## Common Patterns

- **Persistence**: per-action — `appendMessage` on send (one row per user msg, one empty row per assistant slot), `addNewVersion` on regenerate, `updateMessageVersion` in `runStream`'s `finally` (covers normal completion, errors, aborts), `setActiveVersion` when the user clicks the version arrows, `deleteFromPosition` on the trash button. No global "rewrite all rows" call — each operation touches only the rows it needs.
- **Regenerate**: only the latest assistant slot is regenerable. `handleRegenerate(position)` calls `addNewVersion` to insert an empty draft, sets it active, builds the model history from the active path *up to but not including* `position`, then runs `runStream` into the new version index.
- **Version arrows / delete**: `handleSwitchVersion(position, idx)` updates `convo.active[position]` and persists via `setActiveVersion` — works on any slot, including frozen ones (it just changes what's displayed for that slot, not the rest of the conversation). `handleDeleteMessage(position)` truncates `convo.versions`/`active` to length `position` and calls `deleteFromPosition`. Both are no-ops while `streaming`.
- **Streaming**: `for await (const chunk of chat(history, model))` — accumulates text and reasoning separately
- **Image upload**: FileReader reads each file as a data URL (`data:image/...;base64,...`); images are stored as `string[]` per message, then `client.js` spreads each into a separate `{type: 'image_url', image_url: {url}}` content part for the OpenAI vision format. Paste-from-clipboard uses the same pipeline (`addImageFiles` is shared between file input + paste handler).
- **Models endpoint flexibility**: `fetchModels()` tries LM Studio's `/api/v0/models` first for rich metadata, falls back to plain OpenAI `/v1/models`. Both `{models:[]}` and `{data:[]}` shapes are accepted. Always returns objects (`{id, ...}`), never bare strings.
- **Reasoning content**: collected from `delta.reasoning_content`, accumulated separately from the main text. Shown live during streaming with the animated mexican-wave verb; collapses into a custom show/hide block (no `<details>`) once streaming ends.
- **Auto-follow polling**: `App.jsx` runs a 5s interval while `connected`, paused on `document.hidden`, with an `inFlight` guard. It diffs the model list via `sameModelList(prev, next)` to avoid spurious re-renders, and switches `selectedModel` to whichever chat model is in `state: 'loaded'`.

## Testing

All scripts default to LM Studio at `http://172.27.112.1:1234`. Override with the first arg (shell scripts) or `LLM_URL` env var (node scripts).

```bash
# Check if server is reachable + list models
bash scripts/check.sh

# Test streaming with a message
node scripts/test-stream.js "Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL" "Explain quantum entanglement in 3 sentences"

# Test non-streaming chat
bash scripts/test-api.sh

# Test image upload
node scripts/test-image.js "Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL" "Describe this" ./test.png

# Or use npm scripts
npm run check
npm run test:stream
npm run test:api
```

## Recent Changes

- **Per-message model label + multi-image attachments + paste-to-attach** (2026-05-07): Schema bumped to v4 — assistant rows now persist the `model` id used to generate them (rendered as a small gray label above the bubble), and the old single `image` column is replaced by an `images TEXT` column holding a JSON array of data URLs. The composer handles `Ctrl+V` of clipboard images (multiple at once) via an `onPaste` handler on the textarea, and the file input is `multiple`. Each image part is sent as its own `{type: 'image_url'}` entry in the OpenAI vision payload. Bumping the schema (any time fields change) just means incrementing `SCHEMA_VERSION` in `db.js` — old rows are wiped on next load.
- **Message versions + regenerate + delete** (2026-05-07): DB schema bumped to v2 (`PRAGMA user_version`) — old data is dropped on first load with the new code. Messages now store `(position, version, is_active)` so any slot can hold multiple drafts. `App.jsx` state moved from `messages` to `convo = {versions, active}`; the displayed list is derived via `useMemo`. Latest assistant message gets a Regenerate button (creates a new version, streams into it, marks active). Slots with `>1` versions show `< n/N >` arrows that flip the active version (persisted via `setActiveVersion`) — works on any slot, view-only in the sense that it doesn't touch later slots. Every message has a Delete button that wipes that slot and everything after via `deleteFromPosition`. All three buttons are no-ops while streaming. To bump the schema again, increment `SCHEMA_VERSION` in `db.js`.
- **Auto-follow LM Studio loaded model** (2026-05-07): App polls `fetchModels()` every 5s while `connected` (paused when tab hidden) and auto-switches `selectedModel` to whatever LM Studio reports as `state: 'loaded'`. Cards' green-pulse state stays live without manual reload. Dropped the Qwen-first preference in `pickDefaultModel` — loaded model wins.
- **Floating settings window + model cards** (2026-05-07): `SettingsPanel` is now a glassy top-right floating window with minimize-to-pill and close. Open by default. Server URL has its own row with a reconnect button (animated `RefreshCw`). Model picker rebuilt as a 1-col card grid with type/quantization/state/publisher/arch/context/capabilities pulled from LM Studio's `/api/v0/models`. Each card has check-badge selected state, hover lift+glow, embeddings disabled. Filter input above the grid. Plain `/v1/models` backends still work — cards just show id only.
- **Mango visual overhaul** (2026-05-07): full icon swap to `lucide-react`; warm orange→amber palette via `tailwind.config.js` `mango` tokens; new gradient brand mark + animated assistant avatar; pill-shape composer with focus-glow; Lucide-iconed search/server inputs; backdrop-blur header & settings panel; glow on empty state; message enter animation; reduced-motion respected. Title changed to "Mango Chat", favicon redrawn.
- Default backend switched to LM Studio at `http://172.27.112.1:1234` — applied to Vite proxy, `client.js` API_BASE, App `serverUrl`, and all CLI test scripts.
- Vite dev server binds to all interfaces (`server.host: true`) so the app is reachable from the Hyper-V host (e.g. `http://172.27.112.89:5173`).
- Hardcoded Qwen entry in model dropdown — `HARDCODED_QWEN_MODEL` constant, `mergeWithHardcoded`/`pickDefaultModel` helpers in `App.jsx`. Auto-selected when LM Studio reports it loaded; otherwise labeled `(manual)` in the picker via `manualFallbacks`.
- Fixed `getChats()` crash when chats table is empty (`db.exec` returns `[]`, was reading `rows[0].values` blindly).
- Fixed persistence race in `handleSend` finally — now reads latest messages via a `setMessages` updater instead of a render-lagged `messagesRef`.
- Wrapped `saveMessages` in a SQLite transaction so the DELETE-then-INSERT cycle is atomic.
- Fixed `loadFromIndexedDB` first-run NotFoundError — added `onupgradeneeded` so the object store exists before the readonly transaction opens.
- `initDatabase()` now caches the in-flight promise so concurrent callers (Sidebar + App on mount) share one initialization instead of racing the WASM fetch.
- Streaming generator only yields when text or reasoning actually grew — skips metadata-only deltas (role announcements, empty diffs) that previously triggered redundant React rerenders.
- Auto-connect guarded by `autoConnectedRef` so React 19 StrictMode's dev-mode double mount doesn't fire two `/v1/models` requests.
- Deleted dead Vite-template scaffolding: `src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`, `public/icons.svg`.
- All ESLint errors cleared: split config for `src/` (browser globals) vs `scripts/` (node globals), removed unused vars, added `cause` on rethrown errors, commented empty catch blocks.
- Animated reasoning verbs — each letter bounces in a staggered "mexican wave" pattern, dots cycle through `.`, `..`, `...`. Verb disappears entirely once streaming ends.
- Persists all messages (user + assistant) on every send, covering: normal completion, errors, and stop/abort. Uses idempotent `saveMessages()` (DELETE-then-INSERT) to prevent duplicates.
- Sidebar loading: try/catch/finally around `initDatabase()` so loading state always clears.
- WASM fetch has 10s timeout to prevent infinite loading on network failure.
- React 19; App.jsx split into 3 components + 1 API module (~275 lines).
- `chat()` is an async generator; `setApiBase()` respects user-configured URL.
- Reasoning content (`delta.reasoning_content`) collected separately and shown collapsibly.
- `fetchModels()` handles both `{models:[]}` and `{data:[]}` response shapes.
- Markdown rendering via `react-markdown` + `remark-gfm` for assistant messages, dark-themed.
- CLI test scripts: `check.sh`, `test-stream.js`, `test-image.js`, `test-api.sh` (LM Studio defaults; override URL via first arg or `LLM_URL` env).

## Log Locations

- **Vite dev server**: stdout only (startup info). To capture, run: `npm run dev > /tmp/vite-logs.log 2>&1 &`
- **LM Studio**: log location depends on install. UI shows server logs in the Local Server tab. Lemonade logs (if used) live at `/run/user/1000/lemonade/lemonade-server.log`.

## Git

- Per-repo identity is `Vanko <ipmihaylov7@gmail.com>` (set in `.git/config`, **not** global). Don't `git config --global` — leave the user's other repos alone.
- Remote is HTTPS (`https://github.com/Vando7/mango-chat.git`). Auth via `gh` CLI (`gh auth login`); credential storage configured by `gh`.
- **Never `git push` without explicit user approval** (see Rules above).
