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

const ChevronIcon = ({ expanded }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`}>
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MessageBubble = ({ role, content, reasoning, image, streaming }) => {
  const reasoningRef = useRef(null)
  const reasoningContainerRef = useRef(null)
  const [reasoningVerb, setReasoningVerb] = useState(() =>
    REASONING_VERBS[Math.floor(Math.random() * REASONING_VERBS.length)]
  )
  const startedRef = useRef(false)
  const [reasoningExpanded, setReasoningExpanded] = useState(false)
  const [reasoningHeight, setReasoningHeight] = useState(0)
  const isDone = !streaming && reasoning

  const reasoningContentRef = useRef(null)

  const toggleReasoning = () => {
    if (!reasoningExpanded) {
      // Expanding: measure content height
      setReasoningExpanded(true)
      setTimeout(() => {
        if (reasoningContentRef.current) {
          setReasoningHeight(reasoningContentRef.current.scrollHeight)
        }
      }, 10)
    } else {
      // Collapsing: reset height
      setReasoningHeight(0)
      setReasoningExpanded(false)
    }
  }

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
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5C4.14 1.5 1.75 3.9 1.75 6.75S4.14 12 7 12s5.25-2.4 5.25-5.25S9.86 1.5 7 1.5z" fill="currentColor"/>
            <circle cx="5" cy="6" r="1" fill="#0f0f0f"/>
            <circle cx="9" cy="6" r="1" fill="#0f0f0f"/>
            <path d="M5.5 8.5c0 0 0.75 1.25 1.5 1.25s1.5-1.25 1.5-1.25" stroke="#0f0f0f" strokeWidth="0.75" strokeLinecap="round"/>
          </svg>
        </div>
      )}
      <div className={`rounded-2xl px-4 py-2.5 ${role === 'user' ? 'bg-purple-600/80 text-white' : 'bg-gray-800 text-gray-200'}`}>
        {image && <img src={image} alt="uploaded" className="mb-2 max-h-48 rounded-lg" />}
        {reasoning && (
          <div className="mb-2">
            {streaming && (
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-400" />
                </span>
                <span className="text-xs font-medium text-purple-400">
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
            {streaming ? (
              <div
                ref={reasoningRef}
                className="markdown-body markdown-reasoning text-xs text-gray-500 rounded-lg border border-gray-700/50 bg-gray-900/50 p-2"
                style={{ maxHeight: '7.2rem', overflowY: 'auto' }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoning}</ReactMarkdown>
              </div>
            ) : (
              <>
                <button
                  onClick={toggleReasoning}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 reasoning-toggle mb-1"
                >
                  <ChevronIcon expanded={reasoningExpanded} />
                  {reasoningExpanded ? 'Hide' : 'Show'} reasoning
                </button>
                <div
                  ref={reasoningContainerRef}
                  className="overflow-hidden"
                  style={{
                    maxHeight: reasoningExpanded ? `${reasoningHeight}px` : '0px',
                    transition: 'max-height 0.2s ease',
                  }}
                >
                  <div
                    ref={reasoningContentRef}
                    className="markdown-body markdown-reasoning text-xs text-gray-500 rounded-lg border border-gray-700/50 bg-gray-900/50 p-2"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoning}</ReactMarkdown>
                  </div>
                </div>
              </>
            )}
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
    </div>
  )
}

export const MessageList = forwardRef(({ messages }, ref) => (
  <div className="flex-1 overflow-y-auto message-scroll">
    {messages.length === 0 && (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-500">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-gray-600">
          <path d="M6 8C6 5.79 7.79 4 10 4H38C40.21 4 42 5.79 42 8V28C42 30.21 40.21 32 38 32H20L14 38V32H10C7.79 32 6 30.21 6 28V8Z" fill="currentColor"/>
        </svg>
        <p className="text-sm">Connect to start chatting</p>
      </div>
    )}
    <div className="mx-auto max-w-3xl px-4 py-6">
      {messages.map((msg, i) => (
        <div key={i} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <MessageBubble {...msg} />
        </div>
      ))}
      <div ref={ref} />
    </div>
  </div>
))
