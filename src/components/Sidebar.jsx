import { useState, useEffect } from 'react'
import { ChevronLeft, MessageSquarePlus, Search, Trash2 } from 'lucide-react'
import { initDatabase, getChats, deleteChat } from '../api/db'

export const Sidebar = ({ open, onToggle, refreshKey, onNewChat, onLoadChat }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadChats = async () => {
      setLoading(true)
      try {
        await initDatabase()
        const chats = getChats()
        setChatHistory(chats)
      } catch (e) {
        console.error('Failed to load chat history:', e)
        setChatHistory([])
      } finally {
        setLoading(false)
      }
    }
    loadChats()
  }, [refreshKey])

  const handleDelete = (e, chatId) => {
    e.stopPropagation()
    deleteChat(chatId)
    setChatHistory((prev) => prev.filter((c) => c.id !== chatId))
  }

  const handleSelectChat = (chatId) => {
    onLoadChat(chatId)
  }

  const filteredChats = chatHistory.filter((chat) =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return 'Today'
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (!open) return null

  return (
    <aside className="relative flex h-full w-64 flex-shrink-0 flex-col border-r border-white/5 bg-mango-panel sidebar-fade-in">
      {/* Collapse handle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-mango-panel text-gray-400 shadow-md transition-all hover:scale-110 hover:border-mango-400/40 hover:text-mango-300"
        title="Collapse sidebar"
        aria-label="Collapse sidebar"
      >
        <ChevronLeft size={12} strokeWidth={2} />
      </button>

      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">History</h2>
        <button
          onClick={onNewChat}
          className="icon-btn icon-btn-accent group"
          title="New chat"
          aria-label="New chat"
        >
          <MessageSquarePlus size={16} strokeWidth={1.75} className="transition-transform group-hover:scale-110 group-active:scale-95" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-lg border border-white/5 bg-white/[0.03] py-1.5 pl-8 pr-3 text-sm text-gray-200 placeholder-gray-500 transition-all focus:border-mango-400/50 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-mango-400/10"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto message-scroll px-2 py-1">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-mango-400 animate-pulse" style={{ animationDelay: '0s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-mango-400 animate-pulse" style={{ animationDelay: '0.15s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-mango-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
            </span>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No chats yet</div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className="group relative mb-0.5 flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
            >
              <div className="min-w-0 flex-1" onClick={() => handleSelectChat(chat.id)}>
                <div className="truncate text-sm text-gray-300 transition-colors group-hover:text-white">
                  {chat.title}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">{formatDate(chat.updated_at)}</div>
              </div>
              <button
                onClick={(e) => handleDelete(e, chat.id)}
                className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                title="Delete chat"
                aria-label="Delete chat"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
