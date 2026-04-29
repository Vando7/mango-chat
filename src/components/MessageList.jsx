import { forwardRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MessageBubble = ({ role, content, reasoning, image, streaming }) => (
  <div className="flex gap-3">
    {role === 'assistant' && (
      <div className="mt-1 h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-xs font-bold text-white">
        AI
      </div>
    )}
    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${role === 'user' ? 'bg-purple-600/80 text-white' : 'bg-gray-800 text-gray-200'}`}>
      {image && <img src={image} alt="uploaded" className="mb-2 max-h-48 rounded-lg" />}
      {reasoning && (
        <details className="mb-2">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">💭 Reasoning</summary>
          <div className="markdown-body markdown-reasoning text-xs text-gray-500 mt-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoning}</ReactMarkdown>
          </div>
        </details>
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
