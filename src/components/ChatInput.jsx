import { useRef, useEffect } from 'react'
import { Paperclip, ArrowUp, Square, X } from 'lucide-react'

export const ChatInput = ({ input, setInput, imageUrl, streaming, loading, onSend, onStop, onImageUpload, onRemoveImage }) => {
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

  const canSend = !loading && (input.trim() || imageUrl)

  return (
    <div className="border-t border-white/5 bg-mango-bg/80 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        {imageUrl && (
          <div className="relative mb-2 inline-block">
            <img src={imageUrl} alt="preview" className="max-h-32 rounded-lg border border-white/10" />
            <button
              onClick={onRemoveImage}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-all hover:scale-110 hover:bg-red-600"
              aria-label="Remove image"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          </div>
        )}
        <div className="composer flex items-end gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 transition-all focus-within:border-mango-400/40 focus-within:bg-white/[0.05] focus-within:ring-2 focus-within:ring-mango-400/15">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="icon-btn group flex-shrink-0"
            title="Attach image"
            aria-label="Attach image"
          >
            <Paperclip
              size={18}
              strokeWidth={1.75}
              className="transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-110"
            />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          {streaming ? (
            <button
              onClick={onStop}
              className="send-btn flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/90 text-white shadow-md transition-all hover:scale-105 hover:bg-red-500 active:scale-95"
              title="Stop"
              aria-label="Stop generating"
            >
              <Square size={14} strokeWidth={2.5} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className={`send-btn flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                canSend
                  ? 'bg-gradient-to-br from-mango-400 to-amber-500 text-white shadow-md shadow-mango-500/30 hover:scale-105 hover:shadow-lg hover:shadow-mango-500/40 active:scale-95'
                  : 'cursor-not-allowed bg-white/[0.06] text-gray-600'
              }`}
              title="Send"
              aria-label="Send message"
            >
              <ArrowUp size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
