import { useRef, useEffect } from 'react'

const PaperclipIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M11.1 2.5c3.7 0 5.8 2.5 5.8 5.8 0 2.2-1.3 4.3-3.2 5.8l-5.7 4.8c-.8.7-2 .5-2.7-.3-.7-.8-.5-2 .3-2.7l5.7-4.8c1.3-1.1 2-2.5 2-3.8 0-1.8-1.2-3.3-3.2-3.3-1.5 0-2.7 1-3.3 2.3L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M18.5 2.5L4 10l14.5 7.5V13H11V7h7.5V2.5z" fill="currentColor"/>
  </svg>
)

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/>
  </svg>
)

const RemoveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

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

  return (
    <div className="border-t border-gray-800 bg-black px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {imageUrl && (
          <div className="mb-2 relative inline-block">
            <img src={imageUrl} alt="preview" className="max-h-32 rounded-lg" />
            <button onClick={onRemoveImage} className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
              <RemoveIcon />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2.5 text-gray-400 hover:bg-gray-800 hover:text-white flex-shrink-0" title="Attach image">
            <PaperclipIcon />
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
          {streaming ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={loading}
              className="flex-shrink-0 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
