import { useState, useRef, useEffect, useCallback } from 'react'
import { chat, fetchModels, setApiBase } from './api/client'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { initDatabase, saveChat, saveMessage, getMessages } from './api/db'
import './index.css'

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:13305')
  const [connected, setConnected] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('user.Qwen3.6-35B-A3B-GGUF-UD-Q2_K_XL')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatRefreshKey, setChatRefreshKey] = useState(0)

  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)
  const currentChatIdRef = useRef(null)
  const messagesRef = useRef([])
  messagesRef.current = messages

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleConnect = async () => {
    setLoading(true)
    setError('')
    try {
      setApiBase(serverUrl)
      const modelList = await fetchModels()
      setModels(modelList)
      if (modelList.length > 0) {
        const qwenModel = modelList.find((m) => m.includes('Qwen3.6'))
        setSelectedModel(qwenModel || modelList[0])
      }
      setConnected(true)
    } catch (err) {
      setError(`Failed to connect: ${err.message}`)
      setConnected(false)
      setModels([])
    } finally {
      setLoading(false)
    }
  }

  // Auto-connect on page load
  useEffect(() => {
    handleConnect()
  }, [])

  const persistMessages = async (chatId, msgs) => {
    try {
      await initDatabase()
      for (const msg of msgs) {
        saveMessage(chatId, msg.role, msg.content, msg.image || null, msg.reasoning || null)
      }
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
          updated[updated.length - 1] = { ...last, content: '⚠️ ' + err.message, streaming: false }
        }
        return updated
      })
    } finally {
      setLoading(false)
      setStreaming(false)
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
    // Persist to SQLite when user stops streaming
    persistMessages(currentChatIdRef.current, messagesRef.current)
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

  return (
    <div className="flex h-screen">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        refreshKey={chatRefreshKey}
        onNewChat={handleNewChat}
        onLoadChat={handleLoadChat}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-800 bg-black px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? '☰' : '☰'}
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 text-sm font-bold text-white">
              C
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
            {connected && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Connected
              </span>
            )}
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            {showSettings ? '✕' : '⚙️'}
          </button>
        </header>

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
          />
        )}

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
      </div>
    </div>
  )
}
