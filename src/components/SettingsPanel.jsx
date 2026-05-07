import { useState } from 'react'
import {
  Server, ChevronDown, ChevronUp, X, RefreshCw, Search,
  Cpu, Eye, Network, Wrench, Box, Loader2, Check,
} from 'lucide-react'

const formatContext = (n) => {
  if (!n || typeof n !== 'number') return null
  if (n >= 1_000_000) return `${(n / 1_048_576).toFixed(n % 1_048_576 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1024)}K`
  return `${n}`
}

const TypeBadge = ({ type }) => {
  const cfg = {
    llm:        { label: 'LLM', icon: Cpu,     color: 'bg-mango-500/15 text-mango-300 border-mango-500/25' },
    vlm:        { label: 'VLM', icon: Eye,     color: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
    embeddings: { label: 'EMB', icon: Network, color: 'bg-sky-500/15 text-sky-300 border-sky-500/25' },
  }[type] || { label: 'MODEL', icon: Box, color: 'bg-white/5 text-gray-400 border-white/10' }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cfg.color}`}>
      <Icon size={9} strokeWidth={2.25} />
      {cfg.label}
    </span>
  )
}

const StateDot = ({ state }) => {
  if (state === 'loaded') {
    return (
      <span className="relative flex h-1.5 w-1.5" title="Loaded">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
    )
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-600" title="Not loaded" />
}

const ModelCard = ({ model, selected, onSelect }) => {
  const ctx = formatContext(model.maxContext)
  const loadedCtx = formatContext(model.loadedContext)
  const hasTools = model.capabilities?.includes('tool_use')
  const isEmbeddings = model.type === 'embeddings'

  return (
    <button
      type="button"
      onClick={() => onSelect(model.id)}
      disabled={isEmbeddings}
      className={`model-card group relative w-full rounded-xl border p-3 text-left transition-all duration-200 ${
        selected
          ? 'border-mango-400/60 bg-mango-500/10 shadow-md shadow-mango-500/10 ring-1 ring-mango-400/40'
          : isEmbeddings
            ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50'
            : 'border-white/5 bg-white/[0.03] hover:-translate-y-0.5 hover:border-mango-400/30 hover:bg-white/[0.05] hover:shadow-md hover:shadow-mango-500/10'
      }`}
    >
      {selected && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-mango-400 to-amber-500 text-white shadow-md shadow-mango-500/40">
          <Check size={11} strokeWidth={3} />
        </span>
      )}

      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <StateDot state={model.state} />
          <TypeBadge type={model.type} />
        </div>
        {model.quantization && (
          <span className="flex-shrink-0 rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
            {model.quantization}
          </span>
        )}
      </div>

      <div className="truncate text-sm font-medium text-gray-100" title={model.id}>
        {model.id}
      </div>

      <div className="mt-0.5 truncate text-xs text-gray-500">
        {model.publisher && <span>{model.publisher}</span>}
        {model.publisher && model.arch && <span className="mx-1 text-gray-700">·</span>}
        {model.arch && <span className="font-mono">{model.arch}</span>}
        {model._manual && (
          <>
            <span className="mx-1 text-gray-700">·</span>
            <span className="text-amber-400/70">manual</span>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ctx && (
          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-gray-400">
            <span className="text-gray-500">ctx</span> {loadedCtx && model.state === 'loaded' ? `${loadedCtx}/` : ''}{ctx}
          </span>
        )}
        {hasTools && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-gray-400">
            <Wrench size={9} strokeWidth={2} />
            tools
          </span>
        )}
      </div>
    </button>
  )
}

export const SettingsPanel = ({
  serverUrl, setServerUrl, loading, error, connected,
  models, selectedModel, setSelectedModel, onConnect,
  minimized, onMinimize, onClose,
}) => {
  const [filter, setFilter] = useState('')
  const filterLower = filter.trim().toLowerCase()
  const filtered = filterLower
    ? models.filter((m) =>
        m.id.toLowerCase().includes(filterLower) ||
        m.publisher?.toLowerCase().includes(filterLower) ||
        m.arch?.toLowerCase().includes(filterLower)
      )
    : models

  const selectedEntry = models.find((m) => m.id === selectedModel)

  return (
    <div
      className={`settings-window absolute right-4 top-4 z-30 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-mango-panel/85 shadow-2xl shadow-black/40 backdrop-blur-xl ${
        minimized ? 'is-min' : ''
      }`}
    >
      {/* Header — always visible */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-gradient-to-r from-mango-500/10 via-amber-500/5 to-transparent px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-mango-500/20 text-mango-300">
            <Server size={12} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Settings
            </div>
            {minimized && selectedEntry && (
              <div className="truncate text-[11px] text-gray-500" title={selectedEntry.id}>
                {selectedEntry.id}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMinimize}
            className="icon-btn-sm"
            title={minimized ? 'Expand' : 'Minimize'}
            aria-label="Minimize"
          >
            {minimized ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronUp size={14} strokeWidth={2} />}
          </button>
          <button onClick={onClose} className="icon-btn-sm" title="Close" aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Body — hidden when minimized */}
      <div className={`settings-body ${minimized ? 'is-hidden' : ''}`}>
        <div className="space-y-3 p-3">
          {/* Server URL row */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Server
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Server size={13} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onConnect()}
                  placeholder="http://172.27.112.1:1234"
                  className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-xs text-white placeholder-gray-500 transition-all focus:border-mango-400/50 focus:bg-black/40 focus:outline-none focus:ring-2 focus:ring-mango-400/10"
                />
              </div>
              <button
                onClick={onConnect}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-mango-400 to-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-mango-500/20 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-mango-500/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                title="Reconnect"
              >
                <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
                {connected ? 'Reload' : 'Connect'}
              </button>
            </div>
            {error && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                {error}
              </p>
            )}
          </div>

          {/* Model picker */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Model · {models.length}
              </label>
              <div className="relative">
                <Search size={11} strokeWidth={2} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="filter..."
                  className="w-32 rounded-md border border-white/5 bg-black/20 py-0.5 pl-6 pr-2 text-[11px] text-gray-300 placeholder-gray-600 focus:border-mango-400/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="model-grid grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto message-scroll pr-0.5">
              {loading && filtered.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-500">
                  <Loader2 size={14} className="animate-spin text-mango-400" />
                  Loading models…
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-500">No models match.</div>
              ) : (
                filtered.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    selected={m.id === selectedModel}
                    onSelect={setSelectedModel}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
