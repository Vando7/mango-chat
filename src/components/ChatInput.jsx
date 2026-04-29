import { useRef, useEffect } from 'react'

export const ChatInput = ({ input, setInput, imageUrl, streaming, loading, onSend, onImageUpload, onRemoveImage }) => {
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="border-t border-gray-800 bg-black px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {imageUrl && (
          <div className="mb-2 relative inline-block">
            <img src={imageUrl} alt="preview" className="max-h-32 rounded-lg" />
            <button onClick={onRemoveImage} className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs hover:bg-red-600">
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2.5 text-gray-400 hover:bg-gray-800 hover:text-white flex-shrink-0" title="Attach image">
            📎
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={onSend}
            disabled={loading || streaming}
            className="flex-shrink-0 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {streaming ? '⏳' : '➤'}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
          <span>Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  )
}
