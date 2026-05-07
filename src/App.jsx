import { useState, useRef, useEffect, useCallback } from 'react'
import { PanelLeft, PanelLeftClose, Settings, Sparkles } from 'lucide-react'
import { chat, fetchModels, setApiBase } from './api/client'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { initDatabase, saveChat, saveMessages, getMessages } from './api/db'
import './index.css'

const DEFAULT_SERVER_URL = 'http://172.27.112.1:1234'

// Always-available model option. Selected automatically when LM Studio reports
// it loaded; otherwise still pickable so the request fails fast and tells the
// user to load it in LM Studio.
const HARDCODED_QWEN_MODEL = 'Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL'

const HARDCODED_QWEN_ENTRY = {
  id: HARDCODED_QWEN_MODEL,
  type: 'llm',
  publisher: 'unsloth',
  arch: 'qwen3',
  quantization: 'Q2_K_XL',
  state: 'not-loaded',
  capabilities: [],
  _manual: true,
}

const mergeWithHardcoded = (serverModels) => {
  if (serverModels.some((m) => m.id === HARDCODED_QWEN_MODEL)) return serverModels
  return [HARDCODED_QWEN_ENTRY, ...serverModels]
}

// Mirrors LM Studio's loaded model: prefer whichever chat model is currently
// loaded; otherwise fall back to any chat-capable model; otherwise the
// hardcoded Qwen entry.
const pickLoadedChatModel = (serverModels) =>
  serverModels.find((m) => m.state === 'loaded' && m.type !== 'embeddings')

const pickDefaultModel = (serverModels) => {
  const loaded = pickLoadedChatModel(serverModels)
  if (loaded) return loaded.id
  const firstChat = serverModels.find((m) => m.type !== 'embeddings')
  if (firstChat) return firstChat.id
  if (serverModels.length > 0) return serverModels[0].id
  return HARDCODED_QWEN_MODEL
}

