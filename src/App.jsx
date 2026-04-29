import { useState, useRef, useEffect } from 'react'
import { chat, fetchModels, setApiBase } from './api/client'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import './index.css'

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:13305')
  const [connected, setConnected] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)

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
      if (modelList.length > 0) setSelectedModel(modelList[0])
      setConnected(true)
    } catch (err) {
      setError(`Failed to connect: ${err.message}`)
      setConnected(false)
      setModels([])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!selectedModel || (!input.trim() && !imageUrl)) return

    const userMsg = { role: 'user', content: input.trim(), image: imageUrl || null }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setImageUrl('')
    setLoading(true)

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
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-800 bg-black px-4 py-3">
        <div className="flex items-center gap-3">
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
  )
}
