import { useState, useEffect } from 'react'
import { initDatabase, getChats, deleteChat } from '../api/db'

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 4h10M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M4 4v7a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 7v3M8 7v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

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
    <aside className="relative flex h-full w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-950">
      {/* Collapse handle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-700 bg-gray-950 text-gray-400 hover:text-white"
        title="Collapse sidebar"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M6 2L3 5L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-200">History</h2>
        <button
          onClick={onNewChat}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          title="New chat"
        >
          <PlusIcon />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading...</div>
        ) : filteredChats.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No chats found</div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className="group relative flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 hover:bg-gray-800"
            >
              <div className="flex-1 min-w-0" onClick={() => handleSelectChat(chat.id)}>
                <div className="truncate text-sm text-gray-200 group-hover:text-white">
                  {chat.title}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">{formatDate(chat.updated_at)}</span>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, chat.id)}
                className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-500 opacity-0 hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                title="Delete chat"
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
