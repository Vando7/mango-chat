import { useState, useEffect } from 'react'
import { initDatabase, getChats, deleteChat } from '../api/db'

export const Sidebar = ({ open, onToggle, refreshKey, onNewChat, onLoadChat }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadChats = async () => {
      setLoading(true)
      await initDatabase()
      const chats = getChats()
      setChatHistory(chats)
      setLoading(false)
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
    <aside className="relative flex h-full w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900/50">
      {/* Collapse handle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 hover:text-white"
        title="Collapse sidebar"
      >
        ◀
      </button>

      {/* Sidebar header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-200">Chats</h2>
        <button
          onClick={onNewChat}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          title="New chat"
        >
          ＋
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
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
