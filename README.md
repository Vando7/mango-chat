<div align="center">

<img src="public/favicon.svg" width="96" alt="Mango Chat logo" />

# Mango Chat

**A sleek, local-first chat UI for OpenAI-compatible LLM backends.**

Streams from LM Studio, Ollama, llama.cpp, vLLM — anywhere with a `/v1/chat/completions` endpoint.

<br />

[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Vite 8](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind 3](https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Lucide](https://img.shields.io/badge/Lucide-icons-f97316?style=flat-square&logoColor=white)](https://lucide.dev)
[![LM Studio](https://img.shields.io/badge/LM_Studio-ready-fb923c?style=flat-square)](https://lmstudio.ai)

</div>

---

## Highlights

<table>
<tr>
<td width="50%" valign="top">

### Built for local LLMs
- **Auto-follow loaded model** &mdash; the selected model mirrors whatever LM Studio currently has loaded, refreshed live every 5&thinsp;s.
- **Rich model cards** &mdash; type, publisher, arch, quantization, context length, capability chips, real-time loaded-state pulse.
- **Streaming responses** &mdash; token-by-token rendering with separate `reasoning_content` channel and an animated thinking indicator.
- **Multimodal** &mdash; drag-in or attach images for vision-capable models (VLM badge).

</td>
<td width="50%" valign="top">

### Designed to feel good
- **Mango palette** &mdash; warm orange&nbsp;→&nbsp;amber gradients on a near-black neutral.
- **Floating settings window** &mdash; glassy, top-right, minimize-to-pill, stays open while you chat.
- **Lucide icons everywhere** &mdash; consistent stroke weight, micro-animations on hover and click.
- **Persistent history** &mdash; SQLite (`sql.js`) over IndexedDB, searchable sidebar, idempotent saves.
- **`prefers-reduced-motion`** respected throughout.

</td>
</tr>
</table>

## Quick Start

```bash
git clone https://github.com/Vando7/mango-chat.git
cd mango-chat
npm install
npm run dev
```

Open <http://localhost:5173>. The app auto-connects to LM Studio at `http://172.27.112.1:1234`. Change the URL in the floating settings window (top-right gear icon) to point at any other OpenAI-compatible server.

> **Heads up:** the dev server binds to all interfaces (`server.host: true` in `vite.config.js`), so it's reachable from any host on the same network &mdash; handy for testing the WSL/Hyper-V LM Studio setup.

## Backend support

Mango Chat works with any **OpenAI-compatible** server. The model picker is richer when the backend exposes LM Studio's `/api/v0/models` extension; otherwise it falls back to plain `/v1/models` with id-only cards.

| Backend                                | Streaming | Models endpoint    | Rich cards |
| -------------------------------------- | :-------: | ------------------ | :--------: |
| **LM&nbsp;Studio**                     |    yes    | `/api/v0/models`   |    yes     |
| Ollama                                 |    yes    | `/v1/models`       |  id only   |
| llama.cpp&nbsp;/&nbsp;lemonade         |    yes    | `/v1/models`       |  id only   |
| vLLM                                   |    yes    | `/v1/models`       |  id only   |

## Architecture

```
src/
├── App.jsx                   Main component · state · 5s polling · orchestration
├── index.css                 Tailwind layers · mango tokens · animations
├── api/
│   ├── client.js             fetchModels (v0→v1 fallback) · chat (SSE generator)
│   └── db.js                 sql.js · IndexedDB · idempotent saveMessages
└── components/
    ├── MessageList.jsx       Bubbles · auto-scroll · animated reasoning verb
    ├── ChatInput.jsx         Pill composer · image upload · gradient send
    ├── Sidebar.jsx           Chat history · search · delete · collapse handle
    └── SettingsPanel.jsx     Floating window · model card grid · filter
```

## Visual design

- **Palette** &mdash; orange&nbsp;→&nbsp;amber gradients on near-black neutrals. Tailwind tokens under `theme.extend.colors.mango.*` (`50…900`, plus `bg` / `panel`).
- **Iconography** &mdash; 100% [Lucide](https://lucide.dev). Default stroke `1.75`, 18&thinsp;px in chrome, 12–14&thinsp;px inline.
- **Animations** &mdash; `brand-shimmer`, `empty-pulse`, `msg-fade-up`, `sb-slide`, `window-pop`, gear hover-rotate, paperclip rotate-on-hover, send button scale, animated 3-dot loaders, mango-tinted scrollbars. All wrapped in `@media (prefers-reduced-motion)`.
- **Reusable classes** &mdash; `.icon-btn`, `.icon-btn-sm`, `.icon-btn-accent`, `.brand-mark`, `.empty-glow`, `.composer`, `.icon-spin`, `.model-card`, `.settings-window`.

## Auto-follow loaded model

While the connection is live, `App.jsx` polls `/api/v0/models` every 5 seconds:

1. **Pauses** when the tab is hidden (Page Visibility API), resumes immediately on focus.
2. **Skips** ticks if the previous request is still in flight.
3. **Diffs** before re-rendering &mdash; identical responses do not retrigger React.
4. **Switches selection** to whatever non-embeddings model has `state: "loaded"`. Swap models inside LM Studio and the UI follows within ~5&thinsp;s, no clicks needed.

## Scripts

| Script              | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server with `/v1` proxy + HMR       |
| `npm run build`     | Production build to `dist/`                  |
| `npm run preview`   | Preview the production build                 |
| `npm run lint`      | ESLint (split config: `src/` vs `scripts/`)  |
| `npm run check`     | `bash scripts/check.sh` &mdash; ping server + list models |
| `npm run test:api`  | Non-streaming chat smoke test                |
| `npm run test:stream` | Streaming chat smoke test (`node`)         |
| `npm run test:image`  | Image-upload smoke test (`node`)           |

All test scripts default to LM Studio at `http://172.27.112.1:1234`. Override with the first arg (shell scripts) or the `LLM_URL` env var (node scripts).

## Configuration

| Where                | What                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| `vite.config.js`     | Dev proxy `/v1 → LM Studio`, `server.host: true`                               |
| `tailwind.config.js` | `mango.*` palette tokens, custom keyframes (`cursor-blink`, `fade-up`, `fade-in`) |
| `eslint.config.js`   | Browser globals for `src/`, Node globals for `scripts/`                        |

## Tech stack

- **React 19** + **Vite 8** with HMR
- **Tailwind CSS 3** with a custom `mango` palette
- **Lucide React** for all icons (tree-shakable)
- **react-markdown** + **remark-gfm** for assistant message rendering
- **sql.js** (SQLite WASM) + **IndexedDB** for persistent chat history
- Any **OpenAI-compatible** LLM backend

## Acknowledgements

- [LM Studio](https://lmstudio.ai) &mdash; for the rich `/api/v0/models` endpoint that makes the model cards possible.
- [Lucide](https://lucide.dev) &mdash; for an icon library that actually feels modern.
- The React, Vite, and Tailwind teams.

---

<div align="center">
<sub>Built locally · powered by your own GPU · no telemetry, no cloud round-trips</sub>
</div>