const sameModelList = (a, b) =>
  a.length === b.length &&
  a.every((m, i) => m.id === b[i].id && m.state === b[i].state)

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL)
  const [connected, setConnected] = useState(false)
  const [models, setModels] = useState([HARDCODED_QWEN_ENTRY])
  const [selectedModel, setSelectedModel] = useState(HARDCODED_QWEN_MODEL)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(true)
  const [settingsMinimized, setSettingsMinimized] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatRefreshKey, setChatRefreshKey] = useState(0)

  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)
  const currentChatIdRef = useRef(null)
  const autoConnectedRef = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleConnect = async () => {
    setLoading(true)
    setError('')
    try {
      setApiBase(serverUrl)
      const modelList = await fetchModels()
      const merged = mergeWithHardcoded(modelList)
      setModels(merged)
      setSelectedModel(pickDefaultModel(modelList))
      setConnected(true)
    } catch (err) {
      setError(`Failed to connect: ${err.message}`)
      setConnected(false)
      setModels([HARDCODED_QWEN_ENTRY])
    } finally {
      setLoading(false)
    }
  }

  // Auto-connect on page load. Ref guard suppresses StrictMode's double mount
  // in dev so we don't fire two simultaneous /v1/models requests.
  useEffect(() => {
    if (autoConnectedRef.current) return
    autoConnectedRef.current = true
    handleConnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror LM Studio loaded state: poll /api/v0/models while connected and
  // visible. Auto-switches selection to whatever chat model is loaded.
  useEffect(() => {
    if (!connected) return
    let cancelled = false
    let inFlight = false

    const tick = async () => {
      if (cancelled || inFlight || document.hidden) return
      inFlight = true
      try {
        const list = await fetchModels()
        if (cancelled) return
        const merged = mergeWithHardcoded(list)
        setModels((prev) => (sameModelList(prev, merged) ? prev : merged))
        const loaded = pickLoadedChatModel(list)
        if (loaded) {
          setSelectedModel((cur) => (cur === loaded.id ? cur : loaded.id))
        }
      } catch {
        // Transient failure; next tick will retry.
      } finally {
        inFlight = false
      }
    }

    const interval = setInterval(tick, 5000)
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [connected])

  const persistMessages = async (chatId, msgs) => {
    try {
      await initDatabase()
      saveMessages(chatId, msgs)
    } catch (e) {
      console.error('Failed to persist messages:', e)
    }
  }

  const handleLoadChat = async (chatId) => {
    try {
      await initDatabase()
      const dbMessages = getMessages(chatId)
      currentChatIdRef.current = chatId
      setMessages(dbMessages.map((m) => ({
        role: m.role,
        content: m.content,
        image: m.image,
        reasoning: m.reasoning,
        streaming: false,
      })))
      setInput('')
      setImageUrl('')
    } catch (e) {
      console.error('Failed to load chat:', e)
    }
  }

  const handleNewChat = useCallback(() => {
    currentChatIdRef.current = null
    setMessages([])
    setInput('')
    setImageUrl('')
  }, [])

  const handleSend = async () => {
    if (!selectedModel || (!input.trim() && !imageUrl)) return

    const userMsg = { role: 'user', content: input.trim(), image: imageUrl || null }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setImageUrl('')
    setLoading(true)

    // Create chat ID if new
    if (!currentChatIdRef.current) {
      currentChatIdRef.current = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      saveChat(currentChatIdRef.current, input.trim().slice(0, 60))
      setChatRefreshKey((prev) => prev + 1)
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }])
    setStreaming(true)

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      const stream = chat(newHistory, selectedModel, signal)

      for await (const chunk of stream) {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: chunk.text, reasoning: chunk.reasoning }
          }
          return updated
        })
      }

      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, streaming: false }
        }
        return updated
      })
    } catch (err) {
      setError(err.message)
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.streaming) {
          updated[updated.length - 1] = { ...last, content: '⚠ ' + err.message, streaming: false }
        }
        return updated
      })
    } finally {
      setLoading(false)
      setStreaming(false)
      // Capture the latest messages via an updater so we don't race with
      // pending setMessages calls (covers normal completion, error, abort).
      setMessages((current) => {
        persistMessages(currentChatIdRef.current, current)
        return current
      })
      setChatRefreshKey((prev) => prev + 1)
    }
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
    setMessages((prev) => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.role === 'assistant' && last?.streaming) {
        updated[updated.length - 1] = { ...last, streaming: false }
      }
      return updated
    })
    setStreaming(false)
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageUrl(reader.result)
    reader.readAsDataURL(file)
  }

  const removeImage = () => setImageUrl('')

  const toggleSettings = () => {
    if (showSettings) {
      setShowSettings(false)
    } else {
      setShowSettings(true)
      setSettingsMinimized(false)
    }
  }

  return (
    <div className="flex h-screen bg-mango-bg">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        refreshKey={chatRefreshKey}
        onNewChat={handleNewChat}
        onLoadChat={handleLoadChat}
      />
      <div className="relative flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/5 bg-mango-bg/80 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="icon-btn"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeft size={18} strokeWidth={1.75} />}
            </button>
            <div className="brand-mark relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl">
              <Sparkles size={16} strokeWidth={2} className="relative z-10 text-white drop-shadow-sm" />
            </div>
            <h1 className="bg-gradient-to-r from-mango-300 to-amber-200 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
              Mango
            </h1>
            {connected && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Connected
              </span>
            )}
          </div>
          <button
            onClick={toggleSettings}
            className={`icon-btn ${showSettings ? 'is-on' : ''}`}
            title={showSettings ? 'Hide settings' : 'Show settings'}
            aria-label="Toggle settings"
          >
            <span className={`icon-spin ${showSettings ? 'is-active' : ''}`}>
              <Settings size={18} strokeWidth={1.75} />
            </span>
          </button>
        </header>

        <MessageList ref={messagesEndRef} messages={messages} />

        <ChatInput
          input={input}
          setInput={setInput}
          imageUrl={imageUrl}
          streaming={streaming}
          loading={loading}
          onSend={handleSend}
          onStop={handleStop}
          onImageUpload={handleImageUpload}
          onRemoveImage={removeImage}
        />

        {showSettings && (
          <SettingsPanel
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            loading={loading}
            error={error}
            connected={connected}
            models={models}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onConnect={handleConnect}
            minimized={settingsMinimized}
            onMinimize={() => setSettingsMinimized(!settingsMinimized)}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  )
}
