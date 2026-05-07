import { forwardRef, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronRight, MessagesSquare, Sparkles } from 'lucide-react'

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
  const reasoningContainerRef = useRef(null)
  const [reasoningVerb, setReasoningVerb] = useState(() =>
    REASONING_VERBS[Math.floor(Math.random() * REASONING_VERBS.length)]
  )
  const startedRef = useRef(false)
  const [reasoningExpanded, setReasoningExpanded] = useState(false)
  const [reasoningHeight, setReasoningHeight] = useState(0)

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
    <div className={`flex gap-3 message-enter ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      {role === 'assistant' && (
        <div className="brand-mark mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl">
          <Sparkles size={13} strokeWidth={2.25} className="relative z-10 text-white drop-shadow-sm" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 transition-shadow ${
          role === 'user'
            ? 'bg-gradient-to-br from-mango-500 to-amber-500 text-white shadow-lg shadow-mango-500/15'
            : 'border border-white/5 bg-white/[0.03] text-gray-100 shadow-sm'
        }`}
      >
        {image && <img src={image} alt="uploaded" className="mb-2 max-h-48 rounded-lg" />}
        {reasoning && (
          <div className="mb-2">
            {streaming && (
              <div className="mb-1 flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mango-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mango-400" />
                </span>
                <span className="text-xs font-medium text-mango-300">
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
                className="markdown-body markdown-reasoning text-xs text-gray-400 rounded-lg border border-white/5 bg-black/20 p-2"
                style={{ maxHeight: '7.2rem', overflowY: 'auto' }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoning}</ReactMarkdown>
              </div>
            ) : (
              <>
                <button
                  onClick={toggleReasoning}
                  className="reasoning-toggle mb-1 flex items-center gap-1 text-xs text-gray-500 hover:text-mango-300"
                >
                  <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className={`transition-transform duration-200 ${reasoningExpanded ? 'rotate-90' : ''}`}
                  />
                  {reasoningExpanded ? 'Hide' : 'Show'} reasoning
                </button>
                <div
                  ref={reasoningContainerRef}
                  className="overflow-hidden"
                  style={{
                    maxHeight: reasoningExpanded ? `${reasoningHeight}px` : '0px',
                    transition: 'max-height 0.25s ease',
                  }}
                >
                  <div
                    ref={reasoningContentRef}
                    className="markdown-body markdown-reasoning text-xs text-gray-400 rounded-lg border border-white/5 bg-black/20 p-2"
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
        {streaming && <span className="ml-0.5 inline-block h-4 w-[3px] animate-cursor-blink rounded-sm bg-mango-300" />}
      </div>
    </div>
  )
}

export const MessageList = forwardRef(({ messages }, ref) => (
  <div className="flex-1 overflow-y-auto message-scroll">
    {messages.length === 0 && (
      <div className="flex h-full flex-col items-center justify-center gap-5 text-gray-500">
        <div className="empty-glow flex h-20 w-20 items-center justify-center rounded-2xl">
          <MessagesSquare size={36} strokeWidth={1.5} className="text-mango-300" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-gray-300">Start a new conversation</p>
          <p className="mt-1 text-sm text-gray-500">Ask anything — your local model is ready.</p>
        </div>
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
