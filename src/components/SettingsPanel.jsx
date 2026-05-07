import { useState } from 'react'
import {
  Server, ChevronDown, ChevronUp, X, RefreshCw, Search,
  Cpu, Eye, Network, Wrench, Box, Loader2, Check,
  MessageSquareText, Pencil, Trash2, Plus, FileCode, Zap,
} from 'lucide-react'
import { fetchMcpConfig, saveMcpConfig } from '../api/mcp'

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

const ModelCard = ({ model, selected, onSelect, forcedTools, onToggleForcedTools }) => {
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
        {!isEmbeddings && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleForcedTools(model.id) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onToggleForcedTools(model.id)
              }
            }}
            className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
              forcedTools
                ? 'border-mango-400/40 bg-mango-500/15 text-mango-200 hover:bg-mango-500/25'
                : 'border-white/10 bg-white/[0.02] text-gray-500 hover:border-mango-400/30 hover:text-gray-300'
            }`}
            title={
              forcedTools
                ? 'Forcing prompt-injected tool calling on. The MCP catalog is prepended to the system prompt and tool calls are parsed back out of the model’s reply via inline-XML markup. Use for backends like Lemonade that don’t pass the OpenAI tools field through to the model. Click to disable.'
                : 'Force prompt-injected tool calling. Use this when the backend (e.g. Lemonade) doesn’t natively support OpenAI tool calls. Adds the MCP tool catalog to the system prompt; the inline-XML parser picks calls back out of the reply.'
            }
          >
            <Zap size={9} strokeWidth={2.25} />
            {forcedTools ? 'tools forced' : 'force tools'}
          </span>
        )}
      </div>
    </button>
  )
}

const PresetEditor = ({ initialName, initialContent, onSave, onCancel, saveLabel = 'Save' }) => {
  const [name, setName] = useState(initialName || '')
  const [content, setContent] = useState(initialContent || '')
  const canSave = name.trim().length > 0 && content.trim().length > 0
  return (
    <div className="rounded-lg border border-mango-400/30 bg-black/30 p-2 space-y-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name"
        className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white placeholder-gray-500 focus:border-mango-400/50 focus:outline-none focus:ring-2 focus:ring-mango-400/10"
        autoFocus
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="System prompt content…"
        rows={5}
        className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-mango-400/50 focus:outline-none focus:ring-2 focus:ring-mango-400/10"
      />
      <div className="flex justify-end gap-1.5">
        <button
          onClick={onCancel}
          className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.06]"
        >
          Cancel
        </button>
        <button
          onClick={() => canSave && onSave(name.trim(), content.trim())}
          disabled={!canSave}
          className="rounded-md bg-gradient-to-br from-mango-400 to-amber-500 px-2 py-1 text-[11px] font-medium text-white shadow-md shadow-mango-500/20 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

const PresetRow = ({ preset, active, onSelect, onEdit, onDelete }) => (
  <div
    className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-all ${
      active
        ? 'border-mango-400/60 bg-mango-500/10 ring-1 ring-mango-400/40'
        : 'border-white/5 bg-white/[0.03] hover:border-mango-400/30 hover:bg-white/[0.05]'
    }`}
  >
    <button
      type="button"
      onClick={onSelect}
      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      title={preset.content}
    >
      <span
        className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
          active ? 'border-mango-300 bg-gradient-to-br from-mango-400 to-amber-500' : 'border-white/20'
        }`}
      >
        {active && <Check size={9} strokeWidth={3} className="text-white" />}
      </span>
      <span className="truncate text-xs text-gray-100">{preset.name}</span>
    </button>
    <button
      onClick={onEdit}
      className="icon-btn-sm opacity-0 group-hover:opacity-100"
      title="Edit"
      aria-label="Edit preset"
    >
      <Pencil size={12} strokeWidth={2} />
    </button>
    <button
      onClick={onDelete}
      className="icon-btn-sm opacity-0 group-hover:opacity-100 hover:!text-red-400"
      title="Delete"
      aria-label="Delete preset"
    >
      <Trash2 size={12} strokeWidth={2} />
    </button>
  </div>
)

const DEFAULT_MCP_CONFIG = `{
  "mcpServers": {}
}
`

const McpConfigEditor = ({ onClose, onSaved }) => {
  const [content, setContent] = useState(null) // null = loading
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Defer initial load until the editor opens so we always see the latest
  // on-disk state (the user may have edited the file in another editor).
  if (content === null && !loadError) {
    fetchMcpConfig()
      .then((data) => {
        setContent(data.content || DEFAULT_MCP_CONFIG)
        setPath(data.path || '')
      })
      .catch((e) => setLoadError(e.message))
    return (
      <div className="rounded-lg border border-mango-400/30 bg-black/30 p-3 text-[11px] text-gray-400">
        Loading mcp.json…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-2 text-[11px] text-red-300">
        Failed to load: {loadError}
      </div>
    )
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const result = await saveMcpConfig(content)
      onSaved(result)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-mango-400/30 bg-black/30 p-2 space-y-1.5">
      {path && (
        <div className="truncate font-mono text-[10px] text-gray-500" title={path}>
          {path}
        </div>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        rows={12}
        className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-gray-200 placeholder-gray-600 focus:border-mango-400/50 focus:outline-none focus:ring-2 focus:ring-mango-400/10"
      />
      {error && (
        <div className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-[11px] text-red-300">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[10px] text-gray-500">
          Saving restarts every server in-process.
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.06] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-br from-mango-400 to-amber-500 px-2 py-1 text-[11px] font-medium text-white shadow-md shadow-mango-500/20 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save & Restart'}
          </button>
        </div>
      </div>
    </div>
  )
}

const McpServerRow = ({ server, tools }) => {
  const [expanded, setExpanded] = useState(false)
  const ready = server.ready
  const ownTools = tools.filter((t) =>
    t.function?.name?.startsWith(`mcp__${server.name}__`)
  )
  const tone = ready
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    : 'border-red-400/30 bg-red-400/10 text-red-300'
  return (
    <div className="overflow-hidden rounded-lg border border-white/5 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
        title={server.error || ''}
      >
        <Wrench size={11} strokeWidth={2} className={ready ? 'text-mango-300' : 'text-gray-500'} />
        <span className="truncate text-xs font-medium text-gray-100">{server.name}</span>
        <span className="ml-auto text-[10px] text-gray-500">
          {server.tools} tool{server.tools === 1 ? '' : 's'}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
          {ready ? 'ready' : 'error'}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={`text-gray-500 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-white/5 px-2 py-1.5 text-[11px]">
          {!ready && server.error && (
            <div className="mb-1 text-red-300">{server.error}</div>
          )}
          {ownTools.length === 0 && ready && (
            <div className="text-gray-500 italic">no tools registered</div>
          )}
          {ownTools.map((t) => (
            <div key={t.function.name} className="mb-1 last:mb-0">
              <div className="font-mono text-gray-200">{t.function.name.split('__').slice(2).join('__')}</div>
              {t.function.description && (
                <div className="text-gray-500">{t.function.description.split('\n')[0]}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const SettingsPanel = ({
  serverUrl, setServerUrl, loading, error, connected,
  models, selectedModel, setSelectedModel, onConnect,
  presets = [], activePresetId = null,
  onSetActivePreset, onCreatePreset, onUpdatePreset, onDeletePreset,
  mcpServers = [], mcpTools = [], mcpEnabledForModel = false, onMcpConfigSaved,
  forcedToolModels = new Set(), onToggleForcedTools = () => {},
  minimized, onMinimize, onClose,
}) => {
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const [editingMcpConfig, setEditingMcpConfig] = useState(false)
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

          {/* System Prompt presets */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <MessageSquareText size={11} strokeWidth={2} />
                System Prompt · {presets.length}
              </label>
              {!creating && editingId === null && (
                <button
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-mango-400/30 hover:bg-white/[0.06]"
                  title="New preset"
                >
                  <Plus size={10} strokeWidth={2.5} />
                  New
                </button>
              )}
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onSetActivePreset(null)}
                className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all ${
                  !activePresetId
                    ? 'border-mango-400/60 bg-mango-500/10 ring-1 ring-mango-400/40'
                    : 'border-white/5 bg-white/[0.03] hover:border-mango-400/30 hover:bg-white/[0.05]'
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
                    !activePresetId ? 'border-mango-300 bg-gradient-to-br from-mango-400 to-amber-500' : 'border-white/20'
                  }`}
                >
                  {!activePresetId && <Check size={9} strokeWidth={3} className="text-white" />}
                </span>
                <span className="truncate text-xs text-gray-400">None</span>
              </button>
              {presets.map((p) =>
                editingId === p.id ? (
                  <PresetEditor
                    key={p.id}
                    initialName={p.name}
                    initialContent={p.content}
                    onSave={async (name, content) => {
                      await onUpdatePreset(p.id, name, content)
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <PresetRow
                    key={p.id}
                    preset={p}
                    active={p.id === activePresetId}
                    onSelect={() => onSetActivePreset(p.id)}
                    onEdit={() => { setEditingId(p.id); setCreating(false) }}
                    onDelete={() => onDeletePreset(p.id)}
                  />
                )
              )}
              {creating && (
                <PresetEditor
                  saveLabel="Create"
                  onSave={async (name, content) => {
                    const created = await onCreatePreset(name, content)
                    if (created) onSetActivePreset(created.id)
                    setCreating(false)
                  }}
                  onCancel={() => setCreating(false)}
                />
              )}
            </div>
          </div>

          {/* MCP servers — read-only indicator + inline mcp.json editor. */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Wrench size={11} strokeWidth={2} />
                MCP Tools · {mcpTools.length}
              </label>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                    mcpEnabledForModel && mcpTools.length > 0
                      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/10 bg-white/[0.03] text-gray-500'
                  }`}
                  title={
                    mcpTools.length === 0
                      ? 'No MCP tools registered (check mcp.json + dev-server logs)'
                      : mcpEnabledForModel
                        ? 'Tools will be sent to the model on the next request'
                        : 'Selected model does not advertise tool_use capability'
                  }
                >
                  {mcpTools.length === 0
                    ? 'none'
                    : mcpEnabledForModel
                      ? 'sent to model'
                      : 'model has no tool_use'}
                </span>
                {!editingMcpConfig && (
                  <button
                    onClick={() => setEditingMcpConfig(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-mango-400/30 hover:bg-white/[0.06]"
                    title="Edit mcp.json"
                  >
                    <FileCode size={10} strokeWidth={2} />
                    Edit
                  </button>
                )}
              </div>
            </div>
            {editingMcpConfig ? (
              <McpConfigEditor
                onClose={() => setEditingMcpConfig(false)}
                onSaved={(result) => onMcpConfigSaved?.(result)}
              />
            ) : mcpServers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/5 bg-white/[0.02] px-2 py-2 text-[11px] text-gray-500">
                No MCP servers configured. Click <span className="font-mono text-gray-400">Edit</span> above to set up <span className="font-mono text-gray-400">mcp.json</span>.
              </div>
            ) : (
              <div className="space-y-1">
                {mcpServers.map((s) => (
                  <McpServerRow key={s.name} server={s} tools={mcpTools} />
                ))}
              </div>
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
                    forcedTools={forcedToolModels.has(m.id)}
                    onToggleForcedTools={onToggleForcedTools}
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
