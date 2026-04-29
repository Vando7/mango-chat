import { forwardRef, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const REASONING_VERBS = [
  'Thinking',
  'Analyzing',
  'Planning',
  'Exploring',
  'Breaking down',
  'Mapping',
  'Structuring',
  'Processing',
  'Digging deeper',
  'Synthesizing',
  'Working through',
  'Connecting dots',
]

const MessageBubble = ({ role, content, reasoning, image, streaming }) => {
  const reasoningRef = useRef(null)
  const [reasoningVerb, setReasoningVerb] = useState(() =>
    REASONING_VERBS[Math.floor(Math.random() * REASONING_VERBS.length)]
  )
  const startedRef = useRef(false)

  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
    }
  }, [reasoning])

  // Start verb cycling once reasoning appears (runs once)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const interval = setInterval(() => {
      setReasoningVerb((prev) => {
        const next = REASONING_VERBS[Math.floor(Math.random() * REASONING_VERBS.length)]
        return next === prev ? REASONING_VERBS[(REASONING_VERBS.indexOf(prev) + 1) % REASONING_VERBS.length] : next
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex gap-3">
      {role === 'assistant' && (
        <div className="mt-1 h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-xs font-bold text-white">
          AI
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${role === 'user' ? 'bg-purple-600/80 text-white' : 'bg-gray-800 text-gray-200'}`}>
        {image && <img src={image} alt="uploaded" className="mb-2 max-h-48 rounded-lg" />}
        {reasoning && (
          <div className="mb-2">
            {streaming && (
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-400" />
                </span>
                <span className="text-xs font-medium bg-gradient-to-r from-purple-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent animated-gradient">
                  <span className="verb-letters">
                    {reasoningVerb.split('').map((letter, i) => (
                      <span
                        key={i}
                        className={`verb-letter ${letter === ' ' ? 'mr-1' : ''}`}
                        style={{ '--delay': `${i * 0.08}s` }}
                      >
                        {letter}
                      </span>
                    ))}
                  </span>
                  <span className="dot-anim" />
                </span>
              </div>
            )}
            <div
              ref={reasoningRef}
              className="markdown-body markdown-reasoning text-xs text-gray-500 max-h-[7.2rem] overflow-y-auto rounded-lg border border-gray-700/50 bg-gray-900/50 p-2"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoning}</ReactMarkdown>
            </div>
          </div>
        )}
        {role === 'assistant' && content ? (
          <div className="markdown-body text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : null}
        {role === 'user' && (
          <pre className="whitespace-pre-wrap break-words text-sm">{content}</pre>
        )}
        {streaming && <span className="inline-block h-4 w-2 animate-pulse bg-white ml-0.5" />}
      </div>
      {role === 'user' && (
        <div className="mt-1 h-7 w-7 flex-shrink-0 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">
          U
        </div>
      )}
    </div>
  )
}

export const MessageList = forwardRef(({ messages }, ref) => (
  <div className="flex-1 overflow-y-auto message-scroll">
    {messages.length === 0 && (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-500">
        <div className="text-5xl">💬</div>
        <p className="text-sm">Connect to start chatting</p>
      </div>
    )}
    <div className="mx-auto max-w-3xl px-4 py-6">
      {messages.map((msg, i) => (
        <div key={i} className={`mb-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
          <MessageBubble {...msg} />
        </div>
      ))}
      <div ref={ref} />
    </div>
  </div>
))
