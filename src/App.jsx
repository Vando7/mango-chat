import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { PanelLeft, PanelLeftClose, Settings, Sparkles } from 'lucide-react'
import { chat, fetchModels, setApiBase } from './api/client'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import {
  initDatabase,
  saveChat,
  appendMessage,
  addNewVersion,
  updateMessageVersion,
  setActiveVersion,
  deleteFromPosition,
  getMessageVersions,
} from './api/db'
import './index.css'

const DEFAULT_SERVER_URL = 'http://172.27.112.1:1234'

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

// Empty conversation shape used by useState initializer and reset logic.
const EMPTY_CONVO = { versions: [], active: [] }

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL)
  const [connected, setConnected] = useState(false)
  const [models, setModels] = useState([HARDCODED_QWEN_ENTRY])
  const [selectedModel, setSelectedModel] = useState(HARDCODED_QWEN_MODEL)
  // versions[pos] = [{role,content,image,reasoning,streaming?}, ...]
  // active[pos]   = currently-selected version index for that position
  const [convo, setConvo] = useState(EMPTY_CONVO)
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

  // Derive the displayed message list (active path) from convo.
  const activeMessages = useMemo(
    () => convo.versions.map((vs, p) => {
      const v = vs[convo.active[p]]
      return {
        ...v,
        position: p,
        version: convo.active[p],
        totalVersions: vs.length,
      }
    }),
    [convo]
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

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

  useEffect(() => {
    if (autoConnectedRef.current) return
    autoConnectedRef.current = true
    handleConnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const handleLoadChat = async (chatId) => {
    try {
      await initDatabase()
      const { versions, active } = getMessageVersions(chatId)
      currentChatIdRef.current = chatId
      // Strip any lingering streaming flag from rehydrated rows.
      const cleanVersions = versions.map((vs) =>
        vs.map((v) => ({ ...v, streaming: false }))
      )
      setConvo({ versions: cleanVersions, active })
      setInput('')
      setImageUrl('')
    } catch (e) {
      console.error('Failed to load chat:', e)
    }
  }

  const handleNewChat = useCallback(() => {
    currentChatIdRef.current = null
    setConvo(EMPTY_CONVO)
    setInput('')
    setImageUrl('')
  }, [])

  const runStream = async (history, chatId, position, version) => {
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    setStreaming(true)
    setLoading(true)

    let lastText = ''
    let lastReasoning = ''

    try {
      const stream = chat(history, selectedModel, signal)
      for await (const chunk of stream) {
        lastText = chunk.text
        lastReasoning = chunk.reasoning
        setConvo((c) => {
          const versions = c.versions.map((vs, p) => {
            if (p !== position) return vs
            const next = vs.slice()
            next[version] = { ...next[version], content: chunk.text, reasoning: chunk.reasoning }
            return next
          })
          return { ...c, versions }
        })
      }
      setConvo((c) => {
        const versions = c.versions.map((vs, p) => {
          if (p !== position) return vs
          const next = vs.slice()
          next[version] = { ...next[version], streaming: false }
          return next
        })
        return { ...c, versions }
      })
    } catch (err) {
      setError(err.message)
      setConvo((c) => {
        const versions = c.versions.map((vs, p) => {
          if (p !== position) return vs
          const next = vs.slice()
          const cur = next[version]
          if (cur?.streaming) {
            next[version] = {
              ...cur,
              content: cur.content || ('⚠ ' + err.message),
              streaming: false,
            }
            lastText = next[version].content
          }
          return next
        })
        return { ...c, versions }
      })
    } finally {
      setLoading(false)
      setStreaming(false)
      try {
        await initDatabase()
        updateMessageVersion(chatId, position, version, lastText, lastReasoning)
      } catch (e) {
        console.error('Failed to persist message version:', e)
      }
      setChatRefreshKey((prev) => prev + 1)
    }
  }

  const handleSend = async () => {
    if (!selectedModel || (!input.trim() && !imageUrl)) return
    if (streaming) return

    const userContent = input.trim()
    const userImage = imageUrl || null
    const userMsg = { role: 'user', content: userContent, image: userImage, reasoning: null }
    const assistantMsg = { role: 'assistant', content: '', image: null, reasoning: null, streaming: true }

    // Create chat row if this is the first message.
    let chatId = currentChatIdRef.current
    const isNewChat = !chatId
    if (isNewChat) {
      chatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      currentChatIdRef.current = chatId
    }

    let assistantPos
    try {
      await initDatabase()
      if (isNewChat) {
        saveChat(chatId, userContent.slice(0, 60) || 'New chat')
      }
      appendMessage(chatId, 'user', userContent, userImage, null)
      ;({ position: assistantPos } = appendMessage(chatId, 'assistant', '', null, null))
    } catch (e) {
      console.error('Failed to persist initial messages:', e)
      setError('Failed to save message: ' + e.message)
      return
    }

    // Build history to send: existing active path + the user msg we just
    // appended. The empty/streaming assistant slot is not included.
    const historyToSend = [
      ...convo.versions.map((vs, p) => {
        const v = vs[convo.active[p]]
        return { role: v.role, content: v.content, image: v.image }
      }),
      { role: userMsg.role, content: userMsg.content, image: userMsg.image },
    ]

    setConvo((c) => ({
      versions: [...c.versions, [userMsg], [assistantMsg]],
      active: [...c.active, 0, 0],
    }))
    setInput('')
    setImageUrl('')
    setChatRefreshKey((prev) => prev + 1)

    await runStream(historyToSend, chatId, assistantPos, 0)
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
    setConvo((c) => {
      const versions = c.versions.map((vs) => {
        const idx = vs.findIndex((v) => v?.streaming)
        if (idx === -1) return vs
        const next = vs.slice()
        next[idx] = { ...next[idx], streaming: false }
        return next
      })
      return { ...c, versions }
    })
    setStreaming(false)
  }

  const handleRegenerate = async (position) => {
    if (streaming) return
    const chatId = currentChatIdRef.current
    if (!chatId) return
    // Only the latest position should be regenerable, and only if it's an
    // assistant slot. Guard here defensively.
    if (position !== convo.versions.length - 1) return
    const slot = convo.versions[position]
    if (!slot || slot[0]?.role !== 'assistant') return

    let newVersionIdx
    try {
      await initDatabase()
      ;({ version: newVersionIdx } = addNewVersion(chatId, position, 'assistant', '', null, null))
    } catch (e) {
      console.error('Failed to add new version:', e)
      setError('Failed to regenerate: ' + e.message)
      return
    }

    const newAssistant = { role: 'assistant', content: '', image: null, reasoning: null, streaming: true }
    setConvo((c) => {
      const versions = c.versions.map((vs, p) => {
        if (p !== position) return vs
        const next = vs.slice()
        next[newVersionIdx] = newAssistant
        return next
      })
      const active = c.active.slice()
      active[position] = newVersionIdx
      return { versions, active }
    })

    // History: active path up to (but not including) this position.
    const historyToSend = []
    for (let p = 0; p < position; p++) {
      const v = convo.versions[p][convo.active[p]]
      historyToSend.push({ role: v.role, content: v.content, image: v.image })
    }

    await runStream(historyToSend, chatId, position, newVersionIdx)
  }

  const handleSwitchVersion = async (position, newVersionIdx) => {
    if (streaming) return
    const slot = convo.versions[position]
    if (!slot || newVersionIdx < 0 || newVersionIdx >= slot.length) return
    setConvo((c) => {
      const active = c.active.slice()
      active[position] = newVersionIdx
      return { ...c, active }
    })
    const chatId = currentChatIdRef.current
    if (!chatId) return
    try {
      await initDatabase()
      setActiveVersion(chatId, position, newVersionIdx)
    } catch (e) {
      console.error('Failed to switch version:', e)
    }
  }

  const handleDeleteMessage = async (position) => {
    if (streaming) return
    setConvo((c) => ({
      versions: c.versions.slice(0, position),
      active: c.active.slice(0, position),
    }))
    const chatId = currentChatIdRef.current
    if (!chatId) return
    try {
      await initDatabase()
      deleteFromPosition(chatId, position)
    } catch (e) {
      console.error('Failed to delete message:', e)
    }
    setChatRefreshKey((prev) => prev + 1)
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

        <MessageList
          ref={messagesEndRef}
          messages={activeMessages}
          streaming={streaming}
          onRegenerate={handleRegenerate}
          onSwitchVersion={handleSwitchVersion}
          onDeleteMessage={handleDeleteMessage}
        />

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
